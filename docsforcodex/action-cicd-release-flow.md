# Action CI/CD 发版流程

## 目标

这份文档描述当前仓库推荐的 GitHub Actions 发版链路。核心目标是把 release 事实源固定到远端受保护分支，而不是开发者本地状态。

当前仓库已经明确规避以下风险：

- 四个版本文件未同步就先推 tag，导致 `release-desktop` 在 preflight 阶段失败
- 本地 `main` ahead 但远端 workflow 仍只读取旧的 `origin/main`
- 旧 tag 指向旧提交，却被误以为“再 push 一次就会重新发版”

## 当前工作流分工

- `/.github/workflows/ci.yml`
  - PR、`merge_group`、`main` 的基础校验
  - 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`
  - 额外运行 workflow/action 自动化护栏
- `/.github/workflows/create-release-tag.yml`
  - 正式 release tag 的唯一创建入口
  - 只允许从远端 `main` 校验并创建新 tag
  - 不会同步版本文件、不会 commit、不会 push `main`
- `/.github/workflows/release-desktop.yml`
  - 监听新的语义化版本 tag
  - 构建 Windows x64 与 macOS Universal
  - 创建或更新 GitHub Release
- `/.github/workflows/desktop-build.yml`
  - 与正式 release 解耦的手动桌面构建入口
  - 用于开发验证或远程 macOS 构建调度
- `/.github/workflows/desktop-build-matrix.yml`
  - 内部复用的构建矩阵 workflow
  - 被 `desktop-build` 和 `release-desktop` 共用

## 推荐发版路径

### 方式 A：推荐，release PR + `create-release-tag`

适用场景：

- 正式发版
- 希望让 `main` 和 tag 都以远端为事实源
- 不希望 workflow 回写 `main`

操作步骤：

1. 在 release 分支或 release PR 中同步版本：

```powershell
pwsh.exe -NoProfile -Command "pnpm release:sync-version -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "pnpm release:preflight -- --tag 0.1.8"
pwsh.exe -NoProfile -Command "pnpm lint"
pwsh.exe -NoProfile -Command "pnpm typecheck"
pwsh.exe -NoProfile -Command "pnpm test"
```

2. 合并 release PR 到 `main`。
3. 手动触发 `create-release-tag`，输入一个此前未使用过的无 `v` 语义化版本，例如 `0.1.8`。
4. workflow 会自动：
   - checkout 当前远端 `main`
   - 检查远端同名 tag 是否已存在
   - 执行 `pnpm release:preflight -- --tag <tag>`
   - 从当前 `main` HEAD 创建并推送新 tag
5. tag push 之后，`release-desktop` 自动开始发布构建。

### 方式 B：从本地调用官方 wrapper

适用场景：

- 你已经确认 release PR 已合并
- 想从本地发起远端 tag 创建，但不依赖 `gh`

标准命令：

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm release:prepare -- --tag 0.1.8"
```

或使用仓库专属 token：

```powershell
pwsh.exe -NoProfile -Command "[System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN_BG3CALCULATOR', '<github-token>', 'User')"
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8"
```

这条命令底层会：

- 校验当前分支就是 `main`
- 校验工作树干净
- 校验 `origin/main` 与本地 `HEAD` 一致
- 校验远端 tag 未复用
- 用 GitHub REST API dispatch `create-release-tag.yml`

它不会：

- 本地 commit 改动
- 推送 `main`
- 本地创建 tag
- 回退到 manual local release

## 不再推荐的路径

以下动作不再是仓库的正式发版流程：

- `pnpm release:prepare-local`
- `pnpm release:prepare-remote`
- 手工 `git tag <tag>` + `git push origin <tag>` 作为默认发版方式
- workflow 自动同步版本并回写 `main`

如果本地 `main` ahead 或工作树不干净，先修复分支状态，再触发远端 workflow，不要试图绕过远端事实源。

## 推荐的 GitHub 仓库设置

