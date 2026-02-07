import { describe, expect, it } from "vitest";
import {
  convolve,
  expectation,
  maxOfIndependent,
  minOfIndependent,
  probabilityAtLeast,
  repeatConvolve,
  uniformDie
} from "./index";

describe("prob utilities", (): void => {
  it("builds a fair die distribution", (): void => {
    const die = uniformDie(6);

    expect(die.entries).toHaveLength(6);
    expect(expectation(die)).toBeCloseTo(3.5, 8);
    expect(die.totalProbability).toBeCloseTo(1, 10);
  });

  it("convolves two dice", (): void => {
    const d6 = uniformDie(6);
    const twoD6 = convolve(d6, d6);

    expect(twoD6.entries[0]).toEqual({ outcome: 2, probability: 1 / 36 });
    expect(twoD6.entries[twoD6.entries.length - 1]).toEqual({
      outcome: 12,
      probability: 1 / 36
    });
    expect(expectation(twoD6)).toBeCloseTo(7, 8);
  });

  it("repeats convolution for NdM", (): void => {
    const d4 = uniformDie(4);
    const threeD4 = repeatConvolve(d4, 3);

    expect(threeD4.entries[0]?.outcome).toBe(3);
    expect(threeD4.entries[threeD4.entries.length - 1]?.outcome).toBe(12);
    expect(threeD4.totalProbability).toBeCloseTo(1, 10);
  });

  it("computes cumulative probability", (): void => {
    const d20 = uniformDie(20);
    const chance = probabilityAtLeast(d20, 15);

    expect(chance).toBeCloseTo(0.3, 10);
  });

  it("supports max of independent rolls", (): void => {
    const d8 = uniformDie(8);
    const max2 = maxOfIndependent(d8, 2);

    expect(expectation(max2)).toBeCloseTo((9 * 31) / (6 * 8), 10);
    expect(max2.totalProbability).toBeCloseTo(1, 10);
  });

  it("supports min of independent rolls", (): void => {
    const d8 = uniformDie(8);
    const min2 = minOfIndependent(d8, 2);

    expect(expectation(min2)).toBeCloseTo((9 * 17) / (6 * 8), 10);
    expect(min2.totalProbability).toBeCloseTo(1, 10);
  });
});
