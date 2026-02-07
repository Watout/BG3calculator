import { describe, expect, it } from "vitest";
import { formatDiceExpression, parseDiceExpression, tryParseDiceExpression } from "./index";

describe("dice-parser test harness", (): void => {
  it("loads workspace test config", (): void => {
    expect(true).toBe(true);
  });

  it("parses comma bonus syntax", (): void => {
    const parsed = parseDiceExpression("1d20,5");

    expect(parsed.normalized).toBe("1d20+5");
    expect(parsed.components).toEqual([
      { kind: "dice", count: 1, sides: 20, sign: 1 },
      { kind: "constant", value: 5 }
    ]);
  });

  it("parses NdM with plus and minus", (): void => {
    const parsed = parseDiceExpression("2d6 + 3 - d4");

    expect(parsed.normalized).toBe("2d6+3-1d4");
    expect(parsed.components).toEqual([
      { kind: "dice", count: 2, sides: 6, sign: 1 },
      { kind: "constant", value: 3 },
      { kind: "dice", count: 1, sides: 4, sign: -1 }
    ]);
  });

  it("formats expression components canonically", (): void => {
    const text = formatDiceExpression([
      { kind: "dice", count: 3, sides: 8, sign: 1 },
      { kind: "constant", value: -2 },
      { kind: "dice", count: 1, sides: 6, sign: 1 }
    ]);

    expect(text).toBe("3d8-2+1d6");
  });

  it("returns detailed parse error", (): void => {
    const result = tryParseDiceExpression("1d+");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issue.message).toContain("缺少骰子面数");
      expect(result.error.issue.index).toBe(2);
    }
  });
});
