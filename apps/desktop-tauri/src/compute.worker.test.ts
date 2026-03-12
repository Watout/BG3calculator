import { describe, expect, it } from "vitest";
import {
  computeAttackPlan,
  type AttackPlanEntryInput,
  type ComputeInput
} from "./compute.worker";

function makeEntry(overrides: Partial<AttackPlanEntryInput> = {}): AttackPlanEntryInput {
  return {
    id: "entry-1",
    mainHandRepeatText: "1",
    offHandRepeatText: "1",
    mainHandAttackBonusExprText: "5",
    offHandAttackBonusExprText: "5",
    armorClassText: "15",
    mainHandDamageExprText: "1d8+3",
    offHandDamageExprText: "",
    advantageState: "normal",
    damageDiceMode: "normal",
    damageRollCountText: "2",
    criticalThresholdText: "20",
    halflingLucky: false,
    modifier: "normal",
    ...overrides
  };
}

function makeInput(overrides: Partial<ComputeInput> = {}): ComputeInput {
  return {
    entries: [makeEntry()],
    planCountText: "1",
    requestId: 1,
    ...overrides
  };
}

describe("compute worker attack plan", (): void => {
  it("falls back to main-hand only when offhand is empty", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            offHandDamageExprText: ""
          })
        ]
      })
    );

    expect(output.ok).toBe(true);
    if (!output.ok) {
      return;
    }

    expect(output.entries).toHaveLength(1);
    expect(output.entries[0]?.hasOffHandStep).toBe(false);
    expect(output.entries[0]?.mainHandRepeat).toBe(1);
    expect(output.entries[0]?.offHandRepeat).toBe(0);
    expect(output.entries[0]?.expectedOffHand).toBe("0.0000");
    expect(output.entries[0]?.expectedOffHandTotal).toBe("0.0000");
    expect(output.entries[0]?.expectedOnHitOffHand).toBe("0.0000");
    expect(output.entries[0]?.expectedOnCritOffHand).toBe("0.0000");
    expect(output.entries[0]?.offHandProbabilitySummary).toBe("-");
    expect(output.entries[0]?.templateSummary).toBe("副手留空，已回退为仅主手");
  });

  it("adds offhand contribution when offhand expression exists", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            offHandDamageExprText: "1d6+2"
          })
        ]
      })
    );

    expect(output.ok).toBe(true);
    if (!output.ok) {
      return;
    }

    expect(output.entries[0]?.hasOffHandStep).toBe(true);
    expect(output.entries[0]?.mainHandRepeat).toBe(1);
    expect(output.entries[0]?.offHandRepeat).toBe(1);
    expect(Number(output.entries[0]?.expectedOffHand ?? "0")).toBeGreaterThan(0);
    expect(Number(output.entries[0]?.expectedOffHandTotal ?? "0")).toBeGreaterThan(0);
    expect(Number(output.entries[0]?.expectedOnHitOffHand ?? "0")).toBeGreaterThan(0);
    expect(Number(output.entries[0]?.expectedOnCritOffHand ?? "0")).toBeGreaterThan(0);
    expect(output.entries[0]?.offHandProbabilitySummary.includes("hit")).toBe(true);
    expect(output.entries[0]?.templateSummary).toBe("主手 + 副手");
  });

  it("uses independent offhand attack bonus", (): void => {
    const lowBonus = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            offHandDamageExprText: "1d6+2",
            offHandAttackBonusExprText: "0"
          })
        ]
      })
    );

    const highBonus = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            offHandDamageExprText: "1d6+2",
            offHandAttackBonusExprText: "10"
          })
        ]
      })
    );

    expect(lowBonus.ok).toBe(true);
    expect(highBonus.ok).toBe(true);
    if (!lowBonus.ok || !highBonus.ok) {
      return;
    }

    expect(Number(highBonus.entries[0]?.expectedOffHand ?? "0")).toBeGreaterThan(
      Number(lowBonus.entries[0]?.expectedOffHand ?? "0")
    );
  });

  it("accepts dice expressions for attack bonus inputs", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            mainHandAttackBonusExprText: "1d4+5",
            offHandDamageExprText: "1d6+2",
            offHandAttackBonusExprText: "1d4+3"
          })
        ]
      })
    );

    expect(output.ok).toBe(true);
    if (!output.ok) {
      return;
    }

    expect(output.entries[0]?.mainHandProbabilitySummary.includes("hit")).toBe(true);
    expect(output.entries[0]?.offHandProbabilitySummary.includes("hit")).toBe(true);
  });

  it("applies independent main-hand and offhand repeat counts", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            mainHandRepeatText: "2",
            offHandDamageExprText: "1d6+2",
            offHandRepeatText: "3"
          })
        ]
      })
    );

    expect(output.ok).toBe(true);
    if (!output.ok) {
      return;
    }

    const entry = output.entries[0];
    expect(entry?.mainHandRepeat).toBe(2);
    expect(entry?.offHandRepeat).toBe(3);
    expect(Number(entry?.expectedMainHandTotal ?? "0")).toBeCloseTo(
      Number(entry?.expectedMainHand ?? "0") * 2,
      4
    );
    expect(Number(entry?.expectedOffHandTotal ?? "0")).toBeCloseTo(
      Number(entry?.expectedOffHand ?? "0") * 3,
      4
    );
    expect(Number(entry?.expectedPerEntry ?? "0")).toBeCloseTo(
      Number(entry?.expectedMainHandTotal ?? "0") + Number(entry?.expectedOffHandTotal ?? "0"),
      4
    );
  });

  it("aggregates multiple independent entries", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({ id: "main", mainHandDamageExprText: "1d8+3" }),
          makeEntry({
            id: "off",
            mainHandRepeatText: "2",
            offHandRepeatText: "2",
            mainHandDamageExprText: "1d6+2",
            offHandDamageExprText: "1d4+1"
          })
        ]
      })
    );

    expect(output.ok).toBe(true);
    if (!output.ok) {
      return;
    }

    expect(output.entries).toHaveLength(2);
    const sum = output.entries.reduce((total, entry) => total + Number(entry.expectedPerEntry), 0);
    expect(Number(output.expectedPerPlan)).toBeCloseTo(sum, 4);
  });

  it("scales total by plan count and exposes guaranteed critical totals", (): void => {
    const once = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            mainHandRepeatText: "2",
            offHandDamageExprText: "1d6+2",
            offHandRepeatText: "2"
          })
        ],
        planCountText: "1"
      })
    );
    const thrice = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            mainHandRepeatText: "2",
            offHandDamageExprText: "1d6+2",
            offHandRepeatText: "2"
          })
        ],
        planCountText: "3"
      })
    );

    expect(once.ok).toBe(true);
    expect(thrice.ok).toBe(true);
    if (!once.ok || !thrice.ok) {
      return;
    }

    const onceEntry = once.entries[0];
    const expectedGuaranteedCrit =
      Number(onceEntry?.expectedOnCritMainHand ?? "0") * Number(onceEntry?.mainHandRepeat ?? 0) +
      Number(onceEntry?.expectedOnCritOffHand ?? "0") * Number(onceEntry?.offHandRepeat ?? 0);

    expect(Number(thrice.expectedTotal)).toBeCloseTo(Number(once.expectedPerPlan) * 3, 4);
    expect(Number(once.fullCritExpectedPerPlan)).toBeCloseTo(expectedGuaranteedCrit, 4);
    expect(Number(thrice.fullCritExpectedTotal)).toBeCloseTo(
      Number(once.fullCritExpectedPerPlan) * 3,
      4
    );
    expect(Number(once.fullCritExpectedPerPlan)).toBeGreaterThan(
      Number(onceEntry?.expectedPerEntry ?? "0")
    );
  });

  it("supports unbounded repeat and template counts by scaling per-step expectations", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            mainHandRepeatText: "37",
            offHandDamageExprText: "1d6+2",
            offHandRepeatText: "41"
          })
        ],
        planCountText: "125"
      })
    );

    expect(output.ok).toBe(true);
    if (!output.ok) {
      return;
    }

    const entry = output.entries[0];
    expect(entry?.mainHandRepeat).toBe(37);
    expect(entry?.offHandRepeat).toBe(41);
    expect(Number(entry?.expectedMainHandTotal ?? "0")).toBeCloseTo(
      Number(entry?.expectedMainHand ?? "0") * 37,
      4
    );
    expect(Number(entry?.expectedOffHandTotal ?? "0")).toBeCloseTo(
      Number(entry?.expectedOffHand ?? "0") * 41,
      4
    );
    expect(Number(output.expectedTotal)).toBeCloseTo(Number(output.expectedPerPlan) * 125, 4);
  });

  it("keeps guaranteed critical totals independent from normal expected totals", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            mainHandAttackBonusExprText: "7",
            mainHandDamageExprText: "10d10"
          })
        ],
        planCountText: "1"
      })
    );

    expect(output.ok).toBe(true);
    if (!output.ok) {
      return;
    }

    const entry = output.entries[0];
    expect(entry?.expectedOnCritMainHand).toBe("110.0000");
    expect(output.expectedPerPlan).toBe("38.5000");
    expect(output.fullCritExpectedPerPlan).toBe("110.0000");
    expect(output.expectedTotal).toBe("38.5000");
    expect(output.fullCritExpectedTotal).toBe("110.0000");
  });

  it("ignores offhand repeat and attack bonus values when offhand damage is empty", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            offHandDamageExprText: "   ",
            offHandRepeatText: "21",
            offHandAttackBonusExprText: "1d"
          })
        ]
      })
    );

    expect(output.ok).toBe(true);
    if (!output.ok) {
      return;
    }

    expect(output.entries[0]?.hasOffHandStep).toBe(false);
    expect(output.entries[0]?.offHandRepeat).toBe(0);
    expect(output.entries[0]?.expectedOffHandTotal).toBe("0.0000");
  });

  it("returns repeat-specific validation errors", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            mainHandRepeatText: "0"
          })
        ]
      })
    );

    expect(output.ok).toBe(false);
    if (output.ok) {
      return;
    }

    expect(output.errorMessage).toContain("主手执行次数必须是大于等于 1 的有限整数");
  });

  it("accepts a critical threshold of 1 while preserving the natural-1 auto-miss", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            criticalThresholdText: "1"
          })
        ]
      })
    );

    expect(output.ok).toBe(true);
    if (!output.ok) {
      return;
    }

    const entry = output.entries[0];
    expect(Number(entry?.expectedPerEntry ?? "0")).toBeCloseTo(
      Number(entry?.expectedOnCritMainHand ?? "0") * 0.95,
      4
    );
    expect(entry?.mainHandProbabilitySummary).toContain("miss 5.00%");
    expect(entry?.mainHandProbabilitySummary).toContain("crit 95.00%");
  });

  it("returns field-scoped error with entry index", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry(),
          makeEntry({ id: "broken", mainHandDamageExprText: "1d" })
        ]
      })
    );

    expect(output.ok).toBe(false);
    if (output.ok) {
      return;
    }

    expect(output.errorMessage.startsWith("第 2 项")).toBe(true);
  });
});
