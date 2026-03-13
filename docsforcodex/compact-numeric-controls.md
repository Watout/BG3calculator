# 紧凑数值下拉与重击阈值语义

## 目标

这份文档记录桌面端数值型紧凑下拉的真实实现位置，以及“执行次数无上限 + 滑动窗口加载”“共享菜单隐藏右侧滚动条”和“重击阈值最低到 1 但天然 1 仍自动失手、并按降序显示”的代码事实，方便后续继续扩展 UI 或修正数学边界时快速定位。

## 代码落点

- 滑动窗口下拉核心：`apps/desktop-tauri/src/compactNumericWindow.ts`
- UI 组件接线：`apps/desktop-tauri/src/App.tsx`
- 桌面端输入校验与数值聚合：`apps/desktop-tauri/src/compute.worker.ts`
- 重击阈值规则修正：`packages/rulesets/src/index.ts`
- 单掷闭式概率修正：`packages/domain/src/index.ts`

## 当前行为

- `CompactNumericDropdown` 统一服务于模板执行次数、主手执行次数、副手执行次数和重击阈值。
- 执行次数输入允许任意大于等于 `1` 的有限整数。
- 下拉菜单不再预生成完整选项数组，而是围绕当前值生成一个有限窗口；滚轮或滚动接近边缘时，窗口按步长滑动，达到“看起来无限、实际只渲染少量节点”的效果。
- 共享下拉菜单隐藏可视滚动条，但仍保留滚轮和滚动驱动的窗口滑动交互。
- 重击阈值允许 `1..20`，并在 UI 中按 `20+ -> 1+` 的降序显示。
- `1+` 的含义是“除天然 1 自动失手外，其余面都视为重击”；所以普通 d20 单掷下是 `95% critical + 5% miss`。

## 实现要点

- `compactNumericWindow.ts`
  - 负责窗口起点归一化、值区间裁剪、滑动步进、升降序窗口映射和重置滚动位置。
  - 无上限场景只基于当前起点和窗口大小生成局部数组，不持有全量数据。
- `App.tsx`
  - 模板执行次数与重击阈值已从原生 `<select>` 切到紧凑下拉。
  - 主手/副手执行次数沿用同一视觉样式与交互逻辑。
- `App.css`
  - 共享的 `.compact-dropdown-menu` 隐藏右侧滚动条，但不关闭实际滚动能力。
- `compute.worker.ts`
  - 主手/副手分别求一次 `calculateAttackDamage(...)`，随后用重复次数和模板次数做数值缩放，避免把大重复次数直接推入分布卷积。
- `rulesets` 与 `domain`
  - `makeCriticalThresholdEffect(...)` 现在会把阈值裁到 `1..20`。
  - `calculateSingleRollAttackProbabilities(...)` 现在显式保留天然 `1` 自动失手，因此 `criticalThreshold = 1` 时返回 `0.95 crit / 0 hit / 0.05 miss`。

## 回归关注点

- 如果以后重新让桌面端 worker 走 `resolveBg3AttackTemplate(...)`，需要重新评估“大执行次数”对概率分布卷积的性能成本。
- 如果以后继续调整重击阈值顺序或键盘导航，优先改 `CompactNumericDropdown` 和 `compactNumericWindow.ts`，不要再退回到静态 `<option>` 全量渲染。
