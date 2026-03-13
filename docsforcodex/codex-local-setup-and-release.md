# BG3calculator 的 Codex 本地接入与 Release 流程

## 1. 目标

本文件约定两件事：

- 如何把 Codex 作为本地开发助手接入当前仓库。
- 如何使用仓库内的 GitHub Actions 完成 PR 校验、远端打 tag 与 GitHub Release 发布。

当前仓库的现状：

- 包管理器：`pnpm@10.32.1`
- 工作区：`apps/*` + `packages/*`
- 桌面应用：`apps/desktop-tauri`
- 根级校验入口：`pnpm lint`、`pnpm typecheck`、`pnpm test`
- 手动桌面构建：`.github/workflows/desktop-build.yml`
- 本地 workflow dispatch 入口：`pnpm cicd:dispatch-workflow`
- 统一 release 编排入口：`pnpm release:prepare`
- 正式发布 tag 入口：`.github/workflows/create-release-tag.yml`

## 2. 本地接入 Codex

官方资料：

- Codex CLI 入门：<https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started>
- ChatGPT 方案接入 Codex：<https://help.openai.com/en/articles/11369540/>

已知前提：

- Codex CLI 官方当前仍将 Windows 视为实验性支持；如果本机 CLI 异常，优先改用 VS Code 的 Codex 扩展，或在 WSL 中运行 CLI。
- 本仓库自己的命令入口仍以 PowerShell 7 / `pwsh.exe` 为准。

推荐接入顺序：

1. 安装 Codex CLI
2. 登录 ChatGPT 或 API Key
3. 在仓库根目录启动 Codex
4. 用根级校验命令约束 Codex 的修改结果

### 2.1 安装与登录

如果你已经配置好了 `pnpm` 全局目录，可以直接安装：

```powershell
pwsh.exe -NoProfile -Command "pnpm add -g @openai/codex"
```

如果你不想做全局安装，也可以临时执行最新版：

```powershell
pwsh.exe -NoProfile -Command "corepack pnpm dlx @openai/codex@latest --help"
```

登录推荐优先使用 ChatGPT 账号：

```powershell
pwsh.exe -NoProfile -Command "codex login"
```

如果你要使用 API Key，则先设置环境变量：

```powershell
pwsh.exe -NoProfile -Command "$env:OPENAI_API_KEY = '<your-api-key>'"
```

### 2.2 在本仓库中的推荐用法

在仓库根目录启动：

```powershell
pwsh.exe -NoProfile -Command "codex"
```

首轮提示词建议直接围绕仓库事实展开，例如：

- `Explain this pnpm monorepo and the dependency direction between apps and packages.`
- `Implement the feature, then run pnpm lint, pnpm typecheck, and pnpm test.`
- `Review the current GitHub workflows and suggest the smallest safe release improvement.`

本仓库与 Codex 配合时，统一要求 Codex 以根级命令做验收：

```powershell
pwsh.exe -NoProfile -Command "pnpm lint"
pwsh.exe -NoProfile -Command "pnpm typecheck"
pwsh.exe -NoProfile -Command "pnpm test"
```

如果任务是 CI/CD 或发版，当前仓库优先使用脚本化入口，而不是让 Codex 每次手工重新拼接命令：

```powershell
pwsh.exe -NoProfile -Command "pnpm release:sync-version -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "pnpm release:preflight -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm cicd:dispatch-workflow -- --workflow desktop-build.yml --ref main --input target=macos-universal --input request_id=manual --wait"
```

如果你同时维护多个 GitHub 项目，推荐不要长期共用一个全局 token，而是为每个仓库单独保存项目专属环境变量。当前仓库已经支持自动识别：

```powershell
pwsh.exe -NoProfile -Command "[System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN_BG3CALCULATOR', '<github-token>', 'User')"
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8"
```

兼容的变量名模式：

- 全局变量：`GH_TOKEN`、`GITHUB_TOKEN`
- 仓库级变量：`GH_TOKEN_BG3CALCULATOR`、`GITHUB_TOKEN_BG3CALCULATOR`
- owner + repo 级变量：`GH_TOKEN_WATOUT_BG3CALCULATOR`、`GITHUB_TOKEN_WATOUT_BG3CALCULATOR`

