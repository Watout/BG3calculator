import { parseDiceExpression } from "@bg3dc/dice-parser";
import { describe, expect, it } from "vitest";
import {
  applyDamageDiceRollMode,
  applyDamageModifier,
  buildDamageDistribution,
  calculateAttackDamagePlan,
  calculateSaveExpectedDamage,
  calculateSaveSuccessProbability,
  calculateSingleRollAttackProbabilities,
  calculateAttackDamage,
  calculateAttackOutcomeProbabilities,
  expectedGwfSingleDieMean,
  expectedMaxOfTwoSingleDieMean,
  expectedSingleDieMean,
  type AttackCheckInput
} from "./index";

const d20Rules = {
  dieSides: 20,
  autoMissFaces: [1],
  autoCritFaces: [20]
} as const;

function makeAttack(overrides: Partial<AttackCheckInput> = {}): AttackCheckInput {
  return {
    armorClass: 15,
    attackBonusExpression: parseDiceExpression("5"),
    advantageState: "normal",
    rules: d20Rules,
    ...overrides
  };
}

describe("domain attack probabilities", (): void => {
  it("computes hit and crit probabilities with nat1/nat20", (): void => {
    const probabilities = calculateAttackOutcomeProbabilities(makeAttack());

    expect(probabilities.miss).toBeCloseTo(0.45, 10);
    expect(probabilities.hit).toBeCloseTo(0.5, 10);
    expect(probabilities.critical).toBeCloseTo(0.05, 10);
  });

  it("advantage improves expected non-miss chance", (): void => {
    const normal = calculateAttackOutcomeProbabilities(makeAttack({ advantageState: "normal" }));
    const advantage = calculateAttackOutcomeProbabilities(makeAttack({ advantageState: "advantage" }));
    const disadvantage = calculateAttackOutcomeProbabilities(
      makeAttack({ advantageState: "disadvantage" })
    );

    expect(advantage.hit + advantage.critical).toBeGreaterThan(normal.hit + normal.critical);
    expect(disadvantage.hit + disadvantage.critical).toBeLessThan(normal.hit + normal.critical);
  });

  it("matches closed form single-roll formula", (): void => {
    const result = calculateSingleRollAttackProbabilities(15, 5, 20);

    expect(result.critical).toBeCloseTo(0.05, 10);
    expect(result.hit).toBeCloseTo(0.5, 10);
    expect(result.miss).toBeCloseTo(0.45, 10);
  });

  it("supports custom critical threshold like 19-20", (): void => {
    const result = calculateAttackOutcomeProbabilities(
      makeAttack({
        rules: {
          dieSides: 20,
          autoMissFaces: [1],
          autoCritFaces: [19, 20]
        }
      })
    );

    expect(result.critical).toBeCloseTo(0.1, 10);
    expect(result.hit).toBeCloseTo(0.45, 10);
  });

  it("supports halfling lucky for attack roll", (): void => {
    const normal = calculateAttackOutcomeProbabilities(makeAttack({ halflingLucky: false }));
    const lucky = calculateAttackOutcomeProbabilities(makeAttack({ halflingLucky: true }));

    expect(lucky.miss).toBeLessThan(normal.miss);
    expect(lucky.hit + lucky.critical).toBeGreaterThan(normal.hit + normal.critical);
  });

  it("supports dice attack bonus expression", (): void => {
    const fixed = calculateAttackOutcomeProbabilities(
      makeAttack({
        armorClass: 16,
        attackBonusExpression: parseDiceExpression("5")
      })
    );

    const withDice = calculateAttackOutcomeProbabilities(
      makeAttack({
        armorClass: 16,
        attackBonusExpression: parseDiceExpression("5+1d4")
      })
    );

    expect(withDice.hit + withDice.critical).toBeGreaterThan(fixed.hit + fixed.critical);
  });

  it("keeps crit chance unchanged by attack bonus dice", (): void => {
    const fixed = calculateAttackOutcomeProbabilities(
      makeAttack({
        attackBonusExpression: parseDiceExpression("5")
      })
    );

    const withDice = calculateAttackOutcomeProbabilities(
      makeAttack({
        attackBonusExpression: parseDiceExpression("5+1d8")
      })
    );

    expect(withDice.critical).toBeCloseTo(fixed.critical, 10);
  });
});

