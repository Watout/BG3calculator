import { describe, expect, it } from "vitest";
import {
  buildCompactNumericWindow,
  COMPACT_MENU_VISIBLE_ITEMS,
  COMPACT_MENU_WINDOW_BUFFER,
  MAX_CRITICAL_THRESHOLD,
  MIN_CRITICAL_THRESHOLD,
  getCompactNumericWindowStart,
  getCompactNumericWindowValues,
  normalizeCompactNumericValue,
  shiftCompactNumericWindow,
} from "./compactNumericWindow";

describe("compact numeric window helpers", (): void => {
  it("uses an 8-item viewport with a 2-item sliding buffer", (): void => {
    expect(COMPACT_MENU_VISIBLE_ITEMS).toBe(8);
    expect(COMPACT_MENU_WINDOW_BUFFER).toBe(2);
  });

  it("centers unbounded windows around the current repeat value", (): void => {
    const windowState = buildCompactNumericWindow("25", { min: 1 });
    const values = getCompactNumericWindowValues(windowState.start, { min: 1 });

    expect(windowState.start).toBe(18);
    expect(windowState.initialScrollTop).toBe(60);
    expect(values.slice(0, 4)).toEqual([19, 20, 21, 22]);
    expect(values[values.length - 1]).toBe(30);
  });

  it("clamps bounded windows at the critical-threshold ceiling", (): void => {
    const start = getCompactNumericWindowStart(20, {
      min: MIN_CRITICAL_THRESHOLD,
      max: MAX_CRITICAL_THRESHOLD,
    });
    const windowState = buildCompactNumericWindow("20", {
      min: MIN_CRITICAL_THRESHOLD,
      max: MAX_CRITICAL_THRESHOLD,
    });
    const values = getCompactNumericWindowValues(start, {
      min: MIN_CRITICAL_THRESHOLD,
      max: MAX_CRITICAL_THRESHOLD,
    });

    expect(start).toBe(8);
    expect(windowState.initialScrollTop).toBe(120);
    expect(values[0]).toBe(9);
    expect(values[values.length - 1]).toBe(20);
  });

  it("supports descending bounded windows for critical-threshold presentation", (): void => {
    const windowState = buildCompactNumericWindow("20", {
      min: MIN_CRITICAL_THRESHOLD,
      max: MAX_CRITICAL_THRESHOLD,
      descending: true,
    });
    const values = getCompactNumericWindowValues(windowState.start, {
      min: MIN_CRITICAL_THRESHOLD,
      max: MAX_CRITICAL_THRESHOLD,
      descending: true,
    });

    expect(windowState.start).toBe(0);
    expect(windowState.initialScrollTop).toBe(0);
    expect(values.slice(0, 4)).toEqual([20, 19, 18, 17]);
    expect(values[values.length - 1]).toBe(9);
  });

  it("normalizes invalid values back into the configured numeric range", (): void => {
    expect(normalizeCompactNumericValue("", { min: 1 })).toBe(1);
    expect(
      normalizeCompactNumericValue("0", {
        min: MIN_CRITICAL_THRESHOLD,
        max: MAX_CRITICAL_THRESHOLD,
      }),
    ).toBe(1);
    expect(
      normalizeCompactNumericValue("42", {
        min: MIN_CRITICAL_THRESHOLD,
        max: MAX_CRITICAL_THRESHOLD,
      }),
    ).toBe(20);
  });

  it("slides one step at a time without crossing configured bounds", (): void => {
    expect(shiftCompactNumericWindow(0, -5, { min: 1 })).toBe(0);
    expect(shiftCompactNumericWindow(0, 4, { min: 1 })).toBe(4);
    expect(
      shiftCompactNumericWindow(8, 99, {
        min: MIN_CRITICAL_THRESHOLD,
        max: MAX_CRITICAL_THRESHOLD,
      }),
    ).toBe(8);
  });
});
