import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import "./App.css";
import type {
  AttackBonusDie,
  AttackPlanEntryInput,
  ComputeEntrySuccess,
  ComputeInput,
  ComputeOutput,
} from "./compute.worker";
import {
  REPEAT_OPTIONS,
  commitHistoryValue,
  isDiceExpressionHistoryValue,
  isSignedIntegerHistoryValue,
} from "./inputHistory";

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
  | "mainHandAttackBonusFixedText"
  | "offHandAttackBonusFixedText";
type HistoryState = Readonly<Record<HistoryKey, readonly string[]>>;

interface CompactDropdownOption {
  readonly value: string;
  readonly label: string;
}

interface CompactDropdownProps {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
  readonly options: readonly CompactDropdownOption[];
  readonly value: string;
}

interface HistoryTextInputProps {
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly history: readonly string[];
  readonly onChange: (value: string) => void;
  readonly onCommit: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
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
  mainHandAttackBonusFixedText: [],
  offHandAttackBonusFixedText: [],
};

const ATTACK_BONUS_DIE_OPTIONS: readonly AttackBonusDie[] = [
  "none",
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "1d12",
];

const REPEAT_DROPDOWN_OPTIONS: readonly CompactDropdownOption[] = REPEAT_OPTIONS.map((value) => ({
  value,
  label: value,
}));

const HISTORY_VALIDATORS: Readonly<Record<HistoryKey, (value: string) => boolean>> = {
  mainHandDamageExprText: isDiceExpressionHistoryValue,
  offHandDamageExprText: isDiceExpressionHistoryValue,
  mainHandAttackBonusFixedText: isSignedIntegerHistoryValue,
  offHandAttackBonusFixedText: isSignedIntegerHistoryValue,
};

