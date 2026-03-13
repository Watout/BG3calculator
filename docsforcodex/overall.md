# BG3DC 代码边界与接口暴露文档

## 0. 开发环境

当前仓库已验证可在以下环境中完成安装与校验：

- Windows 10/11
- PowerShell 7（`pwsh.exe`）
- Node.js `24.14.0`
- `pnpm@10.32.1`
- Rust stable（含 `cargo` / `rustup`）
- WebView2 Runtime
- Visual Studio C++ / MSVC 工具链（Tauri Windows 桌面端需要）

推荐先确保 `corepack` 可用，再按下面命令安装依赖：

```powershell
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 install"
```

常用开发与校验命令：

```powershell
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 lint"
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 typecheck"
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 test"
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 release:sync-version -- --tag 0.1.2"
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 tauri:dev"
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 release:preflight -- --tag 0.1.2"
```

当前仓库已经补齐两条可复用的本地 CI/CD 入口：

```powershell
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 release:prepare -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 release:prepare-local -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; & corepack.cmd pnpm@10.32.1 release:prepare-remote -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; & corepack.cmd pnpm@10.32.1 cicd:dispatch-workflow -- --workflow desktop-build.yml --ref main --input target=macos-universal --input request_id=manual --wait"
```

桌面端打包命令：

```powershell
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 tauri:build"
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 tauri:build:windows"
```

从 Windows 本机拉起远程 macOS 打包：

```powershell
pwsh.exe -NoProfile -Command "$env:GH_TOKEN = '<github-token>'; & corepack.cmd pnpm@10.32.1 tauri:build:macos:remote"
pwsh.exe -NoProfile -Command "$env:GH_TOKEN = '<github-token>'; & corepack.cmd pnpm@10.32.1 tauri:build:macos:remote -- --dry-run"
```

说明：

- `GH_TOKEN` / `GITHUB_TOKEN` 至少要能触发当前仓库的 GitHub Actions 并读取 artifact。
- 远程 macOS 打包要求当前分支工作树干净，且 `origin/<branch>` 与本地 `HEAD` 一致；脚本会在 dispatch 前主动校验。
- 默认下载目录：`.artifacts/macos-universal/<request_id>/`
- 远程打包只跑 `macos-universal`，不会顺带重跑 Windows bundle。
- 仓库内虽包含 `openspec/` 目录，但当前本地 Windows 环境不保证自带 `openspec` CLI；若命令不存在，先直接阅读 `openspec/` 文档或补装 CLI。

macOS 安装包仍然不能在当前 Windows 主机直接本地产出；仓库现在补齐的是“Windows 本机触发 GitHub Actions 的 macOS runner 并回收产物”的链路。若你在一台真实 macOS 机器上本地构建，也可以执行：

```bash
pnpm tauri:build:macos:universal
```

构建产物目录：

- Windows：`apps/desktop-tauri/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`
- macOS Universal：`apps/desktop-tauri/src-tauri/target/universal-apple-darwin/release/bundle/`
- 远程 macOS 下载目录：`.artifacts/macos-universal/<request_id>/`

GitHub Actions 手动触发 `desktop-build` 后可上传两份 artifact；`pnpm tauri:build:macos:remote` 默认只请求并下载：

- `bg3calculator-macos-universal`

当前 release 相关 workflow 分工：

- `ci.yml`：PR / `main` 的 lint、typecheck、test
- `prepare-release.yml`：手动同步版本、校验、推送 release commit，并创建全新 tag
- `release-desktop.yml`：监听新 tag，构建 Windows / macOS 并发布 GitHub Release

当前本地 release / workflow 编排入口：

- `pnpm release:prepare`：根据环境自动选择 dispatch 或本地手工发布路径
- `pnpm release:prepare-local`：本地完成版本同步、校验、commit、push main、push tag；显式传 `--auto-commit` 时可先提交当前改动
- `pnpm release:prepare-remote`：本地直接 dispatch `prepare-release.yml`，参数入口是 `--tag`
- `pnpm cicd:dispatch-workflow`：通用 GitHub Actions `workflow_dispatch` 入口，不依赖 `gh`
- 通用流程说明见：`docsforcodex/local-cicd-orchestration.md`