## 3. 仓库内的 CI / CD 约定

当前工作流职责如下：

- `/.github/workflows/ci.yml`
  - 触发：`pull_request`、`merge_group`、推送到 `main`
  - 作用：运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`，并验证 workflow / 自动化脚本护栏
- `/.github/workflows/create-release-tag.yml`
  - 触发：`workflow_dispatch`
  - 作用：在远端 `main` 上执行 `release:preflight`，然后创建并推送一个全新的语义化版本 tag
  - 约束：不会同步版本文件，不会 commit，不会 push `main`
- `/.github/workflows/release-desktop.yml`
  - 触发：推送无 `v` 前缀的语义化 tag，例如 `0.1.2` 或 `0.1.2-beta.1`
  - 作用：先做 release tag 与版本文件一致性校验，再分别构建 Windows 和 macOS Universal 安装包，并更新同名 GitHub Release
- `/.github/workflows/desktop-build.yml`
  - 保留为手动构建入口，用于开发测试或远程 macOS 构建脚本调用

### 3.1 日常开发流程

推荐流程：

1. 在本地功能分支里使用 Codex 辅助开发。
2. 本地先跑：

```powershell
pwsh.exe -NoProfile -Command "pnpm lint"
pwsh.exe -NoProfile -Command "pnpm typecheck"
pwsh.exe -NoProfile -Command "pnpm test"
```

3. 推送分支并发起 PR。
4. 等待 `ci` workflow 通过后再合并。
5. 不要直接在本地 `main` 上做日常开发并试图跳过 PR。

### 3.2 发布流程

当你准备正式发布时：

1. 在 release PR 中同步下面 4 个文件的版本，例如 `0.1.8`：
   - `package.json`
   - `apps/desktop-tauri/package.json`
   - `apps/desktop-tauri/src-tauri/tauri.conf.json`
   - `apps/desktop-tauri/src-tauri/Cargo.toml`
2. 推荐直接执行：

```powershell
pwsh.exe -NoProfile -Command "pnpm release:sync-version -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "pnpm release:preflight -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "pnpm lint"
pwsh.exe -NoProfile -Command "pnpm typecheck"
pwsh.exe -NoProfile -Command "pnpm test"
```

3. 提交 release PR 并合入 `main`。
4. 合入后，再触发远端 tag 创建：

```powershell
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8"
```

这条命令会：

- 校验当前分支为 `main`
- 校验工作树干净
- 校验本地 `HEAD` 与 `origin/main` 一致
- 校验远端 tag 尚未存在
- dispatch `create-release-tag.yml`

它不会：

- 本地 commit 改动
- push `main`
- 本地创建 tag
- fallback 到本地 manual release

随后 `release-desktop` 会因为这个新 tag 自动触发。

### 3.3 当前默认假设

- 当前发布产物为未签名桌面包，适合开发测试与内部使用。
- macOS notarization、Windows 签名暂未接入；后续若要分发给更广泛用户，再补 secrets 与签名步骤。
- Release 触发规则默认使用无 `v` 前缀的语义化版本 tag。
- 正式回滚不通过“重打旧 tag”完成，而是通过 hotfix PR + 新 patch tag 完成。

## 4. 对应文件入口

最值得先看的文件：

- 根工作区脚本：`/package.json`
- 通用本地 CI/CD 编排说明：`/docsforcodex/local-cicd-orchestration.md`
- 通用 workflow dispatch：`/scripts/github-workflow-dispatch.mjs`
- 统一 release wrapper：`/scripts/release-prepare.mjs`
- 手动桌面构建：`/.github/workflows/desktop-build.yml`
- 复用构建矩阵：`/.github/workflows/desktop-build-matrix.yml`
- 常规 CI：`/.github/workflows/ci.yml`
- 远端打 tag：`/.github/workflows/create-release-tag.yml`
- 自动发布：`/.github/workflows/release-desktop.yml`
- Tauri 打包配置：`/apps/desktop-tauri/src-tauri/tauri.conf.json`
