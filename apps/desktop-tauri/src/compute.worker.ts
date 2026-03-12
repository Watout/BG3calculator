import { tryParseDiceExpression, type ParsedDiceExpression } from "@bg3dc/dice-parser";
import { calculateAttackDamage } from "@bg3dc/domain";
import {
  applyEffects,
  bg3AttackRules,
  makeAttackBonusEffect,
  makeCriticalThresholdEffect,
  makeDamageDiceRollModeEffect,
  makeDamageRollCountEffect,
  makeHalflingLuckyEffect,
  summarizeProbabilities
} from "@bg3dc/rulesets";

export type AdvantageState = "normal" | "advantage" | "disadvantage";
export type DamageDiceMode = "normal" | "advantage" | "disadvantage";
export type DamageModifier = "normal" | "resistant" | "vulnerable" | "immune";

export interface AttackPlanEntryInput {
  readonly id: string;
  readonly mainHandRepeatText: string;
  readonly offHandRepeatText: string;
  readonly mainHandAttackBonusExprText: string;
  readonly offHandAttackBonusExprText: string;
  readonly armorClassText: string;
  readonly mainHandDamageExprText: string;
  readonly offHandDamageExprText: string;
  readonly advantageState: AdvantageState;
  readonly damageDiceMode: DamageDiceMode;
  readonly damageRollCountText: string;
  readonly criticalThresholdText: string;
  readonly halflingLucky: boolean;
  readonly modifier: DamageModifier;
}

export interface ComputeInput {
  readonly entries: readonly AttackPlanEntryInput[];
  readonly planCountText: string;
  readonly requestId: number;
}

export interface ComputeEntrySuccess {
  readonly id: string;
  readonly hasOffHandStep: boolean;
  readonly mainHandRepeat: number;
  readonly offHandRepeat: number;
  readonly expectedMainHand: string;
  readonly expectedMainHandTotal: string;
  readonly expectedOffHand: string;
  readonly expectedOffHandTotal: string;
  readonly expectedPerEntry: string;
  readonly expectedOnHitMainHand: string;
  readonly expectedOnCritMainHand: string;
  readonly expectedOnHitOffHand: string;
  readonly expectedOnCritOffHand: string;
  readonly mainHandProbabilitySummary: string;
  readonly offHandProbabilitySummary: string;
  readonly templateSummary: string;
}

export interface ComputeSuccess {
  readonly ok: true;
  readonly requestId: number;
  readonly expectedPerPlan: string;
  readonly expectedTotal: string;
  readonly fullCritExpectedPerPlan: string;
  readonly fullCritExpectedTotal: string;
  readonly entries: readonly ComputeEntrySuccess[];
}

export interface ComputeFailure {
  readonly ok: false;
  readonly requestId: number;
  readonly errorMessage: string;
}

export type ComputeOutput = ComputeSuccess | ComputeFailure;

function asFailure(requestId: number, errorMessage: string): ComputeFailure {
  return {
    ok: false,
    requestId,
    errorMessage
  };
}

function parseIntegerText(value: string): number {
  return Math.floor(Number(value));
}

function validateRepeatText(
  value: string,
  requestId: number,
  label: string
): number | ComputeFailure {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return asFailure(requestId, `${label}执行次数必须是大于等于 1 的有限整数`);
  }

  return Math.max(1, Math.floor(parsed));
}

function calculateGuaranteedCriticalExpected(
  expectedOnCritical: number,
  repeat: number
): number {
  return expectedOnCritical * repeat;
}

interface ComputedEntryInternal {
  readonly entry: ComputeEntrySuccess;
  readonly expectedPerEntryValue: number;
  readonly fullCritExpectedPerEntryValue: number;
}

