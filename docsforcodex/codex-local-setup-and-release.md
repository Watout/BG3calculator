# BG3calculator 的 Codex 本地接入与 Release 流程

## 1. 目标

本文件约定两件事：

- 如何把 Codex 作为本地开发助手接入当前仓库。
- 如何使用仓库内的 GitHub Actions 完成 PR 校验与 tag 自动发布。

当前仓库的现状：

- 包管理器：`pnpm@10.32.1`
- 工作区：`apps/*` + `packages/*`
- 桌面应用：`apps/desktop-tauri`
- 根级校验入口：`pnpm lint`、`pnpm typecheck`、`pnpm test`
- 手动桌面构建：`.github/workflows/desktop-build.yml`
- 本地 workflow dispatch 入口：`pnpm cicd:dispatch-workflow`
- 统一 release 编排入口：`pnpm release:prepare`
- 本地 release 编排入口：`pnpm release:prepare-local`

---

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
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "pnpm release:prepare-local -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm release:prepare-remote -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm cicd:dispatch-workflow -- --workflow prepare-release.yml --ref main --input tag=0.1.8 --wait"
```

---

## 3. 仓库内的 CI / CD 约定

新增后的工作流职责如下：

- `/.github/workflows/ci.yml`
  - 触发：`pull_request`、推送到 `main`
  - 作用：运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`
- `/.github/workflows/prepare-release.yml`
  - 触发：`workflow_dispatch`
  - 作用：从 `main` checkout 最新代码，自动同步四个 release 版本文件，执行 `release:preflight` 与根级校验，然后推送 release commit 并创建一个全新的语义化版本 tag
- `/.github/workflows/release-desktop.yml`
  - 触发：推送无 `v` 前缀的语义化 tag，例如 `0.1.2` 或 `0.1.2-beta.1`
  - 作用：先做 release tag 与版本文件一致性校验，再分别构建 Windows 和 macOS Universal 安装包，并更新同名 GitHub Release
- `/.github/workflows/desktop-build.yml`
  - 保留为手动构建入口，用于开发测试或远程 macOS 构建脚本调用

### 3.1 日常开发流程

推荐流程：

1. 在本地分支里使用 Codex 辅助开发。
2. 本地先跑：

```powershell
pwsh.exe -NoProfile -Command "pnpm lint"
pwsh.exe -NoProfile -Command "pnpm typecheck"
pwsh.exe -NoProfile -Command "pnpm test"
```

3. 推送分支并发起 PR。
4. 等待 `ci` workflow 通过后再合并。

如果本地需要直接触发某个 `workflow_dispatch` workflow，优先使用仓库提供的通用 dispatch 入口，而不是假设本机已有 `gh`：

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm cicd:dispatch-workflow -- --workflow desktop-build.yml --ref main --input target=windows-x64 --input request_id=manual --wait"
```

### 3.2 发布流程

当你准备发布时：

先把下面 4 个文件的版本统一改成目标版本，例如 `0.1.2`：

- `package.json`
- `apps/desktop-tauri/package.json`
- `apps/desktop-tauri/src-tauri/tauri.conf.json`
- `apps/desktop-tauri/src-tauri/Cargo.toml`

推荐直接执行版本同步脚本：

```powershell
pwsh.exe -NoProfile -Command "pnpm release:sync-version -- --tag 0.1.2"
```

然后执行：

```powershell
pwsh.exe -NoProfile -Command "pnpm release:preflight -- --tag 0.1.2"
pwsh.exe -NoProfile -Command "pnpm lint"
pwsh.exe -NoProfile -Command "pnpm typecheck"
pwsh.exe -NoProfile -Command "pnpm test"
pwsh.exe -NoProfile -Command "git push origin main"
pwsh.exe -NoProfile -Command "git tag 0.1.2"
pwsh.exe -NoProfile -Command "git push origin 0.1.2"
```

现在也可以直接使用仓库固化好的本地脚本：

```powershell
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "pnpm release:prepare-local -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8 --auto-commit"
```

这里的顺序不能省略：

- `release:preflight` 只保证 tag 和四个版本文件一致，不等于整个工作区已经通过验收
- `pnpm lint`、`pnpm typecheck`、`pnpm test` 是和 `prepare-release.yml` 一致的最小发布护栏
- 如果 `release:sync-version` 改动了版本文件，必须先把对应提交推到 `main`，再推送新的 tag
- `release-desktop` 是“新 tag push 触发”，不是“补推 main 自动触发”；所以不要先打 tag、后补推 `main`

如果你不想手工重复“同步版本 -> 校验 -> 提交 -> 打 tag”这套流程，优先使用 GitHub Actions 里的 `prepare-release`：

1. 打开 Actions 页面里的 `prepare-release`
2. 输入一个此前从未使用过的无 `v` 语义化版本，例如 `0.1.6`
3. workflow 会自动：
   - checkout `main`
   - 运行 `pnpm release:sync-version -- --tag <tag>`
   - 运行 `pnpm release:preflight -- --tag <tag>`
   - 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`
   - 若四个版本文件发生变化，则提交同步改动到 `main`
   - 若四个版本文件本来就已经对齐目标 tag，则跳过空 commit
   - 创建并推送一个全新的 release tag

