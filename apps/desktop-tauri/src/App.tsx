import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode, UIEvent, WheelEvent } from "react";
import "./App.css";
import type {
  AttackPlanEntryInput,
  ComputeEntrySuccess,
  ComputeInput,
  ComputeOutput,
} from "./compute.worker";
import { commitHistoryValue, isExpressionHistoryValue } from "./inputHistory";
import {
  buildCompactNumericWindow,
  COMPACT_MENU_VISIBLE_ITEMS,
  COMPACT_OPTION_HEIGHT_PX,
  MAX_CRITICAL_THRESHOLD,
  MIN_CRITICAL_THRESHOLD,
  MIN_REPEAT_COUNT,
  getCompactNumericWindowValues,
  normalizeCompactNumericValue,
  shiftCompactNumericWindow,
  type CompactNumericWindowConfig,
} from "./compactNumericWindow";

interface UiResult {
  readonly expectedPerPlan: string;
  readonly expectedTotal: string;
  readonly fullCritExpectedPerPlan: string;
  readonly fullCritExpectedTotal: string;
  readonly entries: readonly ComputeEntrySuccess[];
}

type Entry = AttackPlanEntryInput;
type HistoryKey =
  | "mainHandDamageExprText"
  | "offHandDamageExprText"
  | "mainHandAttackBonusExprText"
  | "offHandAttackBonusExprText";
type HistoryState = Readonly<Record<HistoryKey, readonly string[]>>;

