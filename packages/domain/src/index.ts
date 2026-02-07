import type { ExpressionComponent, ParsedDiceExpression } from "@bg3dc/dice-parser";
import {
  convolve,
  constant,
  expectation,
  fromEntries,
  maxOfIndependent,
  minOfIndependent,
  mapOutcomes,
  probabilityAtLeast,
  repeatConvolve,
  shift,
  uniformDie,
  type ProbabilityDistribution
} from "@bg3dc/prob";

export type AdvantageState = "normal" | "advantage" | "disadvantage";
export type DamageModifier = "normal" | "resistant" | "vulnerable" | "immune";
export type DamageDiceRollMode = "normal" | "advantage" | "disadvantage";

export interface AttackRollRuleConfig {
  readonly dieSides: number;
  readonly autoMissFaces: readonly number[];
  readonly autoCritFaces: readonly number[];
}

export interface AttackCheckInput {
  readonly armorClass: number;
  readonly attackBonusExpression: ParsedDiceExpression | readonly ExpressionComponent[];
  readonly advantageState: AdvantageState;
  readonly rules: AttackRollRuleConfig;
  readonly halflingLucky?: boolean;
}

export interface AttackOutcomeProbabilities {
  readonly miss: number;
  readonly hit: number;
  readonly critical: number;
}

export interface DamageModel {
  readonly expression: ParsedDiceExpression | readonly ExpressionComponent[];
  readonly criticalDiceMultiplier: number;
  readonly modifier: DamageModifier;
  readonly diceRollMode?: DamageDiceRollMode;
  readonly damageRollCount?: number;
  readonly rerollLowThreshold?: number;
}

export interface AttackDamageRequest {
  readonly attack: AttackCheckInput;
  readonly damage: DamageModel;
}

export interface AttackDamageResult {
  readonly probabilities: AttackOutcomeProbabilities;
  readonly hitDamageDistribution: ProbabilityDistribution;
  readonly criticalDamageDistribution: ProbabilityDistribution;
  readonly totalDamageDistribution: ProbabilityDistribution;
  readonly expectedDamageOnHit: number;
  readonly expectedDamageOnCritical: number;
  readonly expectedDamagePerAttack: number;
}

export interface AttackDamagePlanStep {
  readonly request: AttackDamageRequest;
  readonly repeat?: number;
}

export interface AttackDamagePlanStepResult {
  readonly request: AttackDamageRequest;
  readonly repeat: number;
  readonly result: AttackDamageResult;
  readonly totalDamageDistribution: ProbabilityDistribution;
  readonly expectedDamageTotal: number;
}

export interface AttackDamagePlanResult {
  readonly steps: readonly AttackDamagePlanStepResult[];
  readonly totalDamageDistribution: ProbabilityDistribution;
  readonly expectedDamagePerPlan: number;
}

export interface SaveCheckInput {
  readonly difficultyClass: number;
  readonly saveBonus: number;
}

export interface SaveDamageResult {
  readonly saveSuccessProbability: number;
  readonly saveFailProbability: number;
  readonly expectedDamage: number;
}

function asComponents(expression: ParsedDiceExpression | readonly ExpressionComponent[]): readonly ExpressionComponent[] {
  return "components" in expression ? expression.components : expression;
}

