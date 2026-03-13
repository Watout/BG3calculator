# BG3calculator 的 AGENTS 与 Skills 路由说明

## 1. 目标

这份文档把仓库里的协作入口拆成四层，避免以后继续把所有 agent 约束都堆回根级 `AGENTS.md`：

- `AGENTS.md`：只放仓库级硬规则、工具优先级、短路由与少量高优先级命令。
- `/.agents/skills/*/SKILL.md`：放场景化工作流、长 checklist、模板和可复用流程。
- `docsforcodex/*`：放面向人的解释文档和背景说明。
- `openspec/changes/*`：放需要长期保留的协作流程变更记录。

如果一次改动是由真实错误、环境问题或脚本陷阱触发，还要同步对应的 `docforcodex/hole/*`。

## 2. 当前仓库的协作资产

- 根级规则入口：`/AGENTS.md`
- 仓库级 skill 目录：`/.agents/skills/`
- 当前已落地的 repo skill：
  - `/.agents/skills/optimize-agents-md/SKILL.md`
- 当前 skill 附带模板：
  - `/.agents/skills/optimize-agents-md/references/concise-agents-template.md`
- 人类可读的协作说明：
  - `/docsforcodex/overall.md`
  - `/docsforcodex/codex-local-setup-and-release.md`
  - `/docsforcodex/agents-and-skills.md`
- 长期变更记录：
  - `/openspec/changes/*`

## 3. `optimize-agents-md` skill 的职责

这个 skill 专门负责把 `AGENTS.md` 变成“总规则 + skill 路由器”，而不是继续把它写成超长开发手册。

推荐在这些场景使用：

- 新建仓库级 `AGENTS.md`
- 对已有 `AGENTS.md` 做瘦身、拆分、重构
- 把长流程从 `AGENTS.md` 下沉到 repo skill
- 为仓库补齐 `Tool routing` / `Tool priority`
- 建立 `AGENTS.md`、`docsforcodex`、`openspec` 的同步规则

这个 skill 期望产出：

- 一个更短、更稳定的 `AGENTS.md`
- 一个或多个放在 `/.agents/skills/` 下的 repo skill
- 同步更新后的 `docsforcodex` 文档
- 对应的 `openspec` 变更记录
- 必要时的坑点文档补充

## 4. 默认路由原则

- 先看本地代码、`README.md`、`docsforcodex/*`
- 再走匹配的 repo skill
- 再使用官方或可信 MCP
- 最后才走 web 搜索
- 任何外部写操作都先确认

一句话总结：

`AGENTS.md` 负责规定什么时候做，repo skill 负责具体怎么做，MCP 负责能做什么。

## 5. 文档同步清单

当仓库级 `AGENTS.md` / skill 路由发生变化时，默认至少同步：

- `/AGENTS.md`
- `/README.md`
- `/docsforcodex/overall.md`
- `/docsforcodex/codex-local-setup-and-release.md`
- `/docsforcodex/agents-and-skills.md`
- `/openspec/changes/*`

如果这次变更是为了解决真实坑点，再同步：

- `/docforcodex/hole/<主题>/*`

## 6. 后续扩展建议

以后如果还要继续拆分仓库级协作流程，优先沿着同一目录结构补新 skill，而不是继续把长内容回填到根级 `AGENTS.md`。

比较自然的后续候选包括：

- `implementation-strategy`
- `code-change-verification`
- `pr-draft-summary`

这些 skill 如果真的落地，也应遵守和 `optimize-agents-md` 相同的同步规则。
