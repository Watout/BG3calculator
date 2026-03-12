import { tryParseDiceExpression } from "@bg3dc/dice-parser";

export const HISTORY_LIMIT = 25;
export const MAX_REPEAT_COUNT = 20;
export const COMPACT_MENU_VISIBLE_ITEMS = 8;
export const REPEAT_OPTIONS = Object.freeze(
  Array.from({ length: MAX_REPEAT_COUNT }, (_, index) => `${index + 1}`),
);

export type HistoryValidator = (value: string) => boolean;

function normalizeValue(rawValue: string): string {
  return rawValue.trim();
}

export function isDiceExpressionHistoryValue(value: string): boolean {
  const normalized = normalizeValue(value);
  return normalized.length > 0 && tryParseDiceExpression(normalized).ok;
}

export function isSignedIntegerHistoryValue(value: string): boolean {
  const normalized = normalizeValue(value);
  return /^[+-]?\d+$/u.test(normalized);
}

export function commitHistoryValue(
  existing: readonly string[],
  rawValue: string,
  validate: HistoryValidator,
  limit = HISTORY_LIMIT,
): readonly string[] {
  const normalized = normalizeValue(rawValue);
  if (normalized.length === 0 || !validate(normalized)) {
    return existing;
  }

  return [
    normalized,
    ...existing.filter((entry) => entry !== normalized),
  ].slice(0, limit);
}
