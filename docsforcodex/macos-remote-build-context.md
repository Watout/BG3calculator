# macOS Remote Build Context

## 背景结论

- 当前仓库桌面端基于 Tauri 2，已经有 macOS 目标脚本和 GitHub Actions 的 `macos-latest` job，但没有 Windows 本机直出 macOS 安装包所需的跨编译/Apple SDK/签名链路。
- 因此本次实现主线不是“让 Windows 直接编译出 macOS 包”，而是“让 Windows 本机一键触发 GitHub macOS runner 构建，并把 artifact 拉回本地”。
- Tauri 官方文档对 macOS bundle/DMG 的主路径是“在 Mac computer 上执行构建命令”，仓库 README 也已经明确写了当前 Windows 主机不能直接产出 macOS 安装包。

## 仓库现状

- 根脚本已有：
  - `tauri:build:macos:x64`
  - `tauri:build:macos:arm64`
  - `tauri:build:macos:universal`
- GitHub Actions 已有 `.github/workflows/desktop-build.yml`，其中 `macos-universal` matrix 在 `macos-latest` 上执行 `pnpm tauri:build:macos:universal`。
- Tauri bundling 配置已包含 `icon.icns`，说明 macOS 资源并非空白占位。
- 缺口在“从本机触发、跟踪、下载远程 macOS 构建产物”的编排层，以及对应文档、openspec 和验收方式。

## 本次新增能力

- 新增 `pnpm tauri:build:macos:remote` 作为 Windows 本机入口。
- 新增 `scripts/tauri-remote-macos-build.mjs`：
  - 读取 `GH_TOKEN` / `GITHUB_TOKEN`，也支持仓库专属变量如 `GITHUB_TOKEN_BG3CALCULATOR`
  - 校验当前分支干净且已推到 `origin`
  - 调 GitHub Actions workflow dispatch
  - 轮询定位本次 workflow run
  - 等待 `bg3calculator-macos-universal` artifact
  - 下载并解压到 `.artifacts/macos-universal/<request_id>/`
- workflow 增加 `target` 和 `request_id` 输入，允许只跑 `macos-universal`，避免顺带构建 Windows。

## 默认约束

- 只支持“远程分支”语义；脚本会拒绝未推送、工作树不干净或 detached HEAD 的场景。
- 本次只产出未签名包，README 和 workflow 结构保留后续接 Apple 签名/公证的扩展位，但不落 notarization 实现。
- 本地脚本不依赖 `gh` CLI，使用 Node 24 原生 `fetch` 和 GitHub REST API。

## 关键路径

- 本机命令：`pnpm tauri:build:macos:remote`
- workflow：`.github/workflows/desktop-build.yml`
- 本地产物目录：`.artifacts/macos-universal/<request_id>/`
- 远程 artifact 名：`bg3calculator-macos-universal`