function validateAttackRules(config: AttackRollRuleConfig): void {
  if (!Number.isInteger(config.dieSides) || config.dieSides <= 1) {
    throw new Error("dieSides must be an integer greater than 1");
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function calculateSingleRollAttackProbabilities(
  armorClass: number,
  attackBonus: number,
  criticalThreshold: number
): AttackOutcomeProbabilities {
  const threshold = armorClass - attackBonus;
  const critChance = clamp01((21 - criticalThreshold) / 20);
  const nonCritChance = clamp01(Math.max(0, criticalThreshold - Math.max(2, threshold)) / 20);

  return {
    miss: clamp01(1 - critChance - nonCritChance),
    hit: nonCritChance,
    critical: critChance
  };
}

function probabilityOfFace(
  singleDieDistribution: readonly number[],
  face: number,
  advantageState: AdvantageState
): number {
  const singleFace = singleDieDistribution[face] ?? 0;

  if (advantageState === "normal") {
    return singleFace;
  }

  let cdfAtFace = 0;
  let cdfBeforeFace = 0;

  for (let value = 1; value <= singleDieDistribution.length - 1; value += 1) {
    const probability = singleDieDistribution[value] ?? 0;
    cdfAtFace += probability;

    if (value < face) {
      cdfBeforeFace += probability;
    }

    if (value >= face) {
      break;
    }
  }

  if (advantageState === "advantage") {
    return cdfAtFace * cdfAtFace - cdfBeforeFace * cdfBeforeFace;
  }

  const atLeastFace = 1 - cdfBeforeFace;
  const aboveFace = 1 - cdfAtFace;
  return atLeastFace * atLeastFace - aboveFace * aboveFace;
}

function buildSingleDieDistribution(
  dieSides: number,
  halflingLucky: boolean
): readonly number[] {
  const distribution = new Array<number>(dieSides + 1).fill(0);
  const baseProbability = 1 / dieSides;

  if (!halflingLucky) {
    for (let face = 1; face <= dieSides; face += 1) {
      distribution[face] = baseProbability;
    }

    return distribution;
  }

  const rerollSameFace = baseProbability * baseProbability;
  distribution[1] = rerollSameFace;

  for (let face = 2; face <= dieSides; face += 1) {
    distribution[face] = baseProbability + rerollSameFace;
  }

  return distribution;
}

function buildAttackBonusDistribution(
  expression: ParsedDiceExpression | readonly ExpressionComponent[]
): ProbabilityDistribution {
  const components = asComponents(expression);
  let distribution = constant(0);

  for (const component of components) {
    if (component.kind === "constant") {
      distribution = shift(distribution, component.value);
      continue;
    }

    let diceDistribution = repeatConvolve(uniformDie(component.sides), component.count);
    if (component.sign < 0) {
      diceDistribution = mapOutcomes(diceDistribution, (outcome: number) => -outcome);
    }

    distribution = convolve(distribution, diceDistribution);
  }

  return distribution;
}

export function calculateAttackOutcomeProbabilities(input: AttackCheckInput): AttackOutcomeProbabilities {
  validateAttackRules(input.rules);

  const halflingLucky = input.halflingLucky === true;
  const attackBonusDistribution = buildAttackBonusDistribution(input.attackBonusExpression);

  const autoMissFaces = new Set(input.rules.autoMissFaces);
  const autoCritFaces = new Set(input.rules.autoCritFaces);
  const singleDieDistribution = buildSingleDieDistribution(input.rules.dieSides, halflingLucky);

  let miss = 0;
  let hit = 0;
  let critical = 0;

  for (let face = 1; face <= input.rules.dieSides; face += 1) {
    const chance = probabilityOfFace(singleDieDistribution, face, input.advantageState);
    const isAutoMiss = autoMissFaces.has(face);
    const isAutoCrit = autoCritFaces.has(face);

    if (isAutoMiss) {
      miss += chance;
      continue;
    }

    if (isAutoCrit) {
      critical += chance;
      continue;
    }

    const neededBonus = input.armorClass - face;
    const hitChanceGivenFace = probabilityAtLeast(attackBonusDistribution, neededBonus);
    hit += chance * hitChanceGivenFace;
    miss += chance * (1 - hitChanceGivenFace);
  }

  return { miss, hit, critical };
}

function buildRerollLowDieDistribution(
  sides: number,
  rerollLowThreshold: number | undefined
): ProbabilityDistribution {
  if (rerollLowThreshold === undefined || rerollLowThreshold <= 0) {
    return uniformDie(sides);
  }

  const threshold = Math.min(sides, Math.floor(rerollLowThreshold));
  const entries = [] as Array<{ outcome: number; probability: number }>;

  for (let face = 1; face <= sides; face += 1) {
    const isLow = face <= threshold;
    const probability = isLow ? threshold / (sides * sides) : 1 / sides + threshold / (sides * sides);
    entries.push({ outcome: face, probability });
  }

  return fromEntries(entries);
}

export function applyDamageModifier(rawDamage: number, modifier: DamageModifier): number {
  const sanitized = Math.max(0, Math.floor(rawDamage));

  if (modifier === "immune") {
    return 0;
  }

  if (modifier === "resistant") {
    return Math.floor(sanitized / 2);
  }

  if (modifier === "vulnerable") {
    return sanitized * 2;
  }

  return sanitized;
}

function buildNonCriticalDamageModel(model: DamageModel): DamageModel {
  return {
    ...model,
    criticalDiceMultiplier: 1
  };
}

function buildCriticalDamageModel(model: DamageModel): DamageModel {
  return {
    ...model,
    criticalDiceMultiplier: model.criticalDiceMultiplier
  };
}

export function buildDamageDistribution(
  expression: ParsedDiceExpression | readonly ExpressionComponent[],
  criticalDiceMultiplier: number,
  rerollLowThreshold?: number
): ProbabilityDistribution {
  if (!Number.isInteger(criticalDiceMultiplier) || criticalDiceMultiplier <= 0) {
    throw new Error("criticalDiceMultiplier must be a positive integer");
  }

  const components = asComponents(expression);
  let distribution = constant(0);

  for (const component of components) {
    if (component.kind === "constant") {
      distribution = shift(distribution, component.value);
      continue;
    }

    const effectiveCount = component.count * criticalDiceMultiplier;
    const dieDistribution = buildRerollLowDieDistribution(component.sides, rerollLowThreshold);
    let diceDistribution = repeatConvolve(dieDistribution, effectiveCount);

    if (component.sign < 0) {
      diceDistribution = mapOutcomes(diceDistribution, (outcome: number) => -outcome);
    }

    distribution = convolve(distribution, diceDistribution);
  }

  return distribution;
}

function applyModifierToDistribution(
  distribution: ProbabilityDistribution,
  modifier: DamageModifier
): ProbabilityDistribution {
  return mapOutcomes(distribution, (outcome: number) => applyDamageModifier(outcome, modifier));
}

function resolveDiceRollMode(mode: DamageDiceRollMode | undefined): DamageDiceRollMode {
  return mode ?? "normal";
}

function resolveDamageRollCount(mode: DamageDiceRollMode, count: number | undefined): number {
  if (count !== undefined) {
    const normalized = Math.max(1, Math.floor(count));
    return normalized;
  }

  return mode === "normal" ? 1 : 2;
}

function normalizeStepRepeat(repeat: number | undefined): number {
  if (repeat === undefined) {
    return 1;
  }

  if (!Number.isFinite(repeat)) {
    throw new Error("repeat must be a finite number");
  }

  const normalized = Math.floor(repeat);
  if (normalized < 1) {
    throw new Error("repeat must be at least 1");
  }

  return normalized;
}

export function applyDamageDiceRollMode(
  distribution: ProbabilityDistribution,
  mode: DamageDiceRollMode,
  rollCount = 2
): ProbabilityDistribution {
  if (mode === "normal") {
    return distribution;
  }

  if (rollCount <= 1) {
    return distribution;
  }

  if (mode === "disadvantage") {
    return minOfIndependent(distribution, rollCount);
  }

  return maxOfIndependent(distribution, rollCount);
}

export function calculateSaveSuccessProbability(input: SaveCheckInput): number {
  const threshold = input.difficultyClass - input.saveBonus;
  return clamp01((21 - Math.ceil(threshold)) / 20);
}

export function calculateSaveExpectedDamage(
  input: SaveCheckInput,
  failDamageMean: number,
  successDamageMean: number
): SaveDamageResult {
  const saveSuccessProbability = calculateSaveSuccessProbability(input);
  const saveFailProbability = 1 - saveSuccessProbability;

  return {
    saveSuccessProbability,
    saveFailProbability,
    expectedDamage:
      saveFailProbability * failDamageMean +
      saveSuccessProbability * successDamageMean
  };
}

export function expectedSingleDieMean(sides: number): number {
  return (sides + 1) / 2;
}

export function expectedGwfSingleDieMean(sides: number): number {
  return ((sides + 1) * (sides + 2) - 6) / (2 * sides);
}

export function expectedMaxOfTwoSingleDieMean(sides: number): number {
  return ((sides + 1) * (4 * sides - 1)) / (6 * sides);
}

export function calculateAttackDamage(request: AttackDamageRequest): AttackDamageResult {
  const probabilities = calculateAttackOutcomeProbabilities(request.attack);
  const diceRollMode = resolveDiceRollMode(request.damage.diceRollMode);
  const damageRollCount = resolveDamageRollCount(diceRollMode, request.damage.damageRollCount);
  const nonCriticalDamageModel = buildNonCriticalDamageModel(request.damage);
  const criticalDamageModel = buildCriticalDamageModel(request.damage);

  const rawHitDistribution = applyDamageDiceRollMode(
    buildDamageDistribution(
      nonCriticalDamageModel.expression,
      nonCriticalDamageModel.criticalDiceMultiplier,
      nonCriticalDamageModel.rerollLowThreshold
    ),
    diceRollMode,
    damageRollCount
  );
  const rawCritDistribution = applyDamageDiceRollMode(
    buildDamageDistribution(
      criticalDamageModel.expression,
      criticalDamageModel.criticalDiceMultiplier,
      criticalDamageModel.rerollLowThreshold
    ),
    diceRollMode,
    damageRollCount
  );

  const hitDamageDistribution = applyModifierToDistribution(rawHitDistribution, request.damage.modifier);
  const criticalDamageDistribution = applyModifierToDistribution(
    rawCritDistribution,
    request.damage.modifier
  );

  const weightedEntries = [
    { outcome: 0, probability: probabilities.miss },
    ...hitDamageDistribution.entries.map((entry) => ({
      outcome: entry.outcome,
      probability: entry.probability * probabilities.hit
    })),
    ...criticalDamageDistribution.entries.map((entry) => ({
      outcome: entry.outcome,
      probability: entry.probability * probabilities.critical
    }))
  ];

  const totalDamageDistribution = fromEntries(weightedEntries);
  const expectedDamageOnHit = expectation(hitDamageDistribution);
  const expectedDamageOnCritical = expectation(criticalDamageDistribution);

  const expectedDamagePerAttackBase =
    probabilities.hit * expectedDamageOnHit +
    probabilities.critical * expectedDamageOnCritical;

  return {
    probabilities,
    hitDamageDistribution,
    criticalDamageDistribution,
    totalDamageDistribution,
    expectedDamageOnHit,
    expectedDamageOnCritical,
    expectedDamagePerAttack: expectedDamagePerAttackBase
  };
}

export function calculateAttackDamagePlan(
  steps: readonly AttackDamagePlanStep[]
): AttackDamagePlanResult {
  let totalDamageDistribution = constant(0);
  const resolvedSteps: AttackDamagePlanStepResult[] = [];

  for (const step of steps) {
    const repeat = normalizeStepRepeat(step.repeat);
    const result = calculateAttackDamage(step.request);
    const repeatedDistribution = repeatConvolve(result.totalDamageDistribution, repeat);
    const expectedDamageTotal = result.expectedDamagePerAttack * repeat;

    resolvedSteps.push({
      request: step.request,
      repeat,
      result,
      totalDamageDistribution: repeatedDistribution,
      expectedDamageTotal
    });

    totalDamageDistribution = convolve(totalDamageDistribution, repeatedDistribution);
  }

  return {
    steps: resolvedSteps,
    totalDamageDistribution,
    expectedDamagePerPlan: expectation(totalDamageDistribution)
  };
}
