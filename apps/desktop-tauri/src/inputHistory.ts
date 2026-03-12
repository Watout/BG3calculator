import { tryParseDiceExpression } from "@bg3dc/dice-parser";

export const HISTORY_LIMIT = 25;

export type HistoryValidator = (value: string) => boolean;

function normalizeValue(rawValue: string): string {
  return rawValue.trim();
}

export function isExpressionHistoryValue(value: string): boolean {
  const normalized = normalizeValue(value);
  return normalized.length > 0 && tryParseDiceExpression(normalized).ok;
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
