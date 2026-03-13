# 本地 CI/CD 编排通用流程

## 目标

这份文档描述一条可复用的本地 CI/CD 编排骨架，目标是把“本地操作”和“远端事实源”分开，让仓库自动化尽量落到受保护分支和 GitHub Actions 上。

核心原则：

- 先识别仓库真正的触发器，再决定是 PR merge、tag push 还是 `workflow_dispatch`
- 优先使用仓库已经提供的本地编排脚本
- 如果流程涉及正式发布，默认把远端受保护分支当成事实源
- 本地 wrapper 更适合做校验和 dispatch，不适合承担正式 `commit/push/tag`
- 本地 dispatch workflow 时优先使用仓库内脚本或 GitHub REST API，不把 `gh` 当成唯一前置条件

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
6. 判断本地是否具备 GitHub Token / 认证能力，决定能否安全 dispatch workflow。

## 触发路径优先级

### 1. 优先：仓库内的本地编排脚本

如果仓库已经提供显式入口，例如：

- `pnpm release:prepare`
- `pnpm cicd:dispatch-workflow`
- `pnpm tauri:build:macos:remote`

优先使用这些入口，因为它们通常已经把顺序、校验和错误信息固化到了脚本里。

### 2. 正式发布默认走远端事实源

对于正式 release：

- 先在 PR 中同步版本和通过校验
- 再由远端 workflow 创建 tag
- 再由 tag 驱动 release workflow

如果本地 wrapper 只是触发 release workflow，那么它应当：

- 只做校验
- 只做 dispatch
- 要求本地 `HEAD` 已经和远端目标分支一致
- 不再本地 `commit/push/tag`

### 3. 本地 dispatch workflow

当仓库存在 `workflow_dispatch` 入口，且本地有 `GH_TOKEN` / `GITHUB_TOKEN` 时，可以直接从本地触发 GitHub Actions，而不必依赖 `gh`。

通用入口：

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm cicd:dispatch-workflow -- --workflow desktop-build.yml --ref main --input target=macos-universal --input request_id=manual --wait"
```

如果你不想让多个项目长期共用一个全局 token，现在也支持按仓库名自动识别项目专属变量：

```powershell
pwsh.exe -NoProfile -Command "[System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN_BG3CALCULATOR', '<github-token>', 'User')"
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8"
```

当前 token 发现顺序：

- 先读取当前 shell 里的 `GH_TOKEN` / `GITHUB_TOKEN`
- 如果两者都没设，再按仓库名查找专属变量
- 当前仓库支持的专属变量示例：
  - `GH_TOKEN_BG3CALCULATOR`
  - `GITHUB_TOKEN_BG3CALCULATOR`
  - `GH_TOKEN_WATOUT_BG3CALCULATOR`
  - `GITHUB_TOKEN_WATOUT_BG3CALCULATOR`

推荐做法：

- 每个项目单独创建 Fine-grained token
- 优先保存到项目专属环境变量，而不是长期共用一个全局 `GITHUB_TOKEN`
- 如果 token 曾贴进聊天记录、脚本、截图或日志，直接视为已泄露，先去 GitHub 撤销再重建

## BG3calculator 当前落地入口

### 1. 正式 release wrapper

```powershell
pwsh.exe -NoProfile -Command "pnpm release:prepare -- --tag 0.1.8"
```

它会固定执行：

- 检查当前分支是否为 `main`
- 检查工作树是否干净
- 检查 `origin/main` 是否与本地 `HEAD` 一致
- 检查远端 tag 是否已存在
- dispatch `create-release-tag.yml`

它不会再回退到本地手工 release。

### 2. 通用 workflow dispatch

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm cicd:dispatch-workflow -- --workflow desktop-build.yml --ref main --input target=windows-x64 --input request_id=manual --wait"
```

这条命令底层直接调用 GitHub REST API，不依赖 `gh`。

### 3. 远程 macOS 构建

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_TOKEN = '<github-token>'; pnpm tauri:build:macos:remote"
```

这条路径仍然要求远端分支语义，也就是当前分支工作树干净，且 `origin/<branch>` 与本地 `HEAD` 一致。

## 不再提供的正式路径

当前仓库不再提供以下正式 release 入口：

- `pnpm release:prepare-local`
- `pnpm release:prepare-remote`
- 本地一键 `commit -> push main -> tag -> push tag`

如果仓库以后确实需要 break-glass 流程，应该显式设计成单独权限入口，而不是默认混在日常 release 命令里。

## 适配其他仓库时的判断方式

以后遇到别的仓库时，优先回答这 4 个问题：

1. 什么动作会触发 CI？
2. 什么动作会触发 build / release / deploy？
3. 仓库有没有现成的本地 orchestration 命令？
4. 这条本地命令是在“准备远端事实”，还是在“直接代替远端事实”？

只要这 4 个问题有答案，就能把本地 CI/CD 流程稳定地落到：

- 直接执行本地脚本
- 直接 dispatch workflow
- 或者先通过 PR/merge 把事实送上远端，再由远端继续 release / deploy

## 首次治理初始化

如果是首次把仓库切到“远端受保护主分支 + 远端创建 release tag”的模式，先补 GitHub 仓库保护规则：

```powershell
pwsh.exe -NoProfile -Command "$env:GITHUB_ADMIN_TOKEN_BG3CALCULATOR = '<github-admin-token>'; pnpm cicd:apply-github-guardrails"
```

补充说明：

- 该命令需要仓库 `Administration: Read and write` 权限。
- 它会更新 `main` 的 branch protection，并创建或更新 release tag ruleset。
- 如果仓库属于 GitHub 组织，release tag ruleset 默认保留 `github-actions` App bypass，避免 `create-release-tag.yml` 被自己触发的 tag protection 拦截。
- 如果仓库属于个人账号，GitHub 当前不允许给 `github-actions` integration 配 tag ruleset bypass，脚本会自动切到兼容模式：只保护 tag 更新/删除，保留新 tag 创建能力。
- 如果仓库属于个人账号且只有单管理员，脚本会让 `main` 保留管理员 bypass，避免后续被 required review 自己锁死。
