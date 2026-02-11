import { tryParseDiceExpression, type ParsedDiceExpression } from "@bg3dc/dice-parser";
import {
  bg3AttackRules,
  makeAttackBonusEffect,
  makeCriticalThresholdEffect,
  makeDamageDiceRollModeEffect,
  makeDamageRollCountEffect,
  makeDualWieldTemplate,
  makeHalflingLuckyEffect,
  resolveBg3AttackTemplate,
  summarizeProbabilities
} from "@bg3dc/rulesets";

export type AttackBonusDie = "none" | "1d4" | "1d6" | "1d8" | "1d10" | "1d12";
export type AdvantageState = "normal" | "advantage" | "disadvantage";
export type DamageDiceMode = "normal" | "advantage" | "disadvantage";
export type DamageModifier = "normal" | "resistant" | "vulnerable" | "immune";

export interface AttackPlanEntryInput {
  readonly id: string;
  readonly mainHandAttackBonusFixedText: string;
  readonly mainHandAttackBonusDie: AttackBonusDie;
  readonly offHandAttackBonusFixedText: string;
  readonly offHandAttackBonusDie: AttackBonusDie;
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
  readonly expectedMainHand: string;
  readonly expectedOffHand: string;
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

function buildAttackBonusExpressionText(
  fixedText: string,
  die: AttackBonusDie
): string {
  if (die === "none") {
    return fixedText;
  }

  return `${fixedText}+${die}`;
}

interface ComputedEntryInternal {
  readonly entry: ComputeEntrySuccess;
  readonly expectedPerEntryValue: number;
}

function computeOneEntry(
  entry: AttackPlanEntryInput,
  requestId: number,
  index: number
): ComputedEntryInternal | ComputeFailure {
  const label = `第 ${index + 1} 项`;

  const parsedMainHandDamage = tryParseDiceExpression(entry.mainHandDamageExprText);
  if (!parsedMainHandDamage.ok) {
    return asFailure(requestId, `${label}主手伤害表达式错误：${parsedMainHandDamage.error.message}`);
  }

  const mainHandAttackBonusExpressionText = buildAttackBonusExpressionText(
    entry.mainHandAttackBonusFixedText,
    entry.mainHandAttackBonusDie
  );
  const parsedMainHandAttackBonusExpression = tryParseDiceExpression(mainHandAttackBonusExpressionText);
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
    parsedCriticalThreshold < 10 ||
    parsedCriticalThreshold > 20
  ) {
    return asFailure(requestId, `${label}重击阈值必须在 10 到 20 之间`);
  }

  const effectiveRollCount =
    entry.damageDiceMode === "normal"
      ? 1
      : Math.max(2, Math.min(5, Math.floor(parsedRollCount)));

  const safeCriticalThreshold = Math.max(10, Math.min(20, Math.floor(parsedCriticalThreshold)));

  const offHandText = entry.offHandDamageExprText.trim();
  let parsedOffHandDamageValue: ParsedDiceExpression | null = null;
  let parsedOffHandAttackBonusExpressionValue: ParsedDiceExpression | null = null;
  if (offHandText.length > 0) {
    const parsedOffHandDamage = tryParseDiceExpression(offHandText);
    if (!parsedOffHandDamage.ok) {
      return asFailure(requestId, `${label}副手伤害表达式错误：${parsedOffHandDamage.error.message}`);
    }

    const offHandAttackBonusExpressionText = buildAttackBonusExpressionText(
      entry.offHandAttackBonusFixedText,
      entry.offHandAttackBonusDie
    );
    const parsedOffHandAttackBonusExpression = tryParseDiceExpression(offHandAttackBonusExpressionText);
    if (!parsedOffHandAttackBonusExpression.ok) {
      return asFailure(
        requestId,
        `${label}副手攻击加值表达式错误：${parsedOffHandAttackBonusExpression.error.message}`
      );
    }

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

  let template = makeDualWieldTemplate({
    mainHandEffects: sharedEffects
  });
  let useOffHand = false;

  if (parsedOffHandDamageValue !== null) {
    useOffHand = true;
    template = makeDualWieldTemplate({
      mainHandEffects: sharedEffects,
      offHandEffects: sharedEffects,
      offHandAttackPatch: {
        attackBonusExpression: parsedOffHandAttackBonusExpressionValue ?? parsedMainHandAttackBonusExpression.value
      },
      offHandDamagePatch: {
        expression: parsedOffHandDamageValue
      }
    });
  }

  const resolved = resolveBg3AttackTemplate(baseContext, template);
  const mainHandStep = resolved.steps.find((step) => step.step.id === "main-hand");
  const offHandStep = resolved.steps.find((step) => step.step.id === "off-hand");

  const expectedMainHandValue = mainHandStep?.result.expectedDamagePerAttack ?? 0;
  const expectedOffHandValue = offHandStep?.result.expectedDamagePerAttack ?? 0;
  const expectedPerEntryValue = resolved.totalResult.expectedDamagePerPlan;
  const expectedOnHitMainHandValue = mainHandStep?.result.expectedDamageOnHit ?? 0;
  const expectedOnCritMainHandValue = mainHandStep?.result.expectedDamageOnCritical ?? 0;
  const expectedOnHitOffHandValue = offHandStep?.result.expectedDamageOnHit ?? 0;
  const expectedOnCritOffHandValue = offHandStep?.result.expectedDamageOnCritical ?? 0;
  const mainProbabilities = mainHandStep?.result.probabilities ?? {
    miss: 1,
    hit: 0,
    critical: 0
  };
  const offHandProbabilities = offHandStep?.result.probabilities ?? null;

  const templateSummary = useOffHand ? "主手 + 副手" : "副手留空，已回退为仅主手";

  return {
    expectedPerEntryValue,
    entry: {
      id: entry.id,
      hasOffHandStep: useOffHand,
      expectedMainHand: expectedMainHandValue.toFixed(4),
      expectedOffHand: expectedOffHandValue.toFixed(4),
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
    return asFailure(input.requestId, "模板执行次数必须是大于等于 1 的数字");
  }

  const safePlanCount = Math.max(1, parseIntegerText(input.planCountText));
  const computedEntries: ComputeEntrySuccess[] = [];
  let expectedPerPlanValue = 0;

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
  }

  const expectedTotalValue = expectedPerPlanValue * safePlanCount;

  return {
    ok: true,
    requestId: input.requestId,
    expectedPerPlan: expectedPerPlanValue.toFixed(4),
    expectedTotal: expectedTotalValue.toFixed(4),
    entries: computedEntries
  };
}

if (typeof self !== "undefined") {
  self.onmessage = (event: MessageEvent<ComputeInput>): void => {
    const result = computeAttackPlan(event.data);
    self.postMessage(result);
  };
}