interface CompactNumericDropdownProps {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly descending?: boolean;
  readonly disabled?: boolean;
  readonly formatLabel?: (value: number) => string;
  readonly id?: string;
  readonly max?: number;
  readonly min?: number;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

interface CompactSelectOption<T extends string = string> {
  readonly label: string;
  readonly value: T;
}

interface CompactSelectDropdownProps<T extends string = string> {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly CompactSelectOption<T>[];
  readonly value: T;
}

interface HistoryTextInputProps {
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly history: readonly string[];
  readonly id?: string;
  readonly onChange: (value: string) => void;
  readonly onCommit: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}

interface InlineRepeatControlProps {
  readonly ariaLabel: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

interface LabelWithInfoProps {
  readonly controlId?: string;
  readonly info: string;
  readonly title: string;
  readonly trailing?: ReactNode;
}

interface FieldShellProps {
  readonly ariaHidden?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly controlId?: string;
  readonly info: string;
  readonly title: string;
  readonly trailing?: ReactNode;
}

const EMPTY_RESULT: UiResult = {
  expectedPerPlan: "-",
  expectedTotal: "-",
  fullCritExpectedPerPlan: "-",
  fullCritExpectedTotal: "-",
  entries: [],
};

const EMPTY_HISTORY: HistoryState = {
  mainHandDamageExprText: [],
  offHandDamageExprText: [],
  mainHandAttackBonusExprText: [],
  offHandAttackBonusExprText: [],
};

const HISTORY_VALIDATORS: Readonly<Record<HistoryKey, (value: string) => boolean>> = {
  mainHandDamageExprText: isExpressionHistoryValue,
  offHandDamageExprText: isExpressionHistoryValue,
  mainHandAttackBonusExprText: isExpressionHistoryValue,
  offHandAttackBonusExprText: isExpressionHistoryValue,
};

const ADVANTAGE_STATE_OPTIONS = [
  { value: "normal", label: "普通" },
  { value: "advantage", label: "优势" },
  { value: "disadvantage", label: "劣势" },
] as const satisfies readonly CompactSelectOption<Entry["advantageState"]>[];

const DAMAGE_MODIFIER_OPTIONS = [
  { value: "normal", label: "普通" },
  { value: "resistant", label: "抗性" },
  { value: "vulnerable", label: "易伤" },
  { value: "immune", label: "免疫" },
] as const satisfies readonly CompactSelectOption<Entry["modifier"]>[];

const DAMAGE_DICE_MODE_OPTIONS = [
  { value: "normal", label: "普通" },
  { value: "advantage", label: "多掷取高" },
  { value: "disadvantage", label: "多掷取低" },
] as const satisfies readonly CompactSelectOption<Entry["damageDiceMode"]>[];

function formatPlainNumber(value: number): string {
  return `${value}`;
}

function formatCriticalThreshold(value: number): string {
  return `${value}+`;
}

function resolveWindowScrollAnchor(itemCount: number): number {
  return Math.max(
    0,
    Math.floor((itemCount - COMPACT_MENU_VISIBLE_ITEMS) / 2) * COMPACT_OPTION_HEIGHT_PX,
  );
}

function makeDefaultEntry(): Entry {
  return {
    id: `entry-${crypto.randomUUID()}`,
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
  };
}

function cloneEntryWithNewId(entry: Entry): Entry {
  return {
    ...entry,
    id: `entry-${crypto.randomUUID()}`,
  };
}

function areStringListsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function useDismissiblePopup(
  isOpen: boolean,
  rootRef: { readonly current: HTMLElement | null },
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const root = rootRef.current;
      if (root !== null && !root.contains(target)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, rootRef]);
}

function HistoryTextInput({
  ariaLabel,
  disabled = false,
  history,
  id,
  onChange,
  onCommit,
  placeholder,
  value,
}: HistoryTextInputProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const suppressNextBlurRef = useRef(false);

  useDismissiblePopup(isOpen, rootRef, () => setIsOpen(false));

  return (
    <div ref={rootRef} className={`history-input-shell${disabled ? " disabled" : ""}`}>
      <input
        id={id}
        className="compact-input"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={() => {
          if (suppressNextBlurRef.current) {
            suppressNextBlurRef.current = false;
            return;
          }

          onCommit(value);
          setIsOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            suppressNextBlurRef.current = true;
            onCommit(value);
            setIsOpen(false);
            event.currentTarget.blur();
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            return;
          }

          if (event.key === "Escape") {
            setIsOpen(false);
          }
        }}
      />

      <button
        type="button"
        className="history-toggle"
        aria-label={`${ariaLabel}历史记录`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <span aria-hidden="true">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen ? (
        <div
          className="history-menu compact-dropdown-menu"
          role="listbox"
          aria-label={`${ariaLabel}历史记录`}
        >
          {history.length > 0 ? (
            history.map((item) => (
              <button
                key={item}
                type="button"
                className="history-option compact-option"
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item);
                  onCommit(item);
                  setIsOpen(false);
                }}
              >
                {item}
              </button>
            ))
          ) : (
            <div className="history-empty">暂无历史</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CompactNumericDropdown({
  ariaLabel,
  className,
  descending = false,
  disabled = false,
  formatLabel = formatPlainNumber,
  id,
  max,
  min = MIN_REPEAT_COUNT,
  onChange,
  value,
}: CompactNumericDropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const windowConfig = useMemo<CompactNumericWindowConfig>(
    () => ({
      descending,
      min,
      max,
    }),
    [descending, max, min],
  );
  const selectedValue = normalizeCompactNumericValue(value, windowConfig);
  const [windowStart, setWindowStart] = useState(() =>
    buildCompactNumericWindow(value, windowConfig).start,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);

  useDismissiblePopup(isOpen, rootRef, () => setIsOpen(false));

  useEffect(() => {
    const nextWindow = buildCompactNumericWindow(value, windowConfig);
    if (isOpen) {
      pendingScrollTopRef.current = nextWindow.initialScrollTop;
    }
    setWindowStart(nextWindow.start);
  }, [isOpen, value, windowConfig]);

  useLayoutEffect(() => {
    if (!isOpen || menuRef.current === null) {
      return;
    }

    const pendingScrollTop = pendingScrollTopRef.current;
    if (pendingScrollTop === null) {
      return;
    }

    menuRef.current.scrollTop = pendingScrollTop;
    pendingScrollTopRef.current = null;
  }, [isOpen, windowStart]);

  const renderedValues = useMemo(
    () => getCompactNumericWindowValues(windowStart, windowConfig),
    [windowConfig, windowStart],
  );

  const shiftWindow = (delta: number): void => {
    if (delta === 0) {
      return;
    }

    const nextStart = shiftCompactNumericWindow(windowStart, delta, windowConfig);
    if (nextStart === windowStart) {
      return;
    }

    pendingScrollTopRef.current = resolveWindowScrollAnchor(renderedValues.length);
    setWindowStart(nextStart);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>): void => {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    const steps = Math.max(1, Math.round(Math.abs(event.deltaY) / COMPACT_OPTION_HEIGHT_PX));
    shiftWindow(event.deltaY > 0 ? steps : -steps);
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    if (renderedValues.length <= COMPACT_MENU_VISIBLE_ITEMS) {
      return;
    }

    const listbox = event.currentTarget;
    const threshold = COMPACT_OPTION_HEIGHT_PX;
    if (listbox.scrollTop <= threshold) {
      shiftWindow(-1);
      return;
    }

    const bottomThreshold = listbox.scrollHeight - listbox.clientHeight - threshold;
    if (listbox.scrollTop >= bottomThreshold) {
      shiftWindow(1);
    }
  };

  const resolvedLabel = formatLabel(selectedValue);
  const resolvedClassName =
    className === undefined ? "compact-dropdown" : `compact-dropdown ${className}`;

  return (
    <div ref={rootRef} className={resolvedClassName}>
      <button
        id={id}
        type="button"
        className="compact-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <span className="compact-select-value">{resolvedLabel}</span>
        <span className="compact-select-icon" aria-hidden="true">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen ? (
        <div
          ref={menuRef}
          className="compact-dropdown-menu"
          role="listbox"
          aria-label={ariaLabel}
          onScroll={handleScroll}
          onWheel={handleWheel}
        >
          {renderedValues.map((optionValue) => (
            <button
              key={optionValue}
              type="button"
              className={`compact-option${optionValue === selectedValue ? " selected" : ""}`}
              role="option"
              aria-selected={optionValue === selectedValue}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(`${optionValue}`);
                setIsOpen(false);
              }}
            >
              {formatLabel(optionValue)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompactSelectDropdown<T extends string>({
  ariaLabel,
  className,
  disabled = false,
  id,
  onChange,
  options,
  value,
}: CompactSelectDropdownProps<T>): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useDismissiblePopup(isOpen, rootRef, () => setIsOpen(false));

  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const resolvedLabel = selectedOption?.label ?? `${value}`;
  const resolvedClassName =
    className === undefined ? "compact-dropdown" : `compact-dropdown ${className}`;

  return (
    <div ref={rootRef} className={resolvedClassName}>
      <button
        id={id}
        type="button"
        className="compact-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <span className="compact-select-value">{resolvedLabel}</span>
        <span className="compact-select-icon" aria-hidden="true">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen ? (
        <div className="compact-dropdown-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`compact-option${option.value === value ? " selected" : ""}`}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InfoHint({ text }: { readonly text: string }): JSX.Element {
  const [isVisible, setIsVisible] = useState(false);
  const tipId = useId();

  return (
    <button
      type="button"
      className="info-hint"
      aria-label={text}
      aria-describedby={isVisible ? tipId : undefined}
      onPointerEnter={() => setIsVisible(true)}
      onPointerLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      i
      {isVisible ? (
        <span id={tipId} role="tooltip" className="info-tip">
          {text}
        </span>
      ) : null}
    </button>
  );
}

export function InlineRepeatControl({
  ariaLabel,
  label,
  onChange,
  value,
}: InlineRepeatControlProps): JSX.Element {
  return (
    <span className="label-repeat-inline">
      <span className="label-repeat-text">{label}</span>
      <CompactNumericDropdown
        ariaLabel={ariaLabel}
        className="entry-repeat-dropdown label-repeat-dropdown"
        value={value}
        onChange={onChange}
      />
    </span>
  );
}

export function LabelWithInfo({
  controlId,
  info,
  title,
  trailing,
}: LabelWithInfoProps): JSX.Element {
  const titleNode =
    controlId === undefined ? (
      <span className="label-title">{title}</span>
    ) : (
      <label className="label-title label-title-link" htmlFor={controlId}>
        {title}
      </label>
    );

  return (
    <span className="label-with-info">
      <span className="label-heading">
        {titleNode}
        <InfoHint text={info} />
      </span>
      {trailing === undefined ? null : (
        <span className="label-trailing">{trailing}</span>
      )}
    </span>
  );
}

function FieldShell({
  ariaHidden,
  children,
  className,
  controlId,
  info,
  title,
  trailing,
}: FieldShellProps): JSX.Element {
  const resolvedClassName = className === undefined ? "field-shell" : `field-shell ${className}`;

  return (
    <div className={resolvedClassName} aria-hidden={ariaHidden}>
      <LabelWithInfo
        controlId={controlId}
        title={title}
        info={info}
        trailing={trailing}
      />
      {children}
    </div>
  );
}

function findEntryResult(
  results: readonly ComputeEntrySuccess[],
  id: string,
): ComputeEntrySuccess | null {
  for (const result of results) {
    if (result.id === id) {
      return result;
    }
  }

  return null;
}

function App(): JSX.Element {
  const [entries, setEntries] = useState<readonly Entry[]>([
    makeDefaultEntry(),
  ]);
  const [historyState, setHistoryState] = useState<HistoryState>(EMPTY_HISTORY);
  const [planCountText, setPlanCountText] = useState("1");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<UiResult>(EMPTY_RESULT);
  const [isComputing, setIsComputing] = useState(false);

  const activeWorkerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);

  const parsedPlanCount = Number(planCountText);

  const computeInput = useMemo<ComputeInput>(
    () => ({
      entries,
      planCountText,
      requestId: 0,
    }),
    [entries, planCountText],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }

      if (activeWorkerRef.current !== null) {
        activeWorkerRef.current.terminate();
        activeWorkerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (activeWorkerRef.current !== null) {
      activeWorkerRef.current.terminate();
      activeWorkerRef.current = null;
    }

    setIsComputing(true);

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    debounceTimerRef.current = window.setTimeout(() => {
      const worker = new Worker(
        new URL("./compute.worker.ts", import.meta.url),
        {
          type: "module",
        },
      );

      activeWorkerRef.current = worker;

      worker.onmessage = (event: MessageEvent<ComputeOutput>): void => {
        const payload = event.data;
        if (payload.requestId !== requestIdRef.current) {
          worker.terminate();
          return;
        }

        if (!payload.ok) {
          setErrorMessage(payload.errorMessage);
          setResult(EMPTY_RESULT);
        } else {
          setErrorMessage("");
          setResult({
            expectedPerPlan: payload.expectedPerPlan,
            expectedTotal: payload.expectedTotal,
            fullCritExpectedPerPlan: payload.fullCritExpectedPerPlan,
            fullCritExpectedTotal: payload.fullCritExpectedTotal,
            entries: payload.entries,
          });
        }

        setIsComputing(false);
        worker.terminate();
        if (activeWorkerRef.current === worker) {
          activeWorkerRef.current = null;
        }
      };

      worker.onerror = (): void => {
        setErrorMessage("计算线程异常终止，请重试");
        setResult(EMPTY_RESULT);
        setIsComputing(false);
        worker.terminate();
        if (activeWorkerRef.current === worker) {
          activeWorkerRef.current = null;
        }
      };

      worker.postMessage({
        ...computeInput,
        requestId,
      });
    }, 120);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [computeInput]);

  const addEntry = (): void => {
    setEntries((previous) => {
      const last = previous[previous.length - 1] ?? makeDefaultEntry();
      return [...previous, cloneEntryWithNewId(last)];
    });
  };

  const removeEntry = (id: string): void => {
    setEntries((previous) => {
      if (previous.length <= 1) {
        return previous;
      }

      return previous.filter((entry) => entry.id !== id);
    });
  };

  const updateEntry = (id: string, patch: Partial<Entry>): void => {
    setEntries((previous) =>
      previous.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const commitHistory = (key: HistoryKey, rawValue: string): void => {
    const validate = HISTORY_VALIDATORS[key];
    setHistoryState((previous) => {
      const nextItems = commitHistoryValue(previous[key], rawValue, validate);
      if (nextItems === previous[key] || areStringListsEqual(nextItems, previous[key])) {
        return previous;
      }

      return {
        ...previous,
        [key]: nextItems,
      };
    });
  };

  return (
    <main className="app-shell">
      <div
        className={`compute-overlay${isComputing ? " visible" : ""}`}
        aria-live="polite"
        aria-busy={isComputing}
      >
        <div className="compute-banner">正在计算...</div>
      </div>

      <section className="hero">
        <h1>博德之门3 伤害期望计算器</h1>
      </section>

      <section className="panel">
        <div className="plan-toolbar">
          <FieldShell
            className="plan-count-field"
            controlId="plan-count"
            title="模板执行次数"
            info="对整套攻击编排重复执行的次数。总期望伤害 = 每轮模板期望伤害 × 模板执行次数。"
          >
            <CompactNumericDropdown
              id="plan-count"
              value={planCountText}
              ariaLabel="模板执行次数"
              className="field-compact-dropdown"
              onChange={setPlanCountText}
            />
          </FieldShell>
        </div>

        <div className="entry-list">
          {entries.map((entry, index) => {
            const entryResult = findEntryResult(result.entries, entry.id);
            const isNormalDamageMode = entry.damageDiceMode === "normal";
            const hasResolvedOffHand = entryResult?.hasOffHandStep === true;
            const mainHandDamageId = `${entry.id}-main-hand-damage`;
            const mainHandAttackBonusId = `${entry.id}-main-hand-attack-bonus`;
            const offHandDamageId = `${entry.id}-off-hand-damage`;
            const offHandAttackBonusId = `${entry.id}-off-hand-attack-bonus`;
            const armorClassId = `${entry.id}-armor-class`;
            const advantageStateId = `${entry.id}-advantage-state`;
            const modifierId = `${entry.id}-modifier`;
            const damageDiceModeId = `${entry.id}-damage-dice-mode`;
            const damageRollCountId = `${entry.id}-damage-roll-count`;
            const criticalThresholdId = `${entry.id}-critical-threshold`;
            const halflingLuckyId = `${entry.id}-halfling-lucky`;

            return (
              <article key={entry.id} className="entry-card">
                <header className="entry-head">
                  <div className="entry-head-main">
                    <h2>攻击项 {index + 1}</h2>
                  </div>
                  <button
                    type="button"
                    className="entry-remove"
                    onClick={() => removeEntry(entry.id)}
                    disabled={entries.length <= 1}
                  >
                    删除
                  </button>
                </header>

                <div className="grid three">
                  <div className="span-3 hand-row">
                    <FieldShell
                      controlId={mainHandDamageId}
                      title="主手伤害骰表达式"
                      info="例如 1d8+3、2d6+1。重击时只翻倍骰子部分，不翻倍常数。"
                      trailing={
                        <InlineRepeatControl
                          ariaLabel={`攻击项 ${index + 1} 主手执行次数`}
                          label="主手执行"
                          value={entry.mainHandRepeatText}
                          onChange={(value) =>
                            updateEntry(entry.id, {
                              mainHandRepeatText: value,
                            })
                          }
                        />
                      }
                    >
                      <HistoryTextInput
                        id={mainHandDamageId}
                        ariaLabel={`攻击项 ${index + 1} 主手伤害骰表达式`}
                        value={entry.mainHandDamageExprText}
                        history={historyState.mainHandDamageExprText}
                        onChange={(value) =>
                          updateEntry(entry.id, {
                            mainHandDamageExprText: value,
                          })
                        }
                        onCommit={(value) =>
                          commitHistory("mainHandDamageExprText", value)
                        }
                      />
                    </FieldShell>

                    <FieldShell
                      controlId={mainHandAttackBonusId}
                      title="主手攻击加值"
                      info="支持完整表达式，如 5、1d4+5、2+1d6。主手命中判定使用 d20 + 主手攻击加值表达式。"
                    >
                      <HistoryTextInput
                        id={mainHandAttackBonusId}
                        ariaLabel={`攻击项 ${index + 1} 主手攻击加值表达式`}
                        value={entry.mainHandAttackBonusExprText}
                        history={historyState.mainHandAttackBonusExprText}
                        onChange={(value) =>
                          updateEntry(entry.id, {
                            mainHandAttackBonusExprText: value,
                          })
                        }
                        onCommit={(value) =>
                          commitHistory("mainHandAttackBonusExprText", value)
                        }
                      />
                    </FieldShell>
                  </div>

                  <div className="span-3 hand-row">
                    <FieldShell
                      controlId={offHandDamageId}
                      title="副手伤害骰表达式"
                      info="留空表示该攻击项不计算副手段；此时副手执行次数与副手攻击加值会被忽略。填写后自动按主手+副手双段聚合。"
                      trailing={
                        <InlineRepeatControl
                          ariaLabel={`攻击项 ${index + 1} 副手执行次数`}
                          label="副手执行"
                          value={entry.offHandRepeatText}
                          onChange={(value) =>
                            updateEntry(entry.id, {
                              offHandRepeatText: value,
                            })
                          }
                        />
                      }
                    >
                      <HistoryTextInput
                        id={offHandDamageId}
                        ariaLabel={`攻击项 ${index + 1} 副手伤害骰表达式`}
                        value={entry.offHandDamageExprText}
                        placeholder="例如 1d6+2（留空表示不使用副手）"
                        history={historyState.offHandDamageExprText}
                        onChange={(value) =>
                          updateEntry(entry.id, {
                            offHandDamageExprText: value,
                          })
                        }
                        onCommit={(value) =>
                          commitHistory("offHandDamageExprText", value)
                        }
                      />
                    </FieldShell>

                    <FieldShell
                      controlId={offHandAttackBonusId}
                      title="副手攻击加值"
                      info="支持完整表达式，如 5、1d4+5、2+1d6。仅在副手伤害表达式非空时参与计算。"
                    >
                      <HistoryTextInput
                        id={offHandAttackBonusId}
                        ariaLabel={`攻击项 ${index + 1} 副手攻击加值表达式`}
                        value={entry.offHandAttackBonusExprText}
                        history={historyState.offHandAttackBonusExprText}
                        onChange={(value) =>
                          updateEntry(entry.id, {
                            offHandAttackBonusExprText: value,
                          })
                        }
                        onCommit={(value) =>
                          commitHistory("offHandAttackBonusExprText", value)
                        }
                      />
                    </FieldShell>
                  </div>

                  <FieldShell
                    controlId={armorClassId}
                    title="目标护甲等级（AC）"
                    info="命中门槛。除自动命中/重击规则外，d20 + 攻击加值 >= AC 视为命中。"
                  >
                    <input
                      id={armorClassId}
                      value={entry.armorClassText}
                      onChange={(event) =>
                        updateEntry(entry.id, {
                          armorClassText: event.currentTarget.value,
                        })
                      }
                    />
                  </FieldShell>

                  <FieldShell
                    controlId={advantageStateId}
                    title="攻击掷骰状态"
                    info="普通/优势/劣势。优势取两次 d20 高值，劣势取低值。"
                  >
                    <CompactSelectDropdown
                      id={advantageStateId}
                      ariaLabel={`攻击项 ${index + 1} 攻击掷骰状态`}
                      className="field-compact-dropdown"
                      options={ADVANTAGE_STATE_OPTIONS}
                      value={entry.advantageState}
                      onChange={(nextValue) =>
                        updateEntry(entry.id, {
                          advantageState: nextValue,
                        })
                      }
                    />
                  </FieldShell>

                  <FieldShell
                    controlId={modifierId}
                    title="目标伤害修正"
                    info="普通/抗性/易伤/免疫。抗性减半向下取整，易伤翻倍，免疫为 0。"
                  >
                    <CompactSelectDropdown
                      id={modifierId}
                      ariaLabel={`攻击项 ${index + 1} 目标伤害修正`}
                      className="field-compact-dropdown"
                      options={DAMAGE_MODIFIER_OPTIONS}
                      value={entry.modifier}
                      onChange={(nextValue) =>
                        updateEntry(entry.id, {
                          modifier: nextValue,
                        })
                      }
                    />
                  </FieldShell>

                  <FieldShell
                    controlId={damageDiceModeId}
                    title="伤害骰模式"
                    info="普通/多掷取高/多掷取低。仅影响伤害骰结果，不影响攻击检定。"
                  >
                    <CompactSelectDropdown
                      id={damageDiceModeId}
                      ariaLabel={`攻击项 ${index + 1} 伤害骰模式`}
                      className="field-compact-dropdown"
                      options={DAMAGE_DICE_MODE_OPTIONS}
                      value={entry.damageDiceMode}
                      onChange={(nextValue) =>
                        updateEntry(entry.id, {
                          damageDiceMode: nextValue,
                        })
                      }
                    />
                  </FieldShell>

                  {isNormalDamageMode ? (
                    <FieldShell
                      className="ghost-field"
                      ariaHidden
                      controlId={damageRollCountId}
                      title="多掷取高/低次数"
                      info="伤害骰模式为多掷取高/低时生效，取值范围 2 到 5。"
                    >
                      <select id={damageRollCountId} disabled>
                        <option value="2">2</option>
                      </select>
                    </FieldShell>
                  ) : (
                    <FieldShell
                      controlId={damageRollCountId}
                      title="多掷取高/低次数"
                      info="伤害骰模式为多掷取高/低时生效，取值范围 2 到 5。"
                    >
                      <select
                        id={damageRollCountId}
                        value={entry.damageRollCountText}
                        onChange={(event) =>
                          updateEntry(entry.id, {
                            damageRollCountText: event.currentTarget.value,
                          })
                        }
                      >
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                      </select>
                    </FieldShell>
                  )}

                  <FieldShell
                    controlId={criticalThresholdId}
                    title="重击阈值"
                    info="范围 1+ 到 20+。天然 1 仍会自动失手，重击时伤害骰子 X2。"
                  >
                    <CompactNumericDropdown
                      id={criticalThresholdId}
                      ariaLabel={`攻击项 ${index + 1} 重击阈值`}
                      className="field-compact-dropdown"
                      descending
                      formatLabel={formatCriticalThreshold}
                      min={MIN_CRITICAL_THRESHOLD}
                      max={MAX_CRITICAL_THRESHOLD}
                      value={entry.criticalThresholdText}
                      onChange={(nextValue) =>
                        updateEntry(entry.id, {
                          criticalThresholdText: nextValue,
                        })
                      }
                    />
                  </FieldShell>

                  <FieldShell
                    controlId={halflingLuckyId}
                    title="半身人幸运"
                    info="开启后，攻击检定掷到 1 时重掷一次。"
                  >
                    <label className="checkbox-row" htmlFor={halflingLuckyId}>
                      <input
                        id={halflingLuckyId}
                        type="checkbox"
                        checked={entry.halflingLucky}
                        onChange={(event) =>
                          updateEntry(entry.id, {
                            halflingLucky: event.currentTarget.checked,
                          })
                        }
                      />
                      <span>{entry.halflingLucky ? "已开启" : "未开启"}</span>
                    </label>
                  </FieldShell>
                </div>

                <div className="entry-result">
                  <p>
                    该项每轮期望伤害：{entryResult?.expectedPerEntry ?? "-"}
                  </p>
                  <p>
                    主手单次期望伤害：{entryResult?.expectedMainHand ?? "-"}
                  </p>
                  <p>
                    主手总期望伤害（{entryResult?.mainHandRepeat ?? 1} 次）：
                    {entryResult?.expectedMainHandTotal ?? "-"}
                  </p>
                  {hasResolvedOffHand ? (
                    <p>副手单次期望伤害：{entryResult?.expectedOffHand ?? "-"}</p>
                  ) : null}
                  {hasResolvedOffHand ? (
                    <p>
                      副手总期望伤害（{entryResult?.offHandRepeat ?? 0} 次）：
                      {entryResult?.expectedOffHandTotal ?? "-"}
                    </p>
                  ) : null}
                  <p>
                    主手命中条件下期望伤害：
                    {entryResult?.expectedOnHitMainHand ?? "-"}
                  </p>
                  <p>
                    主手重击条件下期望伤害：
                    {entryResult?.expectedOnCritMainHand ?? "-"}
                  </p>
                  {hasResolvedOffHand ? (
                    <p>
                      副手命中条件下期望伤害：
                      {entryResult?.expectedOnHitOffHand ?? "-"}
                    </p>
                  ) : null}
                  {hasResolvedOffHand ? (
                    <p>
                      副手重击条件下期望伤害：
                      {entryResult?.expectedOnCritOffHand ?? "-"}
                    </p>
                  ) : null}
                  <p>
                    主手命中概率：
                    {entryResult?.mainHandProbabilitySummary ?? "-"}
                  </p>
                  {hasResolvedOffHand ? (
                    <p>
                      副手命中概率：
                      {entryResult?.offHandProbabilitySummary ?? "-"}
                    </p>
                  ) : null}
                </div>

                {index === entries.length - 1 ? (
                  <div className="entry-actions">
                    <button
                      type="button"
                      className="entry-add"
                      onClick={addEntry}
                    >
                      + 添加攻击项
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {errorMessage.length > 0 ? (
          <p className="error">{errorMessage}</p>
        ) : null}
      </section>

      <section className="panel result">
        <h2>总结果</h2>
        <p>
          总期望伤害（{Math.max(1, Math.floor(parsedPlanCount || 1))} 轮模板）：
          {result.expectedTotal}
        </p>
        <p>
          必中全重击状态下总期望伤害（{Math.max(1, Math.floor(parsedPlanCount || 1))} 轮模板）：
          {result.fullCritExpectedTotal}
        </p>
      </section>
    </main>
  );
}

export default App;
