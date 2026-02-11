import { describe, expect, it } from "vitest";
import {
  computeAttackPlan,
  type AttackPlanEntryInput,
  type ComputeInput
} from "./compute.worker";

function makeEntry(overrides: Partial<AttackPlanEntryInput> = {}): AttackPlanEntryInput {
  return {
    id: "entry-1",
    mainHandAttackBonusFixedText: "5",
    mainHandAttackBonusDie: "none",
    offHandAttackBonusFixedText: "5",
    offHandAttackBonusDie: "none",
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
    expect(output.entries[0]?.expectedOffHand).toBe("0.0000");
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
    expect(Number(output.entries[0]?.expectedOffHand ?? "0")).toBeGreaterThan(0);
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
            offHandAttackBonusFixedText: "0",
            offHandAttackBonusDie: "none"
          })
        ]
      })
    );

    const highBonus = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({
            offHandDamageExprText: "1d6+2",
            offHandAttackBonusFixedText: "10",
            offHandAttackBonusDie: "none"
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

  it("aggregates multiple independent entries", (): void => {
    const output = computeAttackPlan(
      makeInput({
        entries: [
          makeEntry({ id: "main", mainHandDamageExprText: "1d8+3" }),
          makeEntry({ id: "off", mainHandDamageExprText: "1d6+2", offHandDamageExprText: "1d4+1" })
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

  it("scales total by plan count", (): void => {
    const once = computeAttackPlan(makeInput({ planCountText: "1" }));
    const thrice = computeAttackPlan(makeInput({ planCountText: "3" }));

    expect(once.ok).toBe(true);
    expect(thrice.ok).toBe(true);
    if (!once.ok || !thrice.ok) {
      return;
    }

    expect(Number(thrice.expectedTotal)).toBeCloseTo(Number(once.expectedPerPlan) * 3, 4);
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
