# BG3calculator

`BG3calculator` 是一个面向《博德之门 3》的桌面伤害期望计算器。仓库使用 `pnpm` workspace 组织 Tauri 桌面应用与核心计算包，重点不是只算一次攻击，而是把一整套攻击编排聚合成每轮期望伤害与多轮总伤害。

仓库地址：<https://github.com/Watout/BG3calculator>

## 功能亮点

- 多攻击项模板：把一轮中的多段攻击拆成多个攻击项，再聚合为整套模板的期望伤害。
- 主手 / 副手独立建模：主手与副手可分别设置伤害表达式、攻击加值与执行次数；副手留空时会自动回退为仅主手计算。
- 表达式输入友好：伤害和攻击加值都支持骰子表达式，例如 `1d8+3`、`1d4+5`、`2+1d6`。
- BG3 常见规则覆盖：支持 AC、优势 / 劣势、重击阈值、半身人幸运、抗性 / 易伤 / 免疫、伤害骰多掷取高 / 低。
- 结果可解释：除总期望外，还会展示主副手单次期望、总期望、命中条件下期望、重击条件下期望，以及“必中全重击”视角。

## 仓库结构

- `apps/desktop-tauri`: React + Tauri 桌面应用，负责输入、状态管理、Worker 调度与结果展示。
- `packages/rulesets`: 在领域层之上封装 BG3 规则效果与攻击模板编排。
- `packages/domain`: 核心命中、重击、伤害、豁免与多段攻击聚合计算。
- `packages/prob`: 通用离散概率分布工具。
- `packages/dice-parser`: 骰子表达式解析与规范化输出。

## 环境要求

- Windows 10/11
- PowerShell 7：`pwsh.exe`
- Node.js `24.14.0`
- `pnpm@10.32.1`
- Rust stable（含 `cargo` / `rustup`）
- WebView2 Runtime
- Visual Studio C++ / MSVC 工具链（Windows Tauri 构建需要）

## 快速开始

先启用并固定仓库使用的 `pnpm` 版本：

```powershell
pwsh.exe -NoProfile -Command "corepack enable"
pwsh.exe -NoProfile -Command "corepack prepare pnpm@10.32.1 --activate"
pwsh.exe -NoProfile -Command "pnpm install --frozen-lockfile"
```

启动桌面开发环境：

```powershell
pwsh.exe -NoProfile -Command "pnpm tauri:dev"
```

## 校验命令

```powershell
pwsh.exe -NoProfile -Command "pnpm lint"
pwsh.exe -NoProfile -Command "pnpm typecheck"
pwsh.exe -NoProfile -Command "pnpm test"
```

CI 也会执行同一组根级校验命令。

## 构建与发布

本地桌面构建：

```powershell
pwsh.exe -NoProfile -Command "pnpm tauri:build"
pwsh.exe -NoProfile -Command "pnpm tauri:build:windows"
pwsh.exe -NoProfile -Command "pnpm tauri:build:macos:universal"
```

### 从 Windows 触发远程 macOS 构建

Windows 主机不能直接本地产出 macOS 安装包；仓库提供的是“在 Windows 上触发 GitHub Actions 的 macOS runner 构建，并把 artifact 下载回本地”的链路。

```powershell
pwsh.exe -NoProfile -Command "$env:GH_TOKEN = '<github-token>'; pnpm tauri:build:macos:remote"
pwsh.exe -NoProfile -Command "$env:GH_TOKEN = '<github-token>'; pnpm tauri:build:macos:remote -- --dry-run"
```

说明：

- 需要 `GH_TOKEN` 或 `GITHUB_TOKEN`，且该 token 能触发 workflow 并读取 artifact。
- 当前分支工作树必须干净，且 `origin/<branch>` 与本地 `HEAD` 一致。
- 默认下载目录为 `.artifacts/macos-universal/<request_id>/`。
- `--dry-run` 只做本地校验与请求预览，不实际 dispatch workflow。
- 当前默认只请求并下载 `macos-universal` 产物。

### GitHub Actions

- `ci`: 在 `pull_request` 和推送到 `main` 时运行 `lint`、`typecheck`、`test`。
- `desktop-build`: 手动触发桌面构建，可用于开发测试与远程 macOS 构建脚本调用。
- `release-desktop`: 推送无 `v` 前缀的语义化版本 tag，例如 `0.1.2` 或 `0.1.2-beta.1` 时，先校验版本一致性，再构建 Windows / macOS 安装包并更新同名 GitHub Release。

正式发布前，先把下面 4 个文件的版本统一改成目标 tag：

- `package.json`
- `apps/desktop-tauri/package.json`
- `apps/desktop-tauri/src-tauri/tauri.conf.json`
- `apps/desktop-tauri/src-tauri/Cargo.toml`

然后再做本地预检：

```powershell
pwsh.exe -NoProfile -Command "pnpm release:preflight -- --tag 0.1.2"
```

如果这里报版本不一致，`release-desktop` 会在 `verify-workspace` 阶段直接失败，Windows / macOS 构建和 Release 资产上传都不会开始。

发布示例：

```powershell
pwsh.exe -NoProfile -Command "git tag 0.1.2"
pwsh.exe -NoProfile -Command "git push origin 0.1.2"
```

## 当前状态

- 当前桌面发布产物默认是未签名包，适合开发测试与内部分发。
- 根仓库是私有 workspace 结构，`packages/*` 主要服务于本项目内部分层，不是独立发布到 npm 的公共 SDK。

## 参考文档

- [代码边界与接口说明](./docsforcodex/overall.md)
- [Codex 本地接入与 Release 流程](./docsforcodex/codex-local-setup-and-release.md)
- [远程 macOS 构建背景](./docsforcodex/macos-remote-build-context.md)
