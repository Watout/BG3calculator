import { describe, expect, it } from "vitest";
import {
  COMPACT_MENU_VISIBLE_ITEMS,
  HISTORY_LIMIT,
  MAX_REPEAT_COUNT,
  REPEAT_OPTIONS,
  commitHistoryValue,
  isDiceExpressionHistoryValue,
  isSignedIntegerHistoryValue,
} from "./inputHistory";

describe("input history helpers", (): void => {
  it("builds repeat options from 1 to 20", (): void => {
    expect(MAX_REPEAT_COUNT).toBe(20);
    expect(REPEAT_OPTIONS[0]).toBe("1");
    expect(REPEAT_OPTIONS[REPEAT_OPTIONS.length - 1]).toBe("20");
    expect(REPEAT_OPTIONS).toHaveLength(20);
  });

  it("keeps compact dropdown visible count at 8 items", (): void => {
    expect(COMPACT_MENU_VISIBLE_ITEMS).toBe(8);
  });

  it("accepts valid dice expressions for history", (): void => {
    expect(isDiceExpressionHistoryValue("1d8+3")).toBe(true);
    expect(isDiceExpressionHistoryValue("1d8 + 3")).toBe(true);
    expect(isDiceExpressionHistoryValue("1d")).toBe(false);
  });

  it("accepts signed integers for fixed attack bonus history", (): void => {
    expect(isSignedIntegerHistoryValue("5")).toBe(true);
    expect(isSignedIntegerHistoryValue("+5")).toBe(true);
    expect(isSignedIntegerHistoryValue("-2")).toBe(true);
    expect(isSignedIntegerHistoryValue("1d4")).toBe(false);
  });

  it("moves duplicates to the top and trims whitespace", (): void => {
    const next = commitHistoryValue(
      ["1d8+3", "2d6+1"],
      " 2d6+1 ",
      isDiceExpressionHistoryValue,
    );

    expect(next).toEqual(["2d6+1", "1d8+3"]);
  });

  it("ignores invalid or empty values", (): void => {
    const original = ["1d8+3"];

    expect(
      commitHistoryValue(original, "   ", isDiceExpressionHistoryValue),
    ).toBe(original);
    expect(
      commitHistoryValue(original, "1d", isDiceExpressionHistoryValue),
    ).toBe(original);
  });

  it("caps history length at the default limit", (): void => {
    const original = Array.from({ length: HISTORY_LIMIT }, (_, index) => `${index}`);
    const next = commitHistoryValue(
      original,
      "999",
      isSignedIntegerHistoryValue,
    );

    expect(next).toHaveLength(HISTORY_LIMIT);
    expect(next[0]).toBe("999");
    expect(next[next.length - 1]).toBe("23");
  });
});
