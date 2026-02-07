import {
  calculateAttackDamagePlan,
  calculateAttackDamage,
  type AttackDamagePlanResult,
  type AttackDamagePlanStep,
  type AttackCheckInput,
  type AttackDamageRequest,
  type AttackDamageResult,
  type AttackOutcomeProbabilities,
  type AttackRollRuleConfig,
  type DamageDiceRollMode,
  type DamageModel,
  type DamageModifier
} from "@bg3dc/domain";
import type { ExpressionComponent, ParsedDiceExpression } from "@bg3dc/dice-parser";

export interface RuleContext {
  readonly attack: AttackCheckInput;
  readonly damage: DamageModel;
}

export interface RuleMutation {
  readonly attack?: Partial<AttackCheckInput>;
  readonly damage?: Partial<DamageModel>;
}

export interface RuleEffect {
  readonly id: string;
  readonly description: string;
  apply(context: RuleContext): RuleMutation;
}

export interface ResolveResult {
  readonly request: AttackDamageRequest;
  readonly appliedEffects: readonly RuleEffect[];
  readonly result: AttackDamageResult;
}

export interface AttackTemplateStep {
  readonly id: string;
  readonly repeat?: number;
  readonly attack?: Partial<AttackCheckInput>;
  readonly damage?: Partial<DamageModel>;
  readonly effects?: readonly RuleEffect[];
}

export interface AttackTemplate {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly AttackTemplateStep[];
}

export interface AttackTemplateStepResult {
  readonly step: AttackTemplateStep;
  readonly context: RuleContext;
  readonly request: AttackDamageRequest;
  readonly appliedEffects: readonly RuleEffect[];
  readonly repeat: number;
  readonly result: AttackDamageResult;
  readonly expectedDamageTotal: number;
}

export interface ResolveTemplateResult {
  readonly template: AttackTemplate;
  readonly steps: readonly AttackTemplateStepResult[];
  readonly totalResult: AttackDamagePlanResult;
}

export interface DualWieldTemplateOptions {
  readonly mainHandEffects?: readonly RuleEffect[];
  readonly offHandEffects?: readonly RuleEffect[];
  readonly offHandAttackPatch?: Partial<AttackCheckInput>;
  readonly offHandDamagePatch?: Partial<DamageModel>;
  readonly mainHandRepeat?: number;
  readonly offHandRepeat?: number;
}

export const bg3AttackRules = {
  dieSides: 20,
  autoMissFaces: [1],
  autoCritFaces: [20]
} as const;

function asComponents(
  expression: ParsedDiceExpression | readonly ExpressionComponent[]
): readonly ExpressionComponent[] {
  return "components" in expression ? expression.components : expression;
}

function appendConstant(
  expression: ParsedDiceExpression | readonly ExpressionComponent[],
  value: number
): ParsedDiceExpression | readonly ExpressionComponent[] {
  const nextComponents: ExpressionComponent[] = [
    ...asComponents(expression),
    { kind: "constant", value }
  ];

  if ("components" in expression) {
    return {
      ...expression,
      components: nextComponents
    };
  }

  return nextComponents;
}

function mergeAttack(
  current: AttackCheckInput,
  patch: Partial<AttackCheckInput> | undefined
): AttackCheckInput {
  if (patch === undefined) {
    return current;
  }

  return {
    ...current,
    ...patch,
    rules: patch.rules ?? current.rules
  };
}

function mergeDamage(current: DamageModel, patch: Partial<DamageModel> | undefined): DamageModel {
  if (patch === undefined) {
    return current;
  }

  return {
    ...current,
    ...patch
  };
}

export function applyEffects(base: RuleContext, effects: readonly RuleEffect[]): RuleContext {
  let current = base;

  for (const effect of effects) {
    const mutation = effect.apply(current);
    current = {
      attack: mergeAttack(current.attack, mutation.attack),
      damage: mergeDamage(current.damage, mutation.damage)
    };
  }

  return current;
}

export function resolveBg3Attack(
  base: RuleContext,
  effects: readonly RuleEffect[]
): ResolveResult {
  const resolved = applyEffects(base, effects);
  const request: AttackDamageRequest = {
    attack: resolved.attack,
    damage: resolved.damage
  };

  return {
    request,
    appliedEffects: effects,
    result: calculateAttackDamage(request)
  };
}

function normalizeTemplateStep(base: RuleContext, step: AttackTemplateStep): RuleContext {
  const patched = {
    attack: mergeAttack(base.attack, step.attack),
    damage: mergeDamage(base.damage, step.damage)
  };

  return applyEffects(patched, step.effects ?? []);
}