function computeOneEntry(
  entry: AttackPlanEntryInput,
  requestId: number,
  index: number
): ComputedEntryInternal | ComputeFailure {
  const label = `第 ${index + 1} 项`;
  const mainHandRepeat = validateRepeatText(entry.mainHandRepeatText, requestId, `${label}主手`);
  if (typeof mainHandRepeat !== "number") {
    return mainHandRepeat;
  }

  const parsedMainHandDamage = tryParseDiceExpression(entry.mainHandDamageExprText);
  if (!parsedMainHandDamage.ok) {
    return asFailure(requestId, `${label}主手伤害表达式错误：${parsedMainHandDamage.error.message}`);
  }

  const parsedMainHandAttackBonusExpression = tryParseDiceExpression(entry.mainHandAttackBonusExprText);
  if (!parsedMainHandAttackBonusExpression.ok) {
    return asFailure(
      requestId,
      `${label}主手攻击加值表达式错误：${parsedMainHandAttackBonusExpression.error.message}`
    );
  }

  const parsedArmorClass = Number(entry.armorClassText);
  if (!Number.isFinite(parsedArmorClass)) {
    return asFailure(requestId, `${label}目标 AC 必须是数字`);
  }

  const parsedRollCount = Number(entry.damageRollCountText);
  if (
    entry.damageDiceMode !== "normal" &&
    (!Number.isFinite(parsedRollCount) || parsedRollCount < 2 || parsedRollCount > 5)
  ) {
    return asFailure(requestId, `${label}多掷取高/低次数必须在 2 到 5 之间`);
  }

  const parsedCriticalThreshold = Number(entry.criticalThresholdText);
  if (
    !Number.isFinite(parsedCriticalThreshold) ||
    parsedCriticalThreshold < 1 ||
    parsedCriticalThreshold > 20
  ) {
    return asFailure(requestId, `${label}重击阈值必须在 1 到 20 之间`);
  }

  const effectiveRollCount =
    entry.damageDiceMode === "normal"
      ? 1
      : Math.max(2, Math.min(5, Math.floor(parsedRollCount)));

  const safeCriticalThreshold = Math.max(1, Math.min(20, Math.floor(parsedCriticalThreshold)));

  const offHandText = entry.offHandDamageExprText.trim();
  let parsedOffHandDamageValue: ParsedDiceExpression | null = null;
  let parsedOffHandAttackBonusExpressionValue: ParsedDiceExpression | null = null;
  let offHandRepeat = 0;
  if (offHandText.length > 0) {
    const parsedOffHandRepeat = validateRepeatText(entry.offHandRepeatText, requestId, `${label}副手`);
    if (typeof parsedOffHandRepeat !== "number") {
      return parsedOffHandRepeat;
    }

    const parsedOffHandDamage = tryParseDiceExpression(offHandText);
    if (!parsedOffHandDamage.ok) {
      return asFailure(requestId, `${label}副手伤害表达式错误：${parsedOffHandDamage.error.message}`);
    }

    const parsedOffHandAttackBonusExpression = tryParseDiceExpression(entry.offHandAttackBonusExprText);
    if (!parsedOffHandAttackBonusExpression.ok) {
      return asFailure(
        requestId,
        `${label}副手攻击加值表达式错误：${parsedOffHandAttackBonusExpression.error.message}`
      );
    }

    offHandRepeat = parsedOffHandRepeat;
    parsedOffHandDamageValue = parsedOffHandDamage.value;
    parsedOffHandAttackBonusExpressionValue = parsedOffHandAttackBonusExpression.value;
  }

  const sharedEffects = [
    makeAttackBonusEffect(`ui-extra-${entry.id}`, 0),
    makeDamageDiceRollModeEffect(`ui-damage-mode-${entry.id}`, entry.damageDiceMode),
    makeDamageRollCountEffect(`ui-roll-count-${entry.id}`, effectiveRollCount),
    makeCriticalThresholdEffect(`ui-critical-threshold-${entry.id}`, safeCriticalThreshold),
    makeHalflingLuckyEffect(`ui-halfling-lucky-${entry.id}`, entry.halflingLucky)
  ];

  const baseContext = {
    attack: {
      attackBonusExpression: parsedMainHandAttackBonusExpression.value,
      armorClass: parsedArmorClass,
      advantageState: entry.advantageState,
      rules: bg3AttackRules,
      halflingLucky: entry.halflingLucky
    },
    damage: {
      expression: parsedMainHandDamage.value,
      criticalDiceMultiplier: 2,
      modifier: entry.modifier,
      diceRollMode: entry.damageDiceMode,
      damageRollCount: effectiveRollCount
    }
  };

  const mainHandContext = applyEffects(baseContext, sharedEffects);
  const mainHandResult = calculateAttackDamage({
    attack: mainHandContext.attack,
    damage: mainHandContext.damage
  });
  let useOffHand = false;
  let offHandResult: ReturnType<typeof calculateAttackDamage> | null = null;

  if (parsedOffHandDamageValue !== null) {
    useOffHand = true;
    const offHandContext = applyEffects({
      attack: {
        ...baseContext.attack,
        attackBonusExpression:
          parsedOffHandAttackBonusExpressionValue ?? parsedMainHandAttackBonusExpression.value
      },
      damage: {
        ...baseContext.damage,
        expression: parsedOffHandDamageValue
      }
    }, sharedEffects);

    offHandResult = calculateAttackDamage({
      attack: offHandContext.attack,
      damage: offHandContext.damage
    });
  }

  const resolvedMainHandRepeat = mainHandRepeat;
  const resolvedOffHandRepeat = useOffHand ? offHandRepeat : 0;

  const expectedMainHandValue = mainHandResult.expectedDamagePerAttack;
  const expectedOffHandValue = offHandResult?.expectedDamagePerAttack ?? 0;
  const expectedMainHandTotalValue = expectedMainHandValue * resolvedMainHandRepeat;
  const expectedOffHandTotalValue = expectedOffHandValue * resolvedOffHandRepeat;
  const expectedPerEntryValue = expectedMainHandTotalValue + expectedOffHandTotalValue;
  const expectedOnHitMainHandValue = mainHandResult.expectedDamageOnHit;
  const expectedOnCritMainHandValue = mainHandResult.expectedDamageOnCritical;
  const expectedOnHitOffHandValue = offHandResult?.expectedDamageOnHit ?? 0;
  const expectedOnCritOffHandValue = offHandResult?.expectedDamageOnCritical ?? 0;
  const mainProbabilities = mainHandResult.probabilities;
  const offHandProbabilities = offHandResult?.probabilities ?? null;

  const fullCritExpectedPerEntryValue =
    calculateGuaranteedCriticalExpected(expectedOnCritMainHandValue, resolvedMainHandRepeat) +
    calculateGuaranteedCriticalExpected(expectedOnCritOffHandValue, resolvedOffHandRepeat);

  const templateSummary = useOffHand ? "主手 + 副手" : "副手留空，已回退为仅主手";

  return {
    expectedPerEntryValue,
    fullCritExpectedPerEntryValue,
    entry: {
      id: entry.id,
      hasOffHandStep: useOffHand,
      mainHandRepeat: resolvedMainHandRepeat,
      offHandRepeat: resolvedOffHandRepeat,
      expectedMainHand: expectedMainHandValue.toFixed(4),
      expectedMainHandTotal: expectedMainHandTotalValue.toFixed(4),
      expectedOffHand: expectedOffHandValue.toFixed(4),
      expectedOffHandTotal: expectedOffHandTotalValue.toFixed(4),
      expectedPerEntry: expectedPerEntryValue.toFixed(4),
      expectedOnHitMainHand: expectedOnHitMainHandValue.toFixed(4),
      expectedOnCritMainHand: expectedOnCritMainHandValue.toFixed(4),
      expectedOnHitOffHand: expectedOnHitOffHandValue.toFixed(4),
      expectedOnCritOffHand: expectedOnCritOffHandValue.toFixed(4),
      mainHandProbabilitySummary: summarizeProbabilities(mainProbabilities),
      offHandProbabilitySummary:
        offHandProbabilities === null ? "-" : summarizeProbabilities(offHandProbabilities),
      templateSummary
    }
  };
}

