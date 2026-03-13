# Concise AGENTS.md Template

## Project overview

- Describe the repo layout in 2-5 bullets.
- Keep this section factual and short.

## Mandatory skill usage

- `跨文件改动 / 重构 / 公共接口变更 -> $implementation-strategy`
- `代码改完 -> $code-change-verification`
- `准备交付 -> $pr-draft-summary`

## Tool routing

- `查仓库事实 -> 先本地代码 / README / docsforcodex`
- `查最新官方文档 -> 官方 Docs MCP`
- `查 GitHub PR / issue / CI -> github MCP`
- `查设计稿 -> figma MCP`
- `页面复现 / 截图 / DOM 调试 -> playwright MCP 或 chrome-devtools MCP`
- `外部写操作 -> 先确认`

## Tool priority

- `本地信息 > skill > 官方/可信 MCP > web`

## Build and test commands

- `Install: pnpm install`
- `Lint: pnpm lint`
- `Typecheck: pnpm typecheck`
- `Test: pnpm test`
- `Build: pnpm build`

## Safety and compatibility rules

- 保留仓库级硬规则和高优先级约束。
- 把长流程、runbook、模板和 checklist 下沉到 `/.agents/skills/*/SKILL.md`。
