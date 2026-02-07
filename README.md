# BG3DC 代码边界与接口暴露文档

## 1. 目的

本文档用于定义本仓库的代码边界、各模块接口职责、以及对外暴露面，确保：

- 依赖方向稳定，避免跨层耦合
- 公共 API 清晰，避免误用内部实现
- 新增功能时可以快速判断“代码应该放在哪一层”

---

## 2. 仓库分层与边界

### 2.1 工作区结构

- 应用层：`apps/desktop-tauri`
- 规则编排层：`packages/rulesets`
- 领域计算层：`packages/domain`
- 概率基础层：`packages/prob`
- 表达式解析层：`packages/dice-parser`

### 2.2 依赖方向（必须单向）

```text
@bg3dc/prob         @bg3dc/dice-parser
      \                    /
       \                  /
             @bg3dc/domain
                    |
             @bg3dc/rulesets
                    |
          apps/desktop-tauri
```

约束要点：

- 上层可以依赖下层，下层不能反向依赖上层。
- `prob` 和 `dice-parser` 只提供基础能力，不感知业务规则。
- `domain` 负责计算语义，不感知 UI/Tauri。
- `rulesets` 负责把规则效果组合成可执行请求。
- `apps/desktop-tauri` 负责输入、状态、线程与展示。

---

## 3. 对外暴露规则

### 3.1 包级公共入口

所有 `@bg3dc/*` 包统一通过 `package.json` 的 `exports["."]` 暴露 `src/index.ts`。

这意味着：

- 公共 API 以各包 `src/index.ts` 的导出为准
- 未在 `exports` 中声明的路径不视为稳定公共接口

### 3.2 可见性定义

- 公共 API：`packages/*/src/index.ts` 对外导出项
- 应用内协议：仅供应用内部使用，如 `apps/desktop-tauri/src/compute.worker.ts` 消息类型
- 构建产物声明：`dist/*.d.ts` 仅用于编译，不自动等于公共契约

---

## 4. 各模块接口说明

## 4.1 `@bg3dc/dice-parser`

职责：将骰子表达式文本解析为结构化数据，并提供规范化格式输出。

### 对外类型

- `TermSign`
- `DiceComponent`
- `ConstantComponent`
- `ExpressionComponent`
- `ParsedDiceExpression`
- `DiceParseIssue`
- `DiceParseError`
- `DiceParseSuccess`
- `DiceParseFailure`
- `DiceParseResult`

### 对外函数

- `formatDiceExpression(expression)`：将表达式组件标准化为字符串
- `parseDiceExpression(input)`：解析表达式，失败抛异常
- `tryParseDiceExpression(input)`：解析表达式，失败返回 `ok: false`
- `isDiceExpression(input)`：返回是否为合法表达式

边界说明：

- 只负责语法解析与结构化，不负责概率、命中、伤害计算。

---

## 4.2 `@bg3dc/prob`

职责：提供通用离散概率分布工具（卷积、期望、阈值概率、独立取最大/最小等）。

### 对外类型

- `DistributionMap`
- `DistributionEntry`
- `ProbabilityDistribution`

### 对外函数

- 构建：`fromEntries`、`constant`、`uniformDie`
- 变换：`shift`、`scaleOutcomes`、`mapOutcomes`
- 组合：`convolve`、`multiplyIndependent`、`repeatConvolve`
- 统计：`expectation`、`probabilityAtLeast`、`probabilityAtMost`
- 多次独立掷骰：`maxOfIndependent`、`minOfIndependent`

边界说明：

- 不携带 BG3 规则语义，不处理 UI 或表达式语法。

---

## 4.3 `@bg3dc/domain`

职责：核心战斗/伤害领域模型与计算（命中概率、重击、伤害分布、豁免期望等）。

### 对外类型

- 状态类型：
  - `AdvantageState`
  - `DamageModifier`
  - `DamageDiceRollMode`
- 输入类型：
  - `AttackRollRuleConfig`
  - `AttackCheckInput`
  - `DamageModel`
  - `AttackDamageRequest`
  - `AttackDamagePlanStep`
  - `SaveCheckInput`
- 输出类型：
  - `AttackOutcomeProbabilities`
  - `AttackDamageResult`
  - `AttackDamagePlanStepResult`
  - `AttackDamagePlanResult`
  - `SaveDamageResult`

### 对外函数

- 攻击概率：
  - `calculateSingleRollAttackProbabilities(armorClass, attackBonus, criticalThreshold)`
  - `calculateAttackOutcomeProbabilities(input)`
- 伤害流程：
  - `applyDamageModifier(rawDamage, modifier)`
  - `buildDamageDistribution(expression, criticalDiceMultiplier, rerollLowThreshold?)`
  - `applyDamageDiceRollMode(distribution, mode, rollCount?)`
  - `calculateAttackDamage(request)`
  - `calculateAttackDamagePlan(steps)`
