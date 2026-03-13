# 本地 CI/CD 编排通用流程

## 目标

这份文档描述一条可复用的本地 CI/CD 编排骨架，目标不是只服务这一个 release，而是让以后任何“本地提交后触发 GitHub Actions”的任务都有统一判断顺序。

核心原则：

- 先识别仓库真正的触发器，再决定是 `commit + push`、`tag + push` 还是 `workflow_dispatch`
- 优先使用仓库已经提供的本地编排脚本
- 如果仓库没有现成脚本，再退回到“校验 -> 提交 -> push/tag”手工路径
- 如果本地要 dispatch workflow，优先使用仓库内脚本或 GitHub REST API，不把 `gh` 当成唯一前置条件

## 通用发现顺序

每次处理 CI/CD 请求时，先做这 6 步：

1. 读取仓库总览文档、CI/CD 文档和坑点落库。
2. 查看 `git status --short --branch`，确认当前分支和工作树状态。
3. 读取 `.github/workflows/*.yml`，识别：
   - 哪个 workflow 做基础校验
   - 哪个 workflow 做构建
   - 哪个 workflow 做 release / deploy
   - 各自由什么事件触发
4. 读取 `package.json`、`scripts/` 或其他任务入口，识别本地已有的 orchestration 脚本。
5. 如果存在 release/deploy 元数据，确认哪些文件必须和目标版本、tag 或环境保持一致。
6. 判断本地是否具备 GitHub Token / 认证能力，决定能否直接 dispatch workflow。

## 触发路径优先级

### 1. 优先：仓库内的本地编排脚本

如果仓库已经提供了显式的 orchestration 入口，例如：

- `pnpm release:prepare-local`
- `pnpm deploy:staging`
- `pnpm cicd:dispatch-workflow`

优先使用这些入口，因为它们通常已经把顺序、校验和错误信息固化到了脚本里。

### 2. 次优：本地 dispatch workflow

当仓库存在 `workflow_dispatch` 入口，且本地有 `GH_TOKEN` / `GITHUB_TOKEN` 时，可以直接从本地触发 GitHub Actions，而不必依赖 `gh`。

通用入口：

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm cicd:dispatch-workflow -- --workflow prepare-release.yml --ref main --input tag=0.1.8 --wait"
```

这条路径适用于：

- 已有远端源码就是事实来源
- workflow 自己会负责提交、打 tag 或部署
- 本地不需要先写入并推送额外代码

### 3. 回退：本地校验 -> 提交 -> push/tag

如果仓库没有可 dispatch 的 workflow，或者 workflow_dispatch 不适合当前场景，就走仓库原生触发链路：

1. 同步版本/环境/部署元数据
2. 跑仓库规定的校验命令
3. 提交改动
4. push 触发 CI
5. 必要时 push tag 触发 release / deploy workflow

## BG3calculator 当前落地入口

当前仓库已经提供三条正式入口：

### 0. 自动选择 release 编排路径

```powershell
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8"
```

它会根据本地环境自动在以下两条路径之间选择：

- 有 token 且适合 dispatch 时，走 `prepare-release.yml`
- 否则走本地“同步版本 -> 校验 -> commit -> push -> tag”路径

### 1. 本地 release 编排

```powershell
pwsh.exe -NoProfile -Command "pnpm release:prepare-local -- --tag 0.1.8"
```

它会自动执行：

- 检查工作树是否干净；如果显式传 `--auto-commit`，则会先自动提交当前改动
- 检查当前分支是否为 `main`
- 检查目标 tag 是否已在本地或远端存在
- `pnpm release:sync-version -- --tag <tag>`
- `pnpm release:preflight -- --tag <tag>`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- 提交版本文件变更
- `git push origin main`
- `git tag <tag>`
- `git push origin <tag>`

这条路径会触发：

- `main` push -> `ci.yml`
- 新 tag push -> `release-desktop.yml`

### 2. 本地 dispatch GitHub workflow

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm release:prepare-remote -- --tag 0.1.8"
```

这条命令底层走 `pnpm cicd:dispatch-workflow`，直接调用 GitHub REST API 触发 `prepare-release.yml`，不再把 `gh` 当成本地唯一入口。

补充约束：

- dispatch 路径会检查远端 tag 是否已存在，但不会因为“当前机器上的同名本地 tag”而拒绝触发 workflow
- 手工本地路径仍然会同时拦截本地和远端 tag 复用

## 适配其他仓库时的判断方式

以后遇到别的仓库时，优先回答这 4 个问题：

1. 什么动作会触发 CI？
2. 什么动作会触发 build / release / deploy？
3. 仓库有没有现成的本地 orchestration 命令？
4. 如果没有，是否能用 token 直接 dispatch workflow？

只要这 4 个问题有答案，就能把本地 CI/CD 流程稳定地落到：

- 直接执行本地脚本
- 直接 dispatch workflow
- 或者手工顺序化为“校验 -> 提交 -> push/tag”