function makeDefaultEntry(): Entry {
  return {
    id: `entry-${crypto.randomUUID()}`,
    mainHandRepeatText: "1",
    offHandRepeatText: "1",
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

function CompactDropdown({
  ariaLabel,
  className,
  disabled = false,
  onChange,
  options,
  value,
}: CompactDropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useDismissiblePopup(isOpen, rootRef, () => setIsOpen(false));

  const selectedOption = options.find((option) => option.value === value);
  const resolvedLabel = selectedOption?.label ?? value;
  const resolvedClassName =
    className === undefined ? "compact-dropdown" : `compact-dropdown ${className}`;

  return (
    <div ref={rootRef} className={resolvedClassName}>
      <button
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

function HistoryTextInput({
  ariaLabel,
  disabled = false,
  history,
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

function InfoHint({ text }: { readonly text: string }): JSX.Element {
  return (
    <button type="button" className="info-hint" aria-label={text}>
      i
      <span role="tooltip" className="info-tip">
        {text}
      </span>
    </button>
  );
}

function LabelWithInfo({
  title,
  info,
}: {
  readonly title: string;
  readonly info: string;
}): JSX.Element {
  return (
    <span className="label-title">
      {title}
      <InfoHint text={info} />
    </span>
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
          <label className="plan-count-field">
            <LabelWithInfo
              title="模板执行次数"
              info="对整套攻击编排重复执行的次数。总期望伤害 = 每轮模板期望伤害 × 模板执行次数。"
            />
            <select
              value={planCountText}
              onChange={(event) => setPlanCountText(event.currentTarget.value)}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
              <option value="8">8</option>
              <option value="9">9</option>
              <option value="10">10</option>
            </select>
          </label>
        </div>

        <div className="entry-list">
          {entries.map((entry, index) => {
            const entryResult = findEntryResult(result.entries, entry.id);
            const isNormalDamageMode = entry.damageDiceMode === "normal";
            const hasOffHand = entry.offHandDamageExprText.trim().length > 0;
            const hasResolvedOffHand = entryResult?.hasOffHandStep === true;

            return (
              <article key={entry.id} className="entry-card">
                <header className="entry-head">
                  <div className="entry-head-main">
                    <h2>攻击项 {index + 1}</h2>
                    <div className="entry-repeat-inline">
                      <span className="entry-repeat-label">主手执行</span>
                      <CompactDropdown
                        ariaLabel={`攻击项 ${index + 1} 主手执行次数`}
                        className="entry-repeat-dropdown"
                        value={entry.mainHandRepeatText}
                        options={REPEAT_DROPDOWN_OPTIONS}
                        onChange={(value) =>
                          updateEntry(entry.id, {
                            mainHandRepeatText: value,
                          })
                        }
                      />
                    </div>
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
                    <label>
                      <LabelWithInfo
                        title="主手伤害骰表达式"
                        info="例如 1d8+3、2d6+1。重击时只翻倍骰子部分，不翻倍常数。"
                      />
                      <HistoryTextInput
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
                    </label>

                    <label>
                      <LabelWithInfo
                        title="主手攻击加值"
                        info="先填固定值，再可选附加骰（如祝福 1d4）。主手命中判定使用 d20 + 主手攻击加值。"
                      />
                      <div className="inline-row attack-bonus-row">
                        <HistoryTextInput
                          ariaLabel={`攻击项 ${index + 1} 主手攻击加值固定值`}
                          value={entry.mainHandAttackBonusFixedText}
                          history={historyState.mainHandAttackBonusFixedText}
                          onChange={(value) =>
                            updateEntry(entry.id, {
                              mainHandAttackBonusFixedText: value,
                            })
                          }
                          onCommit={(value) =>
                            commitHistory("mainHandAttackBonusFixedText", value)
                          }
                        />
                        <select
                          className="compact-select"
                          value={entry.mainHandAttackBonusDie}
                          onChange={(event) =>
                            updateEntry(entry.id, {
                              mainHandAttackBonusDie: event.currentTarget
                                .value as AttackBonusDie,
                            })
                          }
                        >
                          {ATTACK_BONUS_DIE_OPTIONS.map((die) => (
                            <option key={die} value={die}>
                              {die === "none" ? "无" : die}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  </div>

                  <div className="span-3 hand-row">
                    <label>
                      <LabelWithInfo
                        title="副手伤害骰表达式"
                        info="留空表示该攻击项不计算副手段；填写后自动按主手+副手双段聚合。"
                      />
                      <HistoryTextInput
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
                    </label>

                    {hasOffHand ? (
                      <label>
                        <LabelWithInfo
                          title="副手攻击加值"
                          info="仅在副手存在时生效。副手命中判定使用 d20 + 副手攻击加值。"
                        />
                        <div className="inline-row attack-bonus-row">
                          <HistoryTextInput
                            ariaLabel={`攻击项 ${index + 1} 副手攻击加值固定值`}
                            value={entry.offHandAttackBonusFixedText}
                            history={historyState.offHandAttackBonusFixedText}
                            onChange={(value) =>
                              updateEntry(entry.id, {
                                offHandAttackBonusFixedText: value,
                              })
                            }
                            onCommit={(value) =>
                              commitHistory("offHandAttackBonusFixedText", value)
                            }
                          />
                          <select
                            className="compact-select"
                            value={entry.offHandAttackBonusDie}
                            onChange={(event) =>
                              updateEntry(entry.id, {
                                offHandAttackBonusDie: event.currentTarget
                                  .value as AttackBonusDie,
                              })
                            }
                          >
                            {ATTACK_BONUS_DIE_OPTIONS.map((die) => (
                              <option key={die} value={die}>
                                {die === "none" ? "无" : die}
                              </option>
                            ))}
                          </select>
                        </div>
                      </label>
                    ) : (
                      <label className="ghost-field" aria-hidden="true">
                        <span>副手攻击加值</span>
                        <div className="inline-row attack-bonus-row">
                          <input className="compact-input" disabled />
                          <select className="compact-select" disabled>
                            <option value="none">无</option>
                          </select>
                        </div>
                      </label>
                    )}
                  </div>

                  {hasOffHand ? (
                    <label className="compact-field">
                      <LabelWithInfo
                        title="副手执行次数"
                        info="副手这一段在该攻击项内重复结算的次数。"
                      />
                      <CompactDropdown
                        ariaLabel={`攻击项 ${index + 1} 副手执行次数`}
                        className="entry-repeat-dropdown"
                        value={entry.offHandRepeatText}
                        options={REPEAT_DROPDOWN_OPTIONS}
                        onChange={(value) =>
                          updateEntry(entry.id, {
                            offHandRepeatText: value,
                          })
                        }
                      />
                    </label>
                  ) : (
                    <label className="ghost-field compact-field" aria-hidden="true">
                      <span>副手执行次数</span>
                      <span className="compact-ghost-slot" />
                    </label>
                  )}

                  <label>
                    <LabelWithInfo
                      title="目标护甲等级（AC）"
                      info="命中门槛。除自动命中/重击规则外，d20 + 攻击加值 >= AC 视为命中。"
                    />
                    <input
                      value={entry.armorClassText}
                      onChange={(event) =>
                        updateEntry(entry.id, {
                          armorClassText: event.currentTarget.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    <LabelWithInfo
                      title="攻击掷骰状态"
                      info="普通/优势/劣势。优势取两次 d20 高值，劣势取低值。"
                    />
                    <select
                      value={entry.advantageState}
                      onChange={(event) =>
                        updateEntry(entry.id, {
                          advantageState: event.currentTarget.value as
                            | "normal"
                            | "advantage"
                            | "disadvantage",
                        })
                      }
                    >
                      <option value="normal">普通</option>
                      <option value="advantage">优势</option>
                      <option value="disadvantage">劣势</option>
                    </select>
                  </label>

                  <label>
                    <LabelWithInfo
                      title="目标伤害修正"
                      info="普通/抗性/易伤/免疫。抗性减半向下取整，易伤翻倍，免疫为 0。"
                    />
                    <select
                      value={entry.modifier}
                      onChange={(event) =>
                        updateEntry(entry.id, {
                          modifier: event.currentTarget.value as
                            | "normal"
                            | "resistant"
                            | "vulnerable"
                            | "immune",
                        })
                      }
                    >
                      <option value="normal">普通</option>
                      <option value="resistant">抗性</option>
                      <option value="vulnerable">易伤</option>
                      <option value="immune">免疫</option>
                    </select>
                  </label>

                  <label>
                    <LabelWithInfo
                      title="伤害骰模式"
                      info="普通/多掷取高/多掷取低。仅影响伤害骰结果，不影响攻击检定。"
                    />
                    <select
                      value={entry.damageDiceMode}
                      onChange={(event) =>
                        updateEntry(entry.id, {
                          damageDiceMode: event.currentTarget.value as
                            | "normal"
                            | "advantage"
                            | "disadvantage",
                        })
                      }
                    >
                      <option value="normal">普通</option>
                      <option value="advantage">多掷取高</option>
                      <option value="disadvantage">多掷取低</option>
                    </select>
                  </label>

                  {isNormalDamageMode ? (
                    <label className="ghost-field" aria-hidden="true">
                      <span>多掷取高/低次数</span>
                      <select disabled>
                        <option value="2">2</option>
                      </select>
                    </label>
                  ) : (
                    <label>
                      <LabelWithInfo
                        title="多掷取高/低次数"
                        info="伤害骰模式为多掷取高/低时生效，取值范围 2 到 5。"
                      />
                      <select
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
                    </label>
                  )}

                  <label>
                    <LabelWithInfo
                      title="重击阈值"
                      info="范围 10+ 到 20+。重击时伤害骰子X2。"
                    />
                    <select
                      value={entry.criticalThresholdText}
                      onChange={(event) =>
                        updateEntry(entry.id, {
                          criticalThresholdText: event.currentTarget.value,
                        })
                      }
                    >
                      <option value="20">20+</option>
                      <option value="19">19+</option>
                      <option value="18">18+</option>
                      <option value="17">17+</option>
                      <option value="16">16+</option>
                      <option value="15">15+</option>
                      <option value="14">14+</option>
                      <option value="13">13+</option>
                      <option value="12">12+</option>
                      <option value="11">11+</option>
                      <option value="10">10+</option>
                    </select>
                  </label>

                  <label>
                    <LabelWithInfo
                      title="半身人幸运"
                      info="开启后，攻击检定掷到 1 时重掷一次。"
                    />
                    <span className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={entry.halflingLucky}
                        onChange={(event) =>
                          updateEntry(entry.id, {
                            halflingLucky: event.currentTarget.checked,
                          })
                        }
                      />
                      <span>{entry.halflingLucky ? "已开启" : "未开启"}</span>
                    </span>
                  </label>
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
        <p>每轮模板期望伤害：{result.expectedPerPlan}</p>
        <p>
          总期望伤害（{Math.max(1, Math.floor(parsedPlanCount || 1))} 轮模板）：
          {result.expectedTotal}
        </p>
        <p>全重击状态下每轮模板期望伤害：{result.fullCritExpectedPerPlan}</p>
        <p>
          全重击状态下总期望伤害（{Math.max(1, Math.floor(parsedPlanCount || 1))} 轮模板）：
          {result.fullCritExpectedTotal}
        </p>
      </section>
    </main>
  );
}

export default App;