正式发布约定：

- Release tag 使用无 `v` 前缀的语义化版本，例如 `0.1.2` 或 `0.1.2-beta.1`
- 推 tag 前先运行 `pnpm release:sync-version -- --tag <tag>`，统一根工作区、桌面前端、Tauri 配置与 Cargo 版本
- 正式推 tag 前先运行 `pnpm release:preflight -- --tag <tag>`，确保根工作区、桌面前端、Tauri 配置与 Cargo 版本一致
- 推送 tag 后，`release-desktop` workflow 会先执行 preflight；只有版本一致时才会继续构建 Windows/macOS 桌面包，并更新同名 GitHub Release 资产
- 若不想手工执行“同步版本 -> 校验 -> push main -> 打 tag”，可以改用 `prepare-release.yml` 手动 workflow；它会先阻止复用已有 tag，再从 `main` 自动完成这套流程
- `publish-release` job 当前使用 `gh run download "${{ github.run_id }}" --dir release-assets` 回收同一次 workflow run 的 artifact，再调用 `node scripts/release-publish.mjs --input release-assets ...` 通过 GitHub REST API 创建或更新 Release 并覆盖上传资产
- 桌面 artifact 上传步骤已统一切到 `actions/upload-artifact@v6`，避免继续依赖 Node 20 JavaScript action runtime
- 本地 Windows 开发机不保证预装 `gh`；如果要复现 `publish-release` job，优先跑仓库内 `release-publish` 测试与脚本，再按需补装 GitHub CLI

2026-03-13 已确认过一次真实失败样例：

- 远端 `0.1.2` tag 已经触发 `release-desktop`
- 但四个版本文件仍然停在 `0.1.0`
- 所以 workflow 在 `verify-workspace` 的 preflight 阶段失败，release 页面没有出现对应桌面包

如果后续需要 macOS 签名/公证，再额外补 Apple 证书与 notarization secrets 即可；当前流程先输出未签名安装包，便于开发测试与内部分发，workflow 输入和文档结构也已经为后续接入签名链路预留了位置。

VS Code 建议安装：

- `tauri-apps.tauri-vscode`
- `rust-lang.rust-analyzer`

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
- 每个攻击项包含主手与副手两套独立攻击加值表达式。
- 副手攻击加值与副手执行次数在 UI 上常显；副手伤害表达式留空时，两者都会被忽略并自动回退为仅主手单段计算。
- 数值型紧凑下拉统一走 `apps/desktop-tauri/src/compactNumericWindow.ts`；模板执行次数、主手执行次数、副手执行次数都支持大于等于 1 的有限整数，并通过滑动窗口按需加载数值，避免一次性渲染超长选项列表。
- 重击阈值输入同样走紧凑下拉，但范围固定为 `1..20`；其中 `1+` 仍保留 BG3 / d20 里的天然 `1` 自动失手语义，所以正常单掷时对应的是 `95% crit + 5% miss`，不是 `100% crit`。
- 追加攻击项时默认继承上一项配置；UI 上“添加攻击项”只在最后一个攻击项右下角显示。
- 选项名词说明统一通过 `i` 提示浮层展示；半身人幸运使用布尔 checkbox 输入。
- `compute.worker.ts` 当前按主手和副手分别调用 `@bg3dc/domain` 的 `calculateAttackDamage(...)`，再以主手/副手重复次数和模板执行次数做数值聚合；应用层不直接依赖 `resolveBg3AttackTemplate(...)`。

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
- 模板编排（含双持主手/副手）仍保留在 `@bg3dc/rulesets` 作为公共规则能力，但桌面端 worker 当前走“主手/副手分开求值后再聚合”的应用内实现。
- “主/副手独立攻击加值表达式”、“副手可空并回退”、“执行次数滑窗下拉”和“重击阈值 1+ 仍保留天然 1 自动失手”这些输入语义位于 `apps/desktop-tauri` worker 与界面层。
- ESLint 已阻止 `domain/prob/dice-parser` 与 `rulesets` 反向依赖 `apps/*`，保证依赖方向单向。