describe("domain damage calculation", (): void => {
  it("critical doubles dice but not flat constants", (): void => {
    const result = calculateAttackDamage({
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d6+2"),
        criticalDiceMultiplier: 2,
        modifier: "normal"
      }
    });

    expect(result.expectedDamageOnHit).toBeCloseTo(5.5, 10);
    expect(result.expectedDamageOnCritical).toBeCloseTo(9, 10);
  });

  it("applies resistance, vulnerability, and immunity", (): void => {
    expect(applyDamageModifier(5, "resistant")).toBe(2);
    expect(applyDamageModifier(5, "vulnerable")).toBe(10);
    expect(applyDamageModifier(5, "immune")).toBe(0);
  });

  it("produces weighted expected damage per attack", (): void => {
    const result = calculateAttackDamage({
      attack: makeAttack({ armorClass: 10, attackBonusExpression: parseDiceExpression("0") }),
      damage: {
        expression: parseDiceExpression("1d4+1"),
        criticalDiceMultiplier: 2,
        modifier: "normal"
      }
    });

    const expectedFromParts =
      result.probabilities.hit * result.expectedDamageOnHit +
      result.probabilities.critical * result.expectedDamageOnCritical;

    expect(result.expectedDamagePerAttack).toBeCloseTo(expectedFromParts, 10);
    expect(result.totalDamageDistribution.totalProbability).toBeCloseTo(1, 10);
  });

  it("supports damage dice advantage", (): void => {
    const normal = calculateAttackDamage({
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d8"),
        criticalDiceMultiplier: 2,
        modifier: "normal",
        diceRollMode: "normal"
      }
    });

    const advantaged = calculateAttackDamage({
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d8"),
        criticalDiceMultiplier: 2,
        modifier: "normal",
        diceRollMode: "advantage"
      }
    });

    expect(advantaged.expectedDamageOnHit).toBeGreaterThan(normal.expectedDamageOnHit);
    expect(advantaged.expectedDamageOnCritical).toBeGreaterThan(normal.expectedDamageOnCritical);
  });

  it("supports damage dice disadvantage", (): void => {
    const normalDistribution = buildDamageDistribution(parseDiceExpression("1d8"), 1);
    const disadvantagedDistribution = applyDamageDiceRollMode(normalDistribution, "disadvantage");

    const normalExpectation = normalDistribution.entries.reduce(
      (sum, entry) => sum + entry.outcome * entry.probability,
      0
    );
    const disadvantagedExpectation = disadvantagedDistribution.entries.reduce(
      (sum, entry) => sum + entry.outcome * entry.probability,
      0
    );

    expect(disadvantagedExpectation).toBeLessThan(normalExpectation);
    expect(disadvantagedDistribution.totalProbability).toBeCloseTo(1, 10);
  });

  it("supports multi-roll keep highest", (): void => {
    const normal = calculateAttackDamage({
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d8"),
        criticalDiceMultiplier: 2,
        modifier: "normal",
        damageRollCount: 1,
        diceRollMode: "advantage"
      }
    });

    const triple = calculateAttackDamage({
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d8"),
        criticalDiceMultiplier: 2,
        modifier: "normal",
        damageRollCount: 3,
        diceRollMode: "advantage"
      }
    });

    expect(triple.expectedDamageOnHit).toBeGreaterThan(normal.expectedDamageOnHit);
  });

  it("supports reroll low threshold", (): void => {
    const normal = calculateAttackDamage({
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d6"),
        criticalDiceMultiplier: 2,
        modifier: "normal"
      }
    });

    const rerollLow = calculateAttackDamage({
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d6"),
        criticalDiceMultiplier: 2,
        modifier: "normal",
        rerollLowThreshold: 2
      }
    });

    expect(rerollLow.expectedDamageOnHit).toBeGreaterThan(normal.expectedDamageOnHit);
  });

  it("handles large dice pools without invalid totals", (): void => {
    const result = calculateAttackDamage({
      attack: makeAttack({
        attackBonusExpression: parseDiceExpression("5")
      }),
      damage: {
        expression: parseDiceExpression("100d20"),
        criticalDiceMultiplier: 2,
        modifier: "normal"
      }
    });

    expect(result.hitDamageDistribution.totalProbability).toBeCloseTo(1, 8);
    expect(result.expectedDamageOnHit).toBeGreaterThan(0);
  });

  it("matches closed form means for die mechanics", (): void => {
    expect(expectedSingleDieMean(8)).toBeCloseTo(4.5, 10);
    expect(expectedGwfSingleDieMean(6)).toBeCloseTo(25 / 6, 10);
    expect(expectedMaxOfTwoSingleDieMean(8)).toBeCloseTo(279 / 48, 10);
  });

  it("supports multi-step attack plan aggregation", (): void => {
    const main = {
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d8+3"),
        criticalDiceMultiplier: 2,
        modifier: "normal" as const
      }
    };

    const offhand = {
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d6+2"),
        criticalDiceMultiplier: 2,
        modifier: "normal" as const
      }
    };

    const mainResult = calculateAttackDamage(main);
    const offhandResult = calculateAttackDamage(offhand);
    const plan = calculateAttackDamagePlan([
      { request: main },
      { request: offhand }
    ]);

    expect(plan.steps).toHaveLength(2);
    expect(plan.totalDamageDistribution.totalProbability).toBeCloseTo(1, 10);
    expect(plan.expectedDamagePerPlan).toBeCloseTo(
      mainResult.expectedDamagePerAttack + offhandResult.expectedDamagePerAttack,
      10
    );
  });

  it("supports repeated plan steps", (): void => {
    const single = {
      attack: makeAttack(),
      damage: {
        expression: parseDiceExpression("1d4+1"),
        criticalDiceMultiplier: 2,
        modifier: "normal" as const
      }
    };

    const base = calculateAttackDamage(single);
    const plan = calculateAttackDamagePlan([
      { request: single, repeat: 3 }
    ]);

    expect(plan.steps[0]?.repeat).toBe(3);
    expect(plan.expectedDamagePerPlan).toBeCloseTo(base.expectedDamagePerAttack * 3, 10);
  });
});

describe("domain save damage model", (): void => {
  it("computes save success probability", (): void => {
    const probability = calculateSaveSuccessProbability({
      difficultyClass: 16,
      saveBonus: 3
    });

    expect(probability).toBeCloseTo(0.4, 10);
  });

  it("computes save expected damage", (): void => {
    const result = calculateSaveExpectedDamage(
      {
        difficultyClass: 16,
        saveBonus: 3
      },
      20,
      10
    );

    expect(result.expectedDamage).toBeCloseTo(16, 10);
  });
});