优先使用仓库脚本下发这些设置，而不是手工去 GitHub settings 里逐项点击：

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_ADMIN_TOKEN_BG3CALCULATOR = '<github-admin-token>'; pnpm cicd:apply-github-guardrails"
pwsh.exe -NoProfile -Command "$env:GITHUB_ADMIN_TOKEN_BG3CALCULATOR = '<github-admin-token>'; pnpm cicd:apply-github-guardrails -- --dry-run"
```

脚本会把下面这些约束应用到 GitHub 仓库侧：

- 为 `main` 启用 branch protection 或 ruleset
- 禁止直接 push / force-push 到 `main`
- 要求 PR、review、required checks、latest branch
- 把 `lint-typecheck-test` 和 `automation-guardrails` 设为 required checks
- 为正式 release tag 启用 tag protection 或 ruleset，禁止人工直接创建、改写或删除已发布 tag
- 如果仓库属于 GitHub 组织，release tag ruleset 必须给 `github-actions` App（id `15368`）保留 bypass，否则 `create-release-tag.yml` 无法推 tag
- 当前仓库属于个人账号；GitHub 当前不允许给 `github-actions` integration 配 tag ruleset bypass，所以脚本会自动退到兼容模式：阻止已发布 tag 被更新或删除，但不阻止新 tag 创建
- 当前仓库属于个人账号；为避免单管理员仓库被“required review + enforce admins”锁死，脚本也会让 `main` 保留管理员 bypass
- 如后续接入签名或审批，再把正式发布 job 绑定到单独 environment

注意：

- 这里需要的是带仓库 `Administration: Read and write` 权限的 token。
- 只够 dispatch workflow 的普通 `GH_TOKEN` / `GITHUB_TOKEN` 不一定能修改 branch protection 或 ruleset。

## 必须遵守的约束

- release tag 必须是无 `v` 前缀的语义化版本
- release tag 必须是此前未使用过的新 tag
- 四个版本文件必须与 tag 完全一致：
  - `package.json`
  - `apps/desktop-tauri/package.json`
  - `apps/desktop-tauri/src-tauri/tauri.conf.json`
  - `apps/desktop-tauri/src-tauri/Cargo.toml`
- 正式发版前，版本变更必须先经由 PR 合入 `main`

## 常见失败点

### 1. `release:preflight` 版本不一致

症状：

- tag 是 `0.1.8`
- 四个文件仍是旧版本

处理：

- 先执行 `pnpm release:sync-version -- --tag 0.1.8`
- 再执行 `pnpm release:preflight -- --tag 0.1.8`
- 通过 PR 合入 `main` 后再触发 `create-release-tag`

### 2. 本地 `main` ahead，但远端 workflow 仍然看不到新提交

症状：

- 本地 `git status --branch` 显示 `ahead`
- 直接执行 `pnpm release:prepare -- --tag <tag>` 失败，提示 `origin/main` 与本地 `HEAD` 不一致

根因：

- `workflow_dispatch` 运行的是远端 `ref` 对应的提交
- 本地 ahead 并不会自动成为远端 workflow 的输入

处理：

- 先通过 PR 或正常分支合并把代码送上远端 `main`
- 等本地与 `origin/main` 一致后，再触发 `create-release-tag`

### 3. 旧 tag 再 push 一次，没有新的 release

症状：

- `git push origin <tag>` 输出 `Everything up-to-date`
- GitHub Release 没更新

根因：

- `release-desktop` 只会在新的 tag push 时触发

处理：

- 使用一个全新的版本 tag
- 不推荐重打旧 tag，除非你明确接受改写历史的风险

## 相关文件

- `/.github/workflows/ci.yml`
- `/.github/workflows/create-release-tag.yml`
- `/.github/workflows/release-desktop.yml`
- `/.github/workflows/desktop-build.yml`
- `/.github/workflows/desktop-build-matrix.yml`
- `/scripts/github-workflow-dispatch.mjs`
- `/scripts/release-prepare.mjs`
- `/scripts/release-sync-version.mjs`
- `/scripts/release-preflight.mjs`
- `/docforcodex/hole/release-cicd/release-cicd-errors-and-pitfalls.md`