export function resolveBg3AttackTemplate(
  base: RuleContext,
  template: AttackTemplate
): ResolveTemplateResult {
  const planSteps: AttackDamagePlanStep[] = [];
  const resolvedContexts: Array<{
    step: AttackTemplateStep;
    context: RuleContext;
    request: AttackDamageRequest;
    appliedEffects: readonly RuleEffect[];
  }> = [];

  for (const step of template.steps) {
    const context = normalizeTemplateStep(base, step);
    const request: AttackDamageRequest = {
      attack: context.attack,
      damage: context.damage
    };
    const repeat = step.repeat === undefined ? 1 : Math.max(1, Math.floor(step.repeat));

    planSteps.push({
      request,
      repeat
    });

    resolvedContexts.push({
      step,
      context,
      request,
      appliedEffects: step.effects ?? []
    });
  }

  const totalResult = calculateAttackDamagePlan(planSteps);
  const stepResults: AttackTemplateStepResult[] = [];

  for (let index = 0; index < resolvedContexts.length; index += 1) {
    const resolved = resolvedContexts[index];
    const planStep = totalResult.steps[index];

    if (resolved === undefined || planStep === undefined) {
      throw new Error("template resolution index mismatch");
    }

    stepResults.push({
      step: resolved.step,
      context: resolved.context,
      request: resolved.request,
      appliedEffects: resolved.appliedEffects,
      repeat: planStep.repeat,
      result: planStep.result,
      expectedDamageTotal: planStep.expectedDamageTotal
    });
  }

  return {
    template,
    steps: stepResults,
    totalResult
  };
}

export function makeDualWieldTemplate(options: DualWieldTemplateOptions = {}): AttackTemplate {
  const steps: AttackTemplateStep[] = [
    {
      id: "main-hand",
      repeat: options.mainHandRepeat,
      effects: options.mainHandEffects ?? []
    }
  ];

  if ((options.offHandEffects ?? []).length > 0 || options.offHandRepeat !== undefined) {
    steps.push({
      id: "off-hand",
      repeat: options.offHandRepeat,
      attack: options.offHandAttackPatch,
      damage: options.offHandDamagePatch,
      effects: options.offHandEffects ?? []
    });
  }

  return {
    id: "dual-wield",
    name: "Dual Wield",
    steps
  };
}

export function makeAttackBonusEffect(id: string, bonusDelta: number): RuleEffect {
  return {
    id,
    description: `Attack bonus ${bonusDelta >= 0 ? "+" : ""}${bonusDelta}`,
    apply(context: RuleContext): RuleMutation {
      return {
        attack: {
          attackBonusExpression: appendConstant(
            context.attack.attackBonusExpression,
            bonusDelta
          )
        }
      };
    }
  };
}

export function makeCriticalDiceMultiplierEffect(id: string, multiplier: number): RuleEffect {
  return {
    id,
    description: `Critical dice x${multiplier}`,
    apply(): RuleMutation {
      return {
        damage: {
          criticalDiceMultiplier: multiplier
        }
      };
    }
  };
}

export function makeDamageModifierEffect(id: string, modifier: DamageModifier): RuleEffect {
  return {
    id,
    description: `Damage modifier: ${modifier}`,
    apply(): RuleMutation {
      return {
        damage: {
          modifier
        }
      };
    }
  };
}

export function makeDamageDiceRollModeEffect(id: string, mode: DamageDiceRollMode): RuleEffect {
  return {
    id,
    description: `Damage dice mode: ${mode}`,
    apply(): RuleMutation {
      return {
        damage: {
          diceRollMode: mode
        }
      };
    }
  };
}

function normalizeCriticalThreshold(threshold: number): number {
  return Math.max(17, Math.min(20, Math.floor(threshold)));
}

function buildCriticalFaces(threshold: number): readonly number[] {
  const normalized = normalizeCriticalThreshold(threshold);
  const faces: number[] = [];

  for (let face = normalized; face <= 20; face += 1) {
    faces.push(face);
  }

  return faces;
}

function applyCriticalThresholdToRules(
  rules: AttackRollRuleConfig,
  threshold: number
): AttackRollRuleConfig {
  return {
    ...rules,
    autoCritFaces: buildCriticalFaces(threshold)
  };
}

export function makeCriticalThresholdEffect(id: string, threshold: number): RuleEffect {
  return {
    id,
    description: `Critical threshold: ${normalizeCriticalThreshold(threshold)}+`,
    apply(context: RuleContext): RuleMutation {
      return {
        attack: {
          rules: applyCriticalThresholdToRules(context.attack.rules, threshold)
        }
      };
    }
  };
}

export function makeHalflingLuckyEffect(id: string, enabled: boolean): RuleEffect {
  return {
    id,
    description: enabled ? "Halfling lucky enabled" : "Halfling lucky disabled",
    apply(): RuleMutation {
      return {
        attack: {
          halflingLucky: enabled
        }
      };
    }
  };
}

export function makeDamageRollCountEffect(id: string, count: number): RuleEffect {
  return {
    id,
    description: `Damage roll count: ${count}`,
    apply(): RuleMutation {
      return {
        damage: {
          damageRollCount: count
        }
      };
    }
  };
}

export function summarizeProbabilities(probabilities: AttackOutcomeProbabilities): string {
  const miss = (probabilities.miss * 100).toFixed(2);
  const hit = (probabilities.hit * 100).toFixed(2);
  const critical = (probabilities.critical * 100).toFixed(2);
  return `miss ${miss}% | hit ${hit}% | crit ${critical}%`;
}