- 豁免：
  - `calculateSaveSuccessProbability(input)`
  - `calculateSaveExpectedDamage(input, failDamageMean, successDamageMean)`
- 理论均值工具：
  - `expectedSingleDieMean(sides)`
  - `expectedGwfSingleDieMean(sides)`
  - `expectedMaxOfTwoSingleDieMean(sides)`

边界说明：

- 仅处理领域计算，不依赖 React、Tauri、文件系统。

---

## 4.4 `@bg3dc/rulesets`

职责：在 `domain` 之上提供可组合规则效果（RuleEffect）与统一求解入口。

### 对外类型

- `RuleContext`
- `RuleMutation`
- `RuleEffect`
- `ResolveResult`
- `AttackTemplateStep`
- `AttackTemplate`
- `AttackTemplateStepResult`
- `ResolveTemplateResult`
- `DualWieldTemplateOptions`
- `bg3AttackRules`（默认 d20 规则配置）

### 对外函数

- `applyEffects(base, effects)`：按顺序应用 effect 生成最终上下文
- `resolveBg3Attack(base, effects)`：应用规则并计算结果
- `resolveBg3AttackTemplate(base, template)`：按模板编排多个攻击步骤并聚合结果
- `makeDualWieldTemplate(options)`：构建双持模板（主手必有，副手可选，支持副手攻击/伤害独立 patch）
- effect 工厂：
  - `makeAttackBonusEffect(id, bonusDelta)`
  - `makeCriticalDiceMultiplierEffect(id, multiplier)`
  - `makeDamageModifierEffect(id, modifier)`
  - `makeDamageDiceRollModeEffect(id, mode)`
  - `makeCriticalThresholdEffect(id, threshold)`
  - `makeHalflingLuckyEffect(id, enabled)`
  - `makeDamageRollCountEffect(id, count)`
- 文本输出：
  - `summarizeProbabilities(probabilities)`

边界说明：

- 负责规则编排，不负责输入文本解析与 UI 展示。

---

## 4.5 `apps/desktop-tauri`（应用层）

职责：参数输入、UI 状态管理、Web Worker 调度、结果渲染。

### 应用内消息接口（非公共包 API）

位于 `apps/desktop-tauri/src/compute.worker.ts`：

- `AttackPlanEntryInput`
- `ComputeInput`
- `ComputeEntrySuccess`
- `ComputeSuccess`
- `ComputeFailure`
- `ComputeOutput`

应用层约定：

- 输入协议支持 `entries[]` 攻击编排；每个攻击项独立持有完整参数。
- 每个攻击项包含主手与副手两套独立攻击加值（固定值 + 附加骰）。
- 副手攻击加值仅在副手伤害表达式非空时生效；副手留空时自动回退为仅主手单段计算。
- 追加攻击项时默认继承上一项配置；UI 上“添加攻击项”只在最后一个攻击项右下角显示。
- 选项名词说明统一通过 `i` 提示浮层展示；半身人幸运使用布尔 checkbox 输入。

这些接口用于主线程与 worker 的通信，属于应用内部协议，不作为 `@bg3dc/*` 对外包契约。

---

## 5. 边界守卫（已存在）

`eslint.config.mjs` 已配置关键限制，防止底层包越层依赖：

- `domain/prob/dice-parser` 不允许导入 `@bg3dc/rulesets`
- `domain/prob/dice-parser` 不允许导入 `react`、`react-dom`、`@tauri-apps/*`、`fs`

效果：保证基础层长期可复用、可测试、与平台无关。

---

## 6. 当前需要注意的问题

- 公共接口请始终以源码导出（`src/index.ts`）和 `package.json exports` 为准；不要手写额外入口声明文件，避免契约漂移。

---

## 7. 新增功能放置建议

- 新增表达式语法：放 `@bg3dc/dice-parser`
- 新增概率算法：放 `@bg3dc/prob`
- 新增命中/伤害/豁免领域规则：放 `@bg3dc/domain`
- 新增 BG3 或特定系统效果编排：放 `@bg3dc/rulesets`
- 新增页面交互、worker 流程、UI 表达：放 `apps/desktop-tauri`

当前已实施约束：

- 多段攻击期望聚合位于 `@bg3dc/domain`（`calculateAttackDamagePlan`）。
- 模板编排（含双持主手/副手）位于 `@bg3dc/rulesets`。
- “主/副手独立攻击加值”与“副手可空并回退”的输入语义位于 `apps/desktop-tauri` worker。
- ESLint 已阻止 `domain/prob/dice-parser` 与 `rulesets` 反向依赖 `apps/*`，保证依赖方向单向。