export function computeAttackPlan(input: ComputeInput): ComputeOutput {
  if (input.entries.length < 1) {
    return asFailure(input.requestId, "至少需要 1 个攻击项");
  }

  const parsedPlanCount = Number(input.planCountText);
  if (!Number.isFinite(parsedPlanCount) || parsedPlanCount < 1) {
    return asFailure(input.requestId, "模板执行次数必须是大于等于 1 的有限整数");
  }

  const safePlanCount = Math.max(1, parseIntegerText(input.planCountText));
  const computedEntries: ComputeEntrySuccess[] = [];
  let expectedPerPlanValue = 0;
  let fullCritExpectedPerPlanValue = 0;

  for (let index = 0; index < input.entries.length; index += 1) {
    const entry = input.entries[index];
    if (entry === undefined) {
      continue;
    }

    const result = computeOneEntry(entry, input.requestId, index);
    if ("ok" in result) {
      return result;
    }

    computedEntries.push(result.entry);
    expectedPerPlanValue += result.expectedPerEntryValue;
    fullCritExpectedPerPlanValue += result.fullCritExpectedPerEntryValue;
  }

  const expectedTotalValue = expectedPerPlanValue * safePlanCount;
  const fullCritExpectedTotalValue = fullCritExpectedPerPlanValue * safePlanCount;

  return {
    ok: true,
    requestId: input.requestId,
    expectedPerPlan: expectedPerPlanValue.toFixed(4),
    expectedTotal: expectedTotalValue.toFixed(4),
    fullCritExpectedPerPlan: fullCritExpectedPerPlanValue.toFixed(4),
    fullCritExpectedTotal: fullCritExpectedTotalValue.toFixed(4),
    entries: computedEntries
  };
}

if (typeof self !== "undefined") {
  self.onmessage = (event: MessageEvent<ComputeInput>): void => {
    const result = computeAttackPlan(event.data);
    self.postMessage(result);
  };
}
