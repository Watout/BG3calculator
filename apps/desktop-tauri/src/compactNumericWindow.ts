export const COMPACT_MENU_VISIBLE_ITEMS = 8;
export const COMPACT_MENU_WINDOW_BUFFER = 2;
export const COMPACT_OPTION_HEIGHT_PX = 30;
export const MIN_REPEAT_COUNT = 1;
export const MIN_CRITICAL_THRESHOLD = 1;
export const MAX_CRITICAL_THRESHOLD = 20;

export interface CompactNumericWindowConfig {
  readonly descending?: boolean;
  readonly min: number;
  readonly max?: number;
  readonly visibleItems?: number;
  readonly bufferItems?: number;
}

export interface CompactNumericWindowState {
  readonly initialScrollTop: number;
  readonly selectedIndex: number;
  readonly start: number;
  readonly values: readonly number[];
}

function resolveVisibleItems(config: CompactNumericWindowConfig): number {
  return config.visibleItems ?? COMPACT_MENU_VISIBLE_ITEMS;
}

function resolveBufferItems(config: CompactNumericWindowConfig): number {
  return config.bufferItems ?? COMPACT_MENU_WINDOW_BUFFER;
}

export function getCompactNumericWindowSize(config: CompactNumericWindowConfig): number {
  return resolveVisibleItems(config) + resolveBufferItems(config) * 2;
}

function getCompactNumericItemCount(config: CompactNumericWindowConfig): number | undefined {
  if (config.max === undefined) {
    return undefined;
  }

  return config.max - config.min + 1;
}

function usesDescendingWindow(config: CompactNumericWindowConfig): boolean {
  return config.descending === true && config.max !== undefined;
}

function getCompactNumericSelectedIndex(
  value: number,
  config: CompactNumericWindowConfig,
): number {
  if (usesDescendingWindow(config)) {
    return config.max! - value;
  }

  return value - config.min;
}

function getCompactNumericValueAtIndex(
  index: number,
  config: CompactNumericWindowConfig,
): number {
  if (usesDescendingWindow(config)) {
    return config.max! - index;
  }

  return config.min + index;
}

export function clampCompactNumericValue(
  value: number,
  config: CompactNumericWindowConfig,
): number {
  const normalized = Math.max(config.min, Math.floor(value));
  if (config.max === undefined) {
    return normalized;
  }

  return Math.min(config.max, normalized);
}

export function normalizeCompactNumericValue(
  value: string,
  config: CompactNumericWindowConfig,
): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return config.min;
  }

  return clampCompactNumericValue(parsed, config);
}

export function clampCompactNumericWindowStart(
  start: number,
  config: CompactNumericWindowConfig,
): number {
  const normalized = Math.max(0, Math.floor(start));
  const itemCount = getCompactNumericItemCount(config);
  if (itemCount === undefined) {
    return normalized;
  }

  const windowSize = getCompactNumericWindowSize(config);
  const maxStart = Math.max(0, itemCount - windowSize);
  return Math.min(normalized, maxStart);
}

export function getCompactNumericWindowStart(
  value: number,
  config: CompactNumericWindowConfig,
): number {
  const normalizedValue = clampCompactNumericValue(value, config);
  const selectedIndex = getCompactNumericSelectedIndex(normalizedValue, config);
  const itemCount = getCompactNumericItemCount(config);
  const visibleItems = resolveVisibleItems(config);
  const viewportStartIndex =
    itemCount === undefined
      ? Math.max(0, selectedIndex - Math.floor(visibleItems / 2))
      : Math.min(
          Math.max(0, selectedIndex - Math.floor(visibleItems / 2)),
          Math.max(0, itemCount - visibleItems),
        );

  return clampCompactNumericWindowStart(
    viewportStartIndex - resolveBufferItems(config),
    config,
  );
}

export function shiftCompactNumericWindow(
  start: number,
  delta: number,
  config: CompactNumericWindowConfig,
): number {
  return clampCompactNumericWindowStart(start + Math.trunc(delta), config);
}

export function getCompactNumericWindowValues(
  start: number,
  config: CompactNumericWindowConfig,
): readonly number[] {
  const clampedStart = clampCompactNumericWindowStart(start, config);
  const windowSize = getCompactNumericWindowSize(config);
  const itemCount = getCompactNumericItemCount(config);
  const length =
    itemCount === undefined
      ? windowSize
      : Math.max(0, Math.min(windowSize, itemCount - clampedStart));

  return Array.from({ length }, (_, index) =>
    getCompactNumericValueAtIndex(clampedStart + index, config),
  );
}

export function buildCompactNumericWindow(
  value: string,
  config: CompactNumericWindowConfig,
): CompactNumericWindowState {
  const normalizedValue = normalizeCompactNumericValue(value, config);
  const selectedIndex = getCompactNumericSelectedIndex(normalizedValue, config);
  const itemCount = getCompactNumericItemCount(config);
  const visibleItems = resolveVisibleItems(config);
  const viewportStartIndex =
    itemCount === undefined
      ? Math.max(0, selectedIndex - Math.floor(visibleItems / 2))
      : Math.min(
          Math.max(0, selectedIndex - Math.floor(visibleItems / 2)),
          Math.max(0, itemCount - visibleItems),
        );
  const start = clampCompactNumericWindowStart(
    viewportStartIndex - resolveBufferItems(config),
    config,
  );

  return {
    initialScrollTop: Math.max(0, viewportStartIndex - start) * COMPACT_OPTION_HEIGHT_PX,
    selectedIndex,
    start,
    values: getCompactNumericWindowValues(start, config),
  };
}
