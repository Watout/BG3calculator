# Action CI/CD 发版流程

## 目标

这份文档描述当前仓库推荐的 GitHub Actions 发版链路，重点解决两个已真实发生过的问题：

- 四个版本文件未同步就先推 tag，导致 `release-desktop` 在 preflight 阶段失败
- tag 已经存在但指向旧提交，后续只推 `main` 不会重新触发 release

## 当前工作流分工

- `/.github/workflows/ci.yml`
  - PR 和 `main` 的基础校验
  - 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`
- `/.github/workflows/prepare-release.yml`
  - 手动准备 release 的入口
  - 自动同步版本、校验、提交到 `main`、创建全新 tag
- `/.github/workflows/release-desktop.yml`
  - 监听新的语义化版本 tag
  - 构建 Windows x64 与 macOS Universal
  - 创建或更新 GitHub Release
- `/.github/workflows/desktop-build.yml`
  - 与正式 release 解耦的手动桌面构建入口
  - 用于开发验证或远程 macOS 构建调度

## 推荐发版路径

### 方式 A：推荐，使用 `prepare-release`

适用场景：

- 希望减少手工命令
- 希望避免忘记同步版本或误复用旧 tag

操作步骤：

1. 在 GitHub Actions 中手动触发 `prepare-release`
2. 输入一个此前未使用过的无 `v` 语义化版本，例如 `0.1.6`
3. workflow 会自动：
   - checkout `main`
   - `pnpm release:sync-version -- --tag <tag>`
   - `pnpm release:preflight -- --tag <tag>`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - 若四个版本文件发生变化，则将同步结果提交到 `main`
   - 若四个版本文件本来就已经对齐目标 tag，则跳过空 commit
   - 创建并推送新的 tag
4. tag push 之后，`release-desktop` 自动开始发布构建

### 方式 B：手工命令

适用场景：

- 本地需要完全掌控 commit / tag 节点
- 暂时不方便使用 GitHub Actions 手动 dispatch

标准命令：

```powershell
pwsh.exe -NoProfile -Command "pnpm release:sync-version -- --tag 0.1.6"
pwsh.exe -NoProfile -Command "pnpm release:preflight -- --tag 0.1.6"
pwsh.exe -NoProfile -Command "pnpm lint"
pwsh.exe -NoProfile -Command "pnpm typecheck"
pwsh.exe -NoProfile -Command "pnpm test"
pwsh.exe -NoProfile -Command "git push origin main"
pwsh.exe -NoProfile -Command "git tag 0.1.6"
pwsh.exe -NoProfile -Command "git push origin 0.1.6"
```

## 必须遵守的约束

- release tag 必须是无 `v` 前缀的语义化版本
- release tag 必须是此前未使用过的新 tag
- 四个版本文件必须与 tag 完全一致：
  - `package.json`
  - `apps/desktop-tauri/package.json`
  - `apps/desktop-tauri/src-tauri/tauri.conf.json`
  - `apps/desktop-tauri/src-tauri/Cargo.toml`

## 常见失败点

### 1. `release:preflight` 版本不一致

症状：

- tag 是 `0.1.5`
- 四个文件还是 `0.1.4`

处理：

- 先执行 `pnpm release:sync-version -- --tag 0.1.5`
- 再重新执行 `pnpm release:preflight -- --tag 0.1.5`

### 2. `git push origin <tag>` 没触发 release

症状：

- 输出 `Everything up-to-date`
- GitHub Release 没更新

根因：

- 这个 tag 早就已经存在，而且可能还指向旧提交

处理：

- 优先改用一个全新的 tag，例如从 `0.1.5` 升到 `0.1.6`
- 不推荐重打旧 tag，除非你明确接受改写 tag 的风险

## 相关文件

- `/.github/workflows/prepare-release.yml`
- `/.github/workflows/release-desktop.yml`
- `/scripts/release-sync-version.mjs`
- `/scripts/release-preflight.mjs`
- `/docforcodex/hole/release-cicd/release-cicd-errors-and-pitfalls.md`