随后 `release-desktop` 会因为这个新 tag 自动触发。

如果你希望仍然从本地发起，但机器上没有 `gh`，可以直接用：

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm release:prepare-remote -- --tag 0.1.8"
```

补充说明：

- `pnpm release:prepare` 会根据本地是否具备 token 和 `prepare-release.yml` 自动选择 dispatch 或本地手工路径
- `pnpm release:prepare-local` 默认要求工作树干净；只有显式传 `--auto-commit` 时，才会先提交当前改动
- dispatch 路径只拦截远端同名 tag 复用，不会因为当前机器上残留的本地 tag 而拒绝触发 workflow

如果 preflight 因版本不一致而失败，`release-desktop` 会停在 `verify-workspace`，不会继续构建 Windows / macOS 包，也不会更新 GitHub Release 资产。

已确认的真实案例：

- 远端 `0.1.2` tag 的确触发过 `release-desktop`
- 但 tag 对应提交里的四个版本文件仍然是 `0.1.0`
- 因此 workflow 在 preflight 直接失败，GitHub Release 中没有出现 `0.1.2` 的 Windows / macOS 资产

另一个高频坑点是“tag 已经存在，但它指向的是旧提交”：

- `release-desktop` 是“推新 tag 触发”，不是“推 main 触发”
- 如果某个 tag（例如 `0.1.5`）已经存在并指向旧提交，那么后续即使你把版本文件修好了、推了新的 `main` 提交，也不会自动补跑 release
- 再次执行 `git push origin 0.1.5` 只会得到 `Everything up-to-date`
- 这时要么创建一个全新的 tag（推荐，例如 `0.1.6`），要么显式删除并重打旧 tag（风险更高，不推荐）

新的 `prepare-release` workflow 会先检查同名 tag 是否已经存在；存在时直接失败，不会继续复用旧 tag。

随后 GitHub Actions 会自动：

1. 校验工作区
2. 构建 Windows x64 安装包
3. 构建 macOS Universal 安装包
4. 创建同名 GitHub Release
5. 上传桌面端产物作为 Release Assets

### 3.3 当前默认假设

- 当前发布产物为未签名桌面包，适合开发测试与内部使用。
- macOS notarization、Windows 签名暂未接入；后续若要分发给更广泛用户，再补 secrets 与签名步骤。
- Release 触发规则默认使用无 `v` 前缀的语义化版本 tag。

---

## 4. 对应文件入口

最值得先看的文件：

- 根工作区脚本：`/package.json`
- 通用本地 CI/CD 编排说明：`/docsforcodex/local-cicd-orchestration.md`
- 通用 workflow dispatch：`/scripts/github-workflow-dispatch.mjs`
- 本地 release 编排：`/scripts/release-prepare.mjs`
- 手动桌面构建：`/.github/workflows/desktop-build.yml`
- 常规 CI：`/.github/workflows/ci.yml`
- 手动准备 release：`/.github/workflows/prepare-release.yml`
- 自动发布：`/.github/workflows/release-desktop.yml`
- Tauri 打包配置：`/apps/desktop-tauri/src-tauri/tauri.conf.json`
