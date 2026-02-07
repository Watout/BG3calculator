import { parseDiceExpression } from "@bg3dc/dice-parser";
import { describe, expect, it } from "vitest";
import {
  applyEffects,
  makeDualWieldTemplate,
  bg3AttackRules,
  makeAttackBonusEffect,
  makeCriticalThresholdEffect,
  makeCriticalDiceMultiplierEffect,
  makeDamageDiceRollModeEffect,
  makeDamageRollCountEffect,
  makeDamageModifierEffect,
  makeHalflingLuckyEffect,
  resolveBg3AttackTemplate,
  resolveBg3Attack,
  summarizeProbabilities,
  type RuleContext
} from "./index";

function makeBaseContext(): RuleContext {
  return {
    attack: {
      armorClass: 15,
      attackBonusExpression: parseDiceExpression("5"),
      advantageState: "normal",
      rules: bg3AttackRules
    },
    damage: {
      expression: parseDiceExpression("1d8+3"),
      criticalDiceMultiplier: 2,
      modifier: "normal"
    }
  };
}

describe("rulesets effect system", (): void => {
  it("applies composable effects to produce a final request", (): void => {
    const base = makeBaseContext();
    const effects = [
      makeAttackBonusEffect("weapon-plus-one", 1),
      makeCriticalDiceMultiplierEffect("orcish-fury", 3),
      makeDamageModifierEffect("target-resistant", "resistant")
    ];

    const applied = applyEffects(base, effects);

    expect("components" in applied.attack.attackBonusExpression).toBe(true);
    if ("components" in applied.attack.attackBonusExpression) {
      const bonusSum = applied.attack.attackBonusExpression.components
        .filter((component) => component.kind === "constant")
        .reduce((sum, component) => sum + component.value, 0);
      expect(bonusSum).toBe(6);
    }
    expect(applied.damage.criticalDiceMultiplier).toBe(3);
    expect(applied.damage.modifier).toBe("resistant");
  });

  it("resolves bg3 attack end-to-end with effects", (): void => {
    const base = makeBaseContext();
    const effects = [makeAttackBonusEffect("bless-like", 2)];

    const resolved = resolveBg3Attack(base, effects);

    expect("components" in resolved.request.attack.attackBonusExpression).toBe(true);
    if ("components" in resolved.request.attack.attackBonusExpression) {
      const bonusSum = resolved.request.attack.attackBonusExpression.components
        .filter((component) => component.kind === "constant")
        .reduce((sum, component) => sum + component.value, 0);
      expect(bonusSum).toBe(7);
    }
    expect(resolved.result.expectedDamagePerAttack).toBeGreaterThan(0);
    expect(resolved.result.totalDamageDistribution.totalProbability).toBeCloseTo(1, 10);
  });

  it("summarizes outcome probabilities for explain UI", (): void => {
    const text = summarizeProbabilities({
      miss: 0.4,
      hit: 0.55,
      critical: 0.05
    });

    expect(text).toBe("miss 40.00% | hit 55.00% | crit 5.00%");
  });

  it("applies damage dice advantage effect", (): void => {
    const base = makeBaseContext();

    const normal = resolveBg3Attack(base, []);
    const advantaged = resolveBg3Attack(base, [
      makeDamageDiceRollModeEffect("great-weapon-fighting-like", "advantage")
    ]);

    expect(advantaged.result.expectedDamageOnHit).toBeGreaterThan(normal.result.expectedDamageOnHit);
  });

  it("applies multi-roll and reroll-low effects", (): void => {
    const base = makeBaseContext();

    const normal = resolveBg3Attack(base, []);
    const modified = resolveBg3Attack(base, [
      makeDamageDiceRollModeEffect("keep-high", "advantage"),
      makeDamageRollCountEffect("roll-three", 3)
    ]);

    expect(modified.result.expectedDamageOnHit).toBeGreaterThan(normal.result.expectedDamageOnHit);
  });

  it("applies critical threshold effect", (): void => {
    const base = makeBaseContext();
    const normal = resolveBg3Attack(base, []);
    const withThreshold19 = resolveBg3Attack(base, [makeCriticalThresholdEffect("crit-19", 19)]);

    expect(withThreshold19.result.probabilities.critical).toBeGreaterThan(normal.result.probabilities.critical);
  });

  it("applies halfling lucky effect", (): void => {
    const base = makeBaseContext();
    const normal = resolveBg3Attack(base, []);
    const lucky = resolveBg3Attack(base, [makeHalflingLuckyEffect("halfling-lucky", true)]);

    expect(lucky.result.probabilities.miss).toBeLessThan(normal.result.probabilities.miss);
  });

  it("resolves dual-wield template with two damage steps", (): void => {
    const base = makeBaseContext();
    const template = makeDualWieldTemplate({
      mainHandEffects: [makeDamageRollCountEffect("main-roll", 1)],
      offHandEffects: [makeDamageRollCountEffect("off-roll", 1)],
      offHandDamagePatch: {
        expression: parseDiceExpression("1d6+2")
      }
    });

    const resolved = resolveBg3AttackTemplate(base, template);

    expect(resolved.steps).toHaveLength(2);
    expect(resolved.steps[0]?.step.id).toBe("main-hand");
    expect(resolved.steps[1]?.step.id).toBe("off-hand");
    expect(resolved.totalResult.totalDamageDistribution.totalProbability).toBeCloseTo(1, 10);
    expect(resolved.totalResult.expectedDamagePerPlan).toBeGreaterThan(0);
  });

  it("falls back to single step when offhand is not configured", (): void => {
    const base = makeBaseContext();
    const singleTemplate = makeDualWieldTemplate({
      mainHandEffects: []
    });

    const dualTemplateWithoutOffhand = makeDualWieldTemplate({
      mainHandEffects: []
    });

    const single = resolveBg3AttackTemplate(base, singleTemplate);
    const fallback = resolveBg3AttackTemplate(base, dualTemplateWithoutOffhand);

    expect(single.steps).toHaveLength(1);
    expect(fallback.steps).toHaveLength(1);
    expect(fallback.totalResult.expectedDamagePerPlan).toBeCloseTo(single.totalResult.expectedDamagePerPlan, 10);
  });

});
