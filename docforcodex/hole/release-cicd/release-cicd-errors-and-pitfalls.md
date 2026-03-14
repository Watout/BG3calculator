# Release CI/CD 错误与坑点落库

## 目标

本文件用于记录这次在桌面端 Release CI/CD 收敛过程中，真实出现过的错误、根因、修复方式，以及后续需要特别注意的坑点。

适用范围：

- `/.github/workflows/desktop-build.yml`
- `/.github/workflows/release-desktop.yml`
- `/scripts/release-preflight.mjs`
- `/scripts/release-collect-assets.mjs`
- `/scripts/release-publish.mjs`

---

## 已出现错误

### 1. `desktop-build.yml` 的 `matrix` 上下文错误

报错原文：

```text
Check failure on line 1 in .github/workflows/desktop-build.yml

GitHub Actions
/ .github/workflows/desktop-build.yml
Invalid workflow file

(Line: 27, Col: 9): Unrecognized named-value: 'matrix'. Located at position 44 within expression: inputs.target == 'all' || inputs.target == matrix.name
```

根因：

- 在 job 级 `if:` 中引用了 `matrix.name`
- GitHub Actions 在这个位置还没有展开 matrix，上下文不可用
- 因此 workflow 直接在解析阶段失败，而不是运行阶段失败

错误写法示意：

```yaml
jobs:
  build-desktop:
    if: ${{ inputs.target == 'all' || inputs.target == matrix.name }}
```

解决路径：

- 不再用 job 级 `if` 过滤 matrix
- 改为根据 `inputs.target` 动态生成 `strategy.matrix.include`
- 这样在 workflow 解析时只依赖 `inputs.*`，避免访问未展开的 `matrix.*`

验证方式：

- GitHub Actions 不再报 `Unrecognized named-value: 'matrix'`
- 手动触发 `desktop-build` 时可以按 `windows-x64`、`macos-universal`、`all` 三种输入展开 matrix

相关文件：

- `/.github/workflows/desktop-build.yml`

---

### 2. `pnpm ... -- --tag` 触发 `Unknown argument: --`

报错原文：

```text
Run pnpm release:preflight -- --tag "0.1.2"

> bg3dc-workspace@0.1.0 release:preflight /home/runner/work/BG3calculator/BG3calculator
> node scripts/release-preflight.mjs -- --tag 0.1.2

Unknown argument: --
```

根因：

- `pnpm run-script -- --arg` 会把裸 `--` 继续传给 Node 脚本
- 脚本自己的 CLI 参数解析器之前没有忽略这个分隔符
- 于是把 `--` 当成普通未知参数，直接抛错

影响范围：

- `/scripts/release-preflight.mjs`
- `/scripts/release-collect-assets.mjs`

解决路径：

- 在两个脚本的 `parseCliArgs()` 中显式忽略独立的 `--`

修复后逻辑：

```js
if (value === "--") {
  continue;
}
```

验证方式：

- `pnpm release:preflight -- --tag 0.1.0` 通过
- `pnpm release:collect-assets -- --help` 能正常输出帮助
- 对应 Vitest 测试覆盖了裸 `--` 场景

相关文件：

- `/scripts/release-preflight.mjs`
- `/scripts/release-collect-assets.mjs`
- `/scripts/release-preflight.test.ts`
- `/scripts/release-collect-assets.test.ts`

---

## 当前发布链路的关键规则

### 1. Release tag 必须是无 `v` 前缀的语义化版本

允许：

- `0.1.2`
- `0.1.2-beta.1`
- `1.0.0-rc.2`

不允许：

- `v0.1.2`
- `release-0.1.2`
- `0.1`

原因：

- 当前仓库实际历史 tag 是无 `v` 风格
- `release-preflight` 已经把无 `v` 作为强约束
- workflow 的 tag glob 较宽，但真正的合法性由脚本做最终校验

注意：

- `release-desktop.yml` 里的 `tags: "*.*.*"` 不是“什么都能发”
- 真正的过滤器是 `release-preflight.mjs`

---

### 2. 版本必须四处完全一致

正式 release 前，下面四个文件的版本必须一致，并且等于 tag：

- `/package.json`
- `/apps/desktop-tauri/package.json`
- `/apps/desktop-tauri/src-tauri/tauri.conf.json`
- `/apps/desktop-tauri/src-tauri/Cargo.toml`

如果不一致：

- `release-preflight` 会直接失败
- 构建 job 不应继续开始

2026-03-13 真实复现：

- 远端仓库已经存在 tag `0.1.2`
- GitHub Actions 上 `release-desktop` run `23021142103` 卡在 `verify-workspace` 并失败
- 本地在 tag 对应提交上执行 `pnpm release:preflight -- --tag 0.1.2`，得到原始报错：

```text
Release version mismatch detected for tag 0.1.2:
- package.json: found 0.1.0, expected 0.1.2
- apps/desktop-tauri/package.json: found 0.1.0, expected 0.1.2
- apps/desktop-tauri/src-tauri/tauri.conf.json: found 0.1.0, expected 0.1.2
- apps/desktop-tauri/src-tauri/Cargo.toml: found 0.1.0, expected 0.1.2
```

根因：

- `release-desktop.yml` 在真正构建前会调用 `pnpm release:preflight -- --tag "${{ github.ref_name }}"`
- tag `0.1.2` 指向的提交里，四个版本文件仍然是 `0.1.0`
- 因此 workflow 在 verify 阶段就被拦下，`build-desktop` 与 `publish-release` 都会被跳过

解决路径：

- 不要只打 tag；先把四个版本文件同步到目标版本
- 优先运行 `pnpm release:sync-version -- --tag <tag>` 做四处版本同步
- 重新运行 `pnpm release:preflight -- --tag <tag>`
- 然后再推送新的合法 tag

验证结果：

- GitHub Releases API 仅有 `0.1.0`、`0.1.1` 两个 release，没有 `0.1.2`
- GitHub Tags API 已存在 `0.1.2`
- 这说明“tag 已存在但 release 未生成”的断点发生在 preflight 之前的 verify 阶段，而不是 release 上传动作本身

相关文件：

- `/.github/workflows/release-desktop.yml`
- `/scripts/release-preflight.mjs`
- `/scripts/release-sync-version.mjs`
- `/package.json`
- `/apps/desktop-tauri/package.json`
- `/apps/desktop-tauri/src-tauri/tauri.conf.json`
- `/apps/desktop-tauri/src-tauri/Cargo.toml`

这是必须保留的防漂移约束，不能删。

2026-03-13 又复现了一次同类问题：

- 在 GitHub Actions / Linux runner 里执行 `pnpm release:preflight -- --tag 0.1.5`
- 四个版本文件已经推进到 `0.1.4`
- 但目标 tag 是 `0.1.5`
- 因此再次得到标准版本漂移报错，而不是脚本异常：

```text
Release version mismatch detected for tag 0.1.5:
- package.json: found 0.1.4, expected 0.1.5
- apps/desktop-tauri/package.json: found 0.1.4, expected 0.1.5
- apps/desktop-tauri/src-tauri/tauri.conf.json: found 0.1.4, expected 0.1.5
- apps/desktop-tauri/src-tauri/Cargo.toml: found 0.1.4, expected 0.1.5
```

这次的直接修复方式：

- 在仓库根目录执行 `pnpm release:sync-version -- --tag 0.1.5`
- 再执行 `pnpm release:preflight -- --tag 0.1.5`

验证结果：

- 四个版本文件全部同步到 `0.1.5`
- `release:preflight` 可以继续往后通过，不再停在版本一致性校验

2026-03-13 同一天又确认了另一个相邻坑点：

- `main` 已经推到包含正确版本文件的新提交
- 但远端同名 tag `0.1.5` 早就已经存在，并且仍然指向旧提交
- 这时执行：

```text
git tag 0.1.5
fatal: tag '0.1.5' already exists

git push origin 0.1.5
Everything up-to-date
```

根因：

- `release-desktop` 只会在“新的 tag push”时触发
- 已存在的 tag 再次 push 不会重新触发 workflow
- 所以“先修 main，再重复 push 同名旧 tag”不会产生新的 release run

解决路径：

- 推荐直接使用一个全新的版本 tag，例如 `0.1.6`
- 或者改用新的手动 workflow `prepare-release.yml`，让 workflow 先检查 tag 是否已存在，再自动同步版本、提交到 `main`、创建新 tag
- 只有在明确接受重写 tag 风险时，才考虑删除并重打旧 tag

验证方式：

- `git ls-remote --tags origin 0.1.5` 能看到远端旧 tag 已存在
- `git rev-parse 0.1.5` 与 `git rev-parse HEAD` 不一致时，说明 tag 仍指向旧提交
- 推送一个全新的 tag 后，`release-desktop` 才会创建新的 workflow run

2026-03-13 在新增 `prepare-release.yml` 时还确认了一个 PowerShell workflow 细节坑点：

- 原始写法试图用 `if (git diff --cached --quiet) { ... } else { ... }` 判断是否存在 staged 改动
- 但在 `pwsh` 中，native command 放进 `if (...)` 判断的是命令输出，而不是进程退出码
- `git diff --cached --quiet` 无论“有改动”还是“无改动”都不会输出文本，因此这种写法会得到错误分支行为

根因：

- `prepare-release.yml` 使用 `shell: pwsh`
- PowerShell 对原生命令的真假判断不等于 Bash 的 `$?` / 退出码语义
- 如果继续用错误写法，workflow 可能在“版本本来已对齐”的情况下仍然尝试执行空 `git commit`，导致 prepare 阶段失败

解决路径：

- 先单独执行 `git diff --cached --quiet`
- 再显式检查 `$LASTEXITCODE`
  - `0` 代表没有 staged 改动，直接跳过 commit
  - `1` 代表存在 staged 改动，执行 `git commit`
  - 其他退出码按命令失败处理

验证方式：

- 版本文件已经是目标版本时，`prepare-release` 会输出“无需新增 commit”，但仍能继续 push `main` 并创建新 tag
- 版本文件发生变化时，`prepare-release` 会正常创建 `chore: prepare release <tag>` commit

相关文件：

- `/.github/workflows/prepare-release.yml`

---

### 3. `release-desktop.yml` 的宽匹配依赖 preflight 兜底

当前 workflow 触发条件是：

```yaml
on:
  push:
    tags:
      - "*.*.*"
```

这样做的原因：

- GitHub Actions 的 tag glob 不适合做复杂 SemVer 校验
- 我们需要允许 prerelease 形式，例如 `0.1.2-beta.1`
- 所以用较宽的 glob 负责“触发”，再由 `release-preflight` 负责“判定是否合法”

坑点：

- 不要误以为 `*.*.*` 本身就代表严格 SemVer
- 如果以后移除 preflight，这条 workflow 会变得过宽

---

### 3.1 手工发版路径不能只做 preflight 和推 tag

错误现象：

- 本地手工发版时只执行：
  - `pnpm release:sync-version -- --tag <tag>`
  - `pnpm release:preflight -- --tag <tag>`
  - `git tag <tag>`
  - `git push origin <tag>`
- 省略了 `pnpm lint`、`pnpm typecheck`、`pnpm test`
- 也没有先把包含版本同步的提交推到 `main`

根因：

- `release:preflight` 只负责 tag 与四个版本文件一致性校验，不负责整个工作区的发布验收
- `release-desktop` 是新 tag push 触发；如果 tag 指向的提交没有先进入 `main`，手工流程就会偏离仓库推荐发布路径
- 旧文档一度把手工路径写得过短，容易让人误以为“preflight 通过就能直接推 tag”

解决路径：

- 手工发布时统一按以下顺序执行：
  - `pnpm release:sync-version -- --tag <tag>`
  - `pnpm release:preflight -- --tag <tag>`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `git push origin main`
  - `git tag <tag>`
  - `git push origin <tag>`
- 更推荐直接用 `prepare-release.yml`，让 workflow 自动完成这套流程

验证方式：

- [`docsforcodex/codex-local-setup-and-release.md`](C:/1W/codingProject/BG3calculator/docsforcodex/codex-local-setup-and-release.md) 的手工发版段落已补齐完整步骤与顺序说明
- 手工路径现在和 [`docsforcodex/action-cicd-release-flow.md`](C:/1W/codingProject/BG3calculator/docsforcodex/action-cicd-release-flow.md) 及 [`.github/workflows/prepare-release.yml`](C:/1W/codingProject/BG3calculator/.github/workflows/prepare-release.yml) 保持一致

相关文件：

- `/docsforcodex/codex-local-setup-and-release.md`
- `/docsforcodex/action-cicd-release-flow.md`
- `/.github/workflows/prepare-release.yml`

---

### 4. 资产收集不是“捞到什么传什么”

`release-collect-assets.mjs` 当前不是简单匹配全部文件，而是有最低资产契约：

必须至少存在：

- 一个 Windows `.msi`
- 一个 Windows `.exe`
- 一个 macOS `.dmg`

可选附带：

- `.zip`
- `.sig`
- `.app.tar.gz`

这层检查的意义：

- 避免构建残缺却继续发 Release
- 避免误把噪音文件、日志、说明文本上传为 release 资产

坑点：

- 如果未来 Tauri 输出结构变化，先更新资产收集脚本和测试，再改 workflow
- 不要把资产判定逻辑重新塞回 workflow 里的内联 shell

---

### 5. `publish-release` 不能假设前一个 job 的 `pnpm` / checkout 仍然存在

报错原文：

```text
Run pnpm release:collect-assets -- --input release-assets
pnpm: /home/runner/work/_temp/3abc52d1-36af-410f-a203-4369e56e5565.ps1:2
Line |
   2 |  pnpm release:collect-assets -- --input release-assets
     |  ~~~~
     | The term 'pnpm' is not recognized as a name of a cmdlet, function,
     | script file, or executable program. Check the spelling of the name, or
     | if a path was included, verify that the path is correct and try again.
Error: Process completed with exit code 1.
```

根因：

- GitHub Actions 的 job 之间环境是隔离的
- `verify` 和 `build-desktop` 虽然已经做过 `checkout`、`setup-node`、`corepack enable`、`corepack prepare pnpm...`，但这些上下文不会自动延续到 `publish-release`
- 原先的 `publish-release` 直接执行 `pnpm release:collect-assets -- --input release-assets`
- 结果当前 runner 里既没有 `pnpm`，也不保证有仓库源码里的 `package.json` 和 `scripts/release-collect-assets.mjs`

解决路径：

- 在 `publish-release` 开头补 `actions/checkout@v5`
- 补 `actions/setup-node@v5`
- 将资产收集改为直接运行 `node scripts/release-collect-assets.mjs --input release-assets`
- 由于这个脚本只依赖 Node 内置模块，所以这里不需要额外执行 `pnpm install`
- 后续在 Node 20 action runtime 下线整改中，`publish-release` 又进一步收敛为 `node scripts/release-publish.mjs --input release-assets ...`
- 当前 `release-publish.mjs` 会在上传前内部复用 `release-collect-assets.mjs` 的资产契约校验，不再依赖 workflow 里的 `steps.collect.outputs.files`

验证方式：

- `Collect release files` 不再报 `pnpm is not recognized`
- `Publish GitHub release` 这一步能直接在当前 job 完成资产校验、Release upsert 与 asset 上传

相关文件：

- `/.github/workflows/release-desktop.yml`
- `/scripts/release-collect-assets.mjs`
- `/scripts/release-publish.mjs`

---

### 6. Node.js 20 JavaScript action runtime 弃用告警不能只靠“升个小版本”赌过去

错误现象：

- GitHub Actions 构建完成后出现 deprecation warning：

```text
Node.js 20 actions are deprecated. The following actions are running on Node.js 20 and may not work as expected: actions/download-artifact@v4, softprops/action-gh-release@v2. Actions will be forced to run with Node.js 24 by default starting June 2nd, 2026.
```

根因：

- 这类告警针对的是 JavaScript action metadata 里的 `runs.using` runtime，不是 workflow 自己用 `actions/setup-node` 配的业务 Node 版本
- 仓库虽然已经把 job 内业务 Node 固定到 `24.14.0`，并设置了 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`
- 但 `actions/download-artifact@v4` 与 `softprops/action-gh-release@v2` 仍然属于声明为 Node 20 的 JavaScript action，所以继续被 GitHub 标记为风险点
- `softprops/action-gh-release` 的 release note 与公开 `action.yml` 一度出现“自称已迁到 Node 24、但 metadata 仍显示 node20”的冲突信息，工程上不能把这种状态当成已经修好

解决路径：

- 将 `actions/upload-artifact` 从 `v4` 升级到 `v6`
- 将 `publish-release` 里的 `actions/download-artifact@v4` 替换成 `gh run download "${{ github.run_id }}" --dir release-assets`
- 将 `softprops/action-gh-release@v2` 替换成仓库内 `node scripts/release-publish.mjs --input release-assets ...`
- `release-publish.mjs` 通过 GitHub REST API：
  - 按 tag 查询 release
  - 不存在时创建 release 并生成 notes
  - 已存在时更新 title / prerelease 状态
  - 上传前删除同名旧资产，再重新上传，等价于原来的 `overwrite_files: true`
- 保留 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` 作为过渡期保险，但不再把关键发布链路押在 Node 20 action 上

验证结果：

- `pnpm lint` 通过
- `pnpm typecheck` 通过
- `pnpm test` 通过
- 新增 `release-publish` 单测，覆盖：
  - 裸 `--` 参数转发
  - 新建 release
  - 更新现有 release
  - 删除同名旧资产再上传
  - 缺少 token 的失败路径

后续防回归建议：

- 以后看到 GitHub Actions 的 Node runtime 弃用告警，先查 action metadata，不要先入为主地以为 `setup-node` 已经解决问题
- 优先选官方 action 的 Node 24 版本；如果上游 action 长期停在旧 runtime，优先改为仓库内脚本或 `gh`/REST API，而不是继续赌第三方 action 的 tag 漂移
- `gh run download` 目前依赖“下载多个 artifact 时会按 artifact 名创建子目录”的行为；如果未来要改成单 artifact 下载或别的下载方式，必须同步检查 `release-collect-assets.mjs` 的目录契约
- 本地 Windows 开发环境当前不保证自带 `gh`；如果本地要模拟 `publish-release`，先确认 `gh --version`，没有的话先装 GitHub CLI，再复现 `gh run download`

相关文件：

- `/.github/workflows/desktop-build.yml`
- `/.github/workflows/release-desktop.yml`
- `/scripts/release-collect-assets.mjs`
- `/scripts/release-publish.mjs`
- `/scripts/release-publish.test.ts`

---

### 7. 本地触发 workflow 不能把 `gh` 当成唯一入口

错误现象：

- 想从本地自动触发 `prepare-release.yml` 或其他 `workflow_dispatch` workflow
- 但当前 Windows 开发机并不保证预装 `gh`
- 结果 skill 虽然知道“优先 dispatch workflow”，实际执行时却只能退回到手工多命令路径

根因：

- 之前仓库只有 `gh workflow run ...` 这种示例命令，没有仓库内的通用 dispatch 脚本
- 这让“本地自动触发 Action”的能力依赖于开发机外部工具，而不是仓库自己的自动化入口

解决路径：

- 新增 `/scripts/github-workflow-dispatch.mjs`
- 统一通过 GitHub REST API 触发 `workflow_dispatch`
- 根工作区暴露通用入口：
  - `pnpm cicd:dispatch-workflow`
- 同时为本仓库 release 流程补一个正式本地入口：
  - `pnpm release:prepare -- --tag <tag>`
  - `pnpm release:prepare-local -- --tag <tag>`
  - `pnpm release:prepare-remote -- --tag <tag>`

验证方式：

- `pnpm test` 覆盖：
  - `scripts/github-workflow-dispatch.test.ts`
  - `scripts/release-prepare.test.ts`
- 文档已改为优先推荐仓库内脚本，而不是假设 `gh` 已安装

后续防回归建议：

- 以后新增 `workflow_dispatch` 型 CI/CD 能力时，优先先补仓库内脚本入口，再写命令示例
- skill 层只负责发现与选择路径，真正的执行顺序优先固化到仓库脚本
- 若仓库已经有 `cicd:*` / `release:*` orchestration 命令，后续 agent 应优先调用这些命令，而不是重新在对话里手拼多条 shell

相关文件：

- `/scripts/github-workflow-dispatch.mjs`
- `/scripts/github-workflow-dispatch.test.ts`
- `/scripts/release-prepare.mjs`
- `/scripts/release-prepare.test.ts`
- `/package.json`

---

### 8. dispatch 路径不应该被“仅本地存在的旧 tag”错误拦截

错误现象：

- 当前机器上已经有本地 tag `0.1.6`
- 远端并没有 `0.1.6`
- 如果 agent 仍把“本地 tag 已存在”当成统一阻塞条件，就会错误放弃 `prepare-release.yml` 的 dispatch 路径，退回到更长的手工流程

根因：

- `prepare-release.yml` 是在 GitHub runner 的干净 checkout 上执行的
- 本地机器上的旧 tag 不会自动同步到 runner
- 对 dispatch 路径来说，真正需要阻塞的是“远端 tag 已存在”，不是“当前开发机本地 tag 残留”
- 只有本地手工打 tag 的路径，才必须同时检查本地和远端 tag 是否复用

解决路径：

- 在 `/scripts/release-prepare.mjs` 里区分两条路径：
  - dispatch 路径：只拦截远端同名 tag
  - manual 路径：同时拦截本地与远端同名 tag
- 同步更新本地 `cicd` skill 和 `docsforcodex` 文档，避免后续 agent 继续把两条路径混为一谈

验证方式：

- `pnpm exec vitest run scripts/release-prepare.test.ts --config vitest.config.ts`
- 测试包含：
  - dispatch 路径允许忽略本地旧 tag
  - manual 路径仍会拒绝本地旧 tag

后续防回归建议：

- 以后新增“本地 wrapper -> dispatch workflow”型流程时，先明确哪些约束属于本地 git 状态，哪些约束属于远端 workflow 事实
- 不要把“手工 tag 路径”的阻塞条件照搬到 `workflow_dispatch` 路径

相关文件：

- `/scripts/release-prepare.mjs`
- `/scripts/release-prepare.test.ts`
- `/docsforcodex/action-cicd-release-flow.md`
- `/docsforcodex/local-cicd-orchestration.md`

---

### 9. 多仓库共用全局 token 容易串权限，贴进聊天/脚本的 token 也应视为已泄露

错误现象：

- 本地同时维护多个 GitHub 仓库，但长期只设置一个全局 `GITHUB_TOKEN`
- 想给某个仓库单独分配 Fine-grained token，却发现本地脚本只会读取全局变量
- 或者把 token 直接贴进聊天、脚本、截图、命令历史之后，仍继续尝试复用这枚 token

根因：

- 之前本地脚本主要只认 `GH_TOKEN` / `GITHUB_TOKEN`
- 这会让多个项目天然倾向共用同一枚 token，既不利于最小权限，也不利于后续轮换
- 一旦 token 出现在聊天记录、日志、截图、提交历史或公开文本里，就不再是安全凭据

解决路径：

- 为每个仓库单独创建 Fine-grained token
- 优先把 token 存到仓库专属环境变量，而不是长期共用一个全局 `GITHUB_TOKEN`
- 当前仓库脚本已支持以下自动发现顺序：
  - 先读当前 shell 的 `GH_TOKEN` / `GITHUB_TOKEN`
  - 若两者缺失，再读仓库专属变量
  - 当前仓库支持的变量示例：
    - `GH_TOKEN_BG3CALCULATOR`
    - `GITHUB_TOKEN_BG3CALCULATOR`
    - `GH_TOKEN_WATOUT_BG3CALCULATOR`
    - `GITHUB_TOKEN_WATOUT_BG3CALCULATOR`
- 若 token 已经贴到聊天、日志、截图或脚本，先去 GitHub 立即撤销并重建，再重新写入安全的本地环境变量

验证方式：

- `pnpm exec vitest run scripts/github-workflow-dispatch.test.ts scripts/release-prepare.test.ts scripts/release-publish.test.ts scripts/tauri-remote-macos-build.test.ts --config vitest.config.ts`
- 测试已覆盖：
  - 按仓库名推导 token 环境变量
  - `release:prepare` 自动识别仓库专属 token
  - `release:publish` 接受仓库专属 token

后续防回归建议：

- 新增任何 GitHub API / workflow dispatch / release 上传脚本时，统一复用仓库专属 token 发现逻辑，不再各写一套
- 文档示例优先展示项目专属 token 变量，降低“复制粘贴后所有仓库共用同一 token”的概率
- 若用户把 token 直接贴进对话，应默认提醒先撤销再重建，而不是继续消费这枚凭据

相关文件：

- `/scripts/github-workflow-dispatch.mjs`
- `/scripts/release-prepare.mjs`
- `/scripts/release-publish.mjs`
- `/scripts/tauri-remote-macos-build.mjs`
- `/docsforcodex/local-cicd-orchestration.md`
- `/docsforcodex/codex-local-setup-and-release.md`
- `/docsforcodex/overall.md`

---

### 10. 严格治理后，正式 release 不应再保留本地 manual fallback

错误现象：

- 仓库同时存在“远端 workflow 打 tag”和“本地直接 `commit/push/tag`”两套正式发版路径
- 操作者难以回答“这次 release 的事实源到底是远端 `main`，还是某台开发机本地状态”
- 一旦 `main` 启用保护规则，本地 manual 路径还会天然和规则对撞

根因：

- 旧版 `release:prepare` 既能 dispatch 远端 workflow，也能回退到本地 `release:prepare-local`
- 旧版 `prepare-release.yml` 还会在 workflow 内同步版本、commit 并 push `main`
- 这会把“release 准备”“版本变更”“tag 创建”混成一条既可本地、又可远端的双轨流程

解决路径：

- 删除 `/scripts/release-prepare-local.mjs`
- 删除 `pnpm release:prepare-local` 和 `pnpm release:prepare-remote`
- 把 `pnpm release:prepare` 固定为远端 `create-release-tag.yml` 的官方 wrapper
- 把旧的 `prepare-release.yml` 改造为只在远端 `main` 上执行 `release:preflight` 并创建新 tag 的 `create-release-tag.yml`
- release 版本同步改到 release PR 中完成，workflow 不再回写 `main`

验证方式：

- `package.json` 中只保留 `release:prepare`
- `scripts/release-prepare.test.ts` 只覆盖远端 dispatch 路径
- `.github/workflows/create-release-tag.yml` 不包含同步版本、commit、push main 逻辑

后续防回归建议：

- 若未来真的需要 break-glass 发布入口，必须显式单独设计权限边界，不要默默恢复为日常默认命令
- 正式发布流程始终回答同一个问题：tag 是从远端受保护 `main` 生成的吗

相关文件：

- `/package.json`
- `/scripts/release-prepare.mjs`
- `/scripts/release-prepare.test.ts`
- `/.github/workflows/create-release-tag.yml`
- `/docsforcodex/action-cicd-release-flow.md`

---

### 11. 本地 `ahead/behind` 不等于远端 workflow 已看到这些提交

错误现象：

- 本地 `git status --short --branch` 显示 `ahead`
- 操作者误以为只要本地 `main` 已包含目标代码，dispatch release workflow 就会使用这些本地提交
- 结果远端 workflow 实际仍运行在旧的 `origin/main`

根因：

- GitHub Actions 的 `workflow_dispatch` 运行在远端 `ref` 对应的提交上
- 本地 ahead 只是“你的分支比远端多了未推送提交”，不会自动成为远端 workflow 输入
- 如果 release wrapper 还帮你自动 push，再叠加 `main` 保护规则，就更容易把事实源和权限边界搞混

解决路径：

- `pnpm release:prepare` 改为 `--no-push` 语义，只允许在 `origin/main` 与本地 `HEAD` 一致时 dispatch
- 如果本地 ahead，先通过 PR / merge 把代码送上远端 `main`
- 把“本地 ahead 不可直接当作 release 事实”写入主文档与坑点库

验证方式：

- `scripts/release-prepare.test.ts` 覆盖了远端 tag workflow dry-run
- `scripts/github-workflow-dispatch.mjs` 新增 `--no-push` 支持，并在远端分支 SHA 不一致时直接报错
- `docsforcodex/action-cicd-release-flow.md` 与 `README.md` 已同步说明“远端 `main` 才是 release 事实源”

后续防回归建议：

- 以后凡是 `workflow_dispatch` 型正式发布入口，都先明确“是否允许本地 push 后再 dispatch”；如果目标分支受保护，默认答案应为“不允许”
- 如果用户贴出 `ahead` / `behind` 状态，优先先解释远端 SHA 和本地 HEAD 的关系，再谈 workflow 触发

相关文件：

- `/scripts/github-workflow-dispatch.mjs`
- `/scripts/github-workflow-dispatch.test.ts`
- `/scripts/release-prepare.mjs`
- `/docsforcodex/action-cicd-release-flow.md`
- `/README.md`

---

### 12. GitHub Action 第三方依赖不能假设存在宽泛主版本 tag

错误现象：

- 迁移后的 `ci.yml` 在远端首跑时，`automation-guardrails` job 直接在 `Set up job` 阶段失败
- 运行页显示 `Unable to resolve action \`rhysd/actionlint@v1\`, unable to find version \`v1\``

根因：

- workflow 使用了 `rhysd/actionlint@v1`
- 但该 action 仓库并没有提供一个可解析的 `v1` 版本标签
- 结果 job 在真正执行步骤之前就无法拉起

解决路径：

- 改为使用仓库中实际存在的已发布版本标签 `rhysd/actionlint@v1.7.3`
- 如果后续继续升级，先确认 upstream release/tag 真实存在，再更新 workflow

验证方式：

- push 修复后，`automation-guardrails` 不再停在 `Set up job`
- `ci` workflow 能继续执行 actionlint 和脚本测试

后续防回归建议：

- 新增第三方 GitHub Action 时，不要拍脑袋写主版本别名
- 先核对 upstream 仓库的真实 release/tag，再决定使用固定版本 tag 还是 commit SHA
- 对关键供应链步骤，优先使用明确存在的版本引用，避免把解析失败带到远端 CI 首跑

相关文件：

- `/.github/workflows/ci.yml`
- `/docforcodex/hole/release-cicd/release-cicd-errors-and-pitfalls.md`

---

## 当前实现上的高敏感区域

### 1. `desktop-build.yml` 的动态 matrix 是高敏感配置

当前实现为了绕开 `matrix` 上下文限制，使用了 `fromJson(...)` 构造 `include`。

这块的风险：

- YAML 字符串非常长
- JSON 嵌入 YAML 表达式，可读性差
- 很容易因为引号、花括号、路径字符串而引入语法错误

修改建议：

- 每次改这里，先做最小修改
- 改完必须重新让 GitHub Actions 校验 workflow
- 不要在没有验证的情况下同时改表达式结构和 matrix 字段内容

---

### 2. 自写 CLI 解析器必须一直覆盖 `--`

当前两个脚本都用了手写参数解析器，而不是现成库。

优点：

- 依赖少
- 行为完全可控

缺点：

- 容易漏掉 CLI 细节
- `pnpm`、`npm`、`node` 不同调用方式的 argv 差异都要自己处理

以后新增脚本时，至少要考虑：

- 裸 `--`
- `--help`
- 缺少参数值
- 未知参数

---

### 3. GitHub Actions 里 PowerShell 与本地 PowerShell 7 约定要一致

仓库要求统一使用：

- `pwsh.exe`
- `shell: pwsh`

坑点：

- 文档、脚本、workflow 不一致时，很容易有人回退到 `powershell.exe`
- UTF-8、参数解析、行为差异都会放大问题

结论：

- 文档、命令示例、workflow 全部要继续维持 `pwsh` 口径

---

### 4. GitHub Actions 的 job 隔离不能想当然

这次 `publish-release` 暴露出的关键事实是：

- 上一个 job 里装过 `pnpm`，不等于下一个 job 还能直接用
- 上一个 job 里已经 checkout 过仓库，不等于当前 job 也有脚本文件

以后排查发布链路时，凡是出现“这个命令在前面 job 明明跑过”的想法，都要先回到当前 job 自己的 steps 看：

- 有没有 `actions/checkout`
- 有没有 `actions/setup-node`
- 有没有 `corepack` / `pnpm` 激活
- 当前命令是否其实可以直接用 `node <script>` 代替

---

### 5. GitHub 仓库治理不是“代码改完就算完成”

这次迁移里一个很容易忽略的现实是：

- 仓库里的 workflow、脚本、文档都改好了
- 但如果 GitHub 仓库侧的 `main` 保护、required checks、release tag ruleset 没真正下发
- 那 CI/CD 仍然可能被直接 push、手工 tag 或错误权限路径绕开

结论：

- “代码内约束”和“GitHub 仓库侧保护规则”必须同时存在
- 最好把仓库设置也脚本化，例如 `pnpm cicd:apply-github-guardrails`
- 以后重建仓库、迁仓或新建镜像仓库时，不要靠人工回忆去点 settings

---

### 6. 能 dispatch workflow 的 token，不代表能改 branch protection / ruleset

这次真实遇到的报错是：

```text
Resource not accessible by personal access token
```

出现位置：

- `PUT /repos/<owner>/<repo>/branches/main/protection`
- `POST /repos/<owner>/<repo>/rulesets`

根因：

- 当前 token 足够做 `workflow_dispatch`
- 但没有仓库 `Administration` 权限
- 所以 CI 可以触发，仓库治理 API 却会被 GitHub 直接拒绝

修复方式：

- 给治理脚本准备一个同时带 `Administration` 和 `Actions` 权限的高权限 token
- 默认直接放到仓库专属变量，例如 `GITHUB_TOKEN_BG3CALCULATOR`
- 旧的 `GH_ADMIN_TOKEN` / `GITHUB_ADMIN_TOKEN` 只保留兼容，不再是默认推荐
- Fine-grained PAT 需要开启 Repository permissions -> `Administration: Read and write`

验证方式：

- 重新执行 `pnpm cicd:apply-github-guardrails`
- 成功结果应至少包含：
  - `Main branch protection: updated`
  - `Release tag ruleset: created` 或 `updated`

---

### 7. tag ruleset 如果不显式放行 GitHub Actions，release workflow 会反咬自己

现象：

- 你已经按主流做法给 release tag 加了保护
- 但 `create-release-tag.yml` 在 `git push origin refs/tags/<tag>` 时报权限错误

根因：

- workflow 是通过 GitHub Actions App 在推 tag
- 如果 tag ruleset 没给 `github-actions` 这个 integration 保留 bypass
- 那么自动化本身会被 tag 保护拦截

当前仓库的修复策略：

- release tag ruleset 显式保留 `github-actions` App bypass
- 当前使用的 App id 是 `15368`
- 该规则由 `pnpm cicd:apply-github-guardrails` 自动下发

验证方式：

- 检查 release tag ruleset 中是否存在：
  - actor type: `Integration`
  - actor id: `15368`
  - bypass mode: `always`
- 后续触发 `create-release-tag.yml` 时，workflow 应能成功推送新 tag

---

### 8. 个人账号仓库不能直接把 `github-actions` integration 作为 tag ruleset bypass

这次真实打到 GitHub API 的报错是：

```text
Validation Failed
Actor GitHub Actions integration must be part of the ruleset source or owner organization
```

根因：

- 当前仓库归属于个人账号，不是 GitHub 组织
- GitHub 当前不允许在这种仓库里，把 `github-actions` integration 直接配置成 tag ruleset bypass actor
- 所以“禁止新 tag 创建，但允许 GitHub Actions 创建 tag”这套最严格模型，不能直接套在当前仓库上

当前仓库的兼容处理：

- `main` 仍然严格受保护
- release tag ruleset 退到“禁止更新/删除已发布 tag”
- 新 tag 创建仍保留给 `create-release-tag.yml` 使用
- 这个兼容逻辑已经写进 `pnpm cicd:apply-github-guardrails`

后续如果要升级到最严格模型，有两条路径：

- 把仓库迁到 GitHub 组织，再给 `github-actions` integration 配 bypass
- 或者改成由专用 PAT / 自建 GitHub App 负责创建 tag，再把对应 actor 作为 bypass actor

---

### 9. Vitest 不支持 `--runInBand`

这次本地自检时的真实报错是：

```text
CACError: Unknown option `--runInBand`
```

根因：

- 当前仓库使用的是 `vitest`
- `--runInBand` 是 Jest 风格参数，不是 Vitest CLI 支持的选项

修复方式：

- 直接执行仓库标准命令：`pnpm test`
- 如果以后确实需要串行策略，先查当前 Vitest 版本支持的官方参数，不要直接套 Jest 心智

---

### 10. 单管理员个人仓库不能同时要求 PR review 又强制管理员受 branch protection 约束

这次真实打到的报错是：

```text
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote:
remote: - Changes must be made through a pull request.
remote:
remote: - 2 of 2 required status checks are expected.
```

根因：

- 当前仓库是个人账号仓库，且基本可以视作单管理员仓库
- `main` 保护里同时启用了：
  - required pull request review
  - `enforce_admins = true`
- 这样会导致管理员本人既不能直接 push，也无法靠“自己 review 自己的 PR”完成闭环，形成治理死锁

修复方式：

- `pnpm cicd:apply-github-guardrails` 现在会自动识别个人账号仓库
- 在这种仓库里保留管理员 bypass
- 继续保留 required checks、linear history、conversation resolution 等约束

适用边界：

- 团队仓库、组织仓库仍可继续使用更严格的 `enforce_admins = true`
- 个人单管理员仓库优先保证流程可持续，不要把自己锁死

---

### 11. 共享 `cicd` skill 也会漂移，不能把外部技能文案长期当成仓库 release 事实

这次真实发现的现象是：

- 外部共享技能文件 `C:/Users/G104/.agents/skills/cicd/SKILL.md` 里的 `BG3calculator_Profile`
- 仍然写着旧的 `prepare-release.yml`
- 仍然建议 `release:prepare-local` / `release:prepare-remote`
- 还保留了“本地 `main` ahead 时可以先 push 再 dispatch”的旧心智

根因：

- 仓库后来已经切到严格的远端事实源模型
- 正式 release 只允许走 `pnpm release:prepare` -> `create-release-tag.yml` -> `release-desktop.yml`
- `release:prepare` 当前固定带 `--no-push` 语义，只接受“本地 `main` 已和 `origin/main` 对齐”的状态
- 但共享 skill 没有跟着 `strict-release-governance` 和本仓库文档一起更新，导致“外部技能事实”和“仓库事实”漂移

修复方式：

- 把共享 `cicd` skill 的 `BG3calculator_Profile` 改成匹配当前仓库：
  - workflow 名称改为 `create-release-tag.yml`
  - 删除对 `release:prepare-local` / `release:prepare-remote` 的默认建议
  - 明确 `pnpm release:prepare` 只做本地校验和远端 dispatch，不会本地 `commit/push/tag`
  - 明确本地 `main` ahead 时应先修复分支状态，而不是期待 wrapper 代替你 push
  - 明确个人账号仓库的 tag ruleset 需要走兼容模式，不能假设一定能给 `github-actions` integration 配 bypass

验证方式：

- 对照 `docsforcodex/overall.md`
- 对照 `docsforcodex/action-cicd-release-flow.md`
- 对照 `docsforcodex/local-cicd-orchestration.md`
- 对照 `scripts/release-prepare.mjs`
- 对照 `.github/workflows/create-release-tag.yml`
- 对照 `scripts/github-repo-guardrails.mjs`

相关文件路径：

- `C:/Users/G104/.agents/skills/cicd/SKILL.md`
- `docsforcodex/overall.md`
- `docsforcodex/action-cicd-release-flow.md`
- `docsforcodex/local-cicd-orchestration.md`
- `scripts/release-prepare.mjs`
- `.github/workflows/create-release-tag.yml`
- `scripts/github-repo-guardrails.mjs`

---

### 12. release 准备提交推送到 feature 分支时，也可能先撞上远端分支同步差异

这次真实打到的报错是：

```text
To https://github.com/Watout/BG3calculator.git
 ! [rejected]        feature/pure-black-background -> feature/pure-black-background (fetch first)
error: failed to push some refs to 'https://github.com/Watout/BG3calculator.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally.
```

现象：

- 本地已经完成 `0.1.9` 的四个版本文件同步
- `pnpm release:preflight -- --tag 0.1.9`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 都通过
- 但把 `chore: prepare release 0.1.9` 推到 `feature/pure-black-background` 时被 GitHub 拒绝

根因：

- 远端同名 feature 分支在这之前已经新增了一个 `Merge branch 'main' into feature/pure-black-background` 提交
- 本地分支还停在旧的分叉点上，只比旧远端多一个 release 准备 commit
- 因此直接 `git push` 会命中非 fast-forward 拒绝

这次的确认方式：

- `git fetch origin feature/pure-black-background`
- `git log --oneline --decorate -5 --graph --all --branches=feature/pure-black-background`
- 结果显示：
  - 本地 HEAD 是 `chore: prepare release 0.1.9`
  - 远端分支额外存在 `Merge branch 'main' into feature/pure-black-background`

修复方式：

- 先抓取远端 feature 分支
- 再把本地新增的 release commit rebase 到远端最新 feature 分支之上
- 然后重新执行正常的 `git push`

本次实际执行：

```text
git fetch origin feature/pure-black-background
git rebase origin/feature/pure-black-background
git push
```

验证结果：

- rebase 成功
- `git push` 成功把分支推进到 `d665d12`
- 说明“版本文件和校验都没问题，但远端分支已有新提交”时，阻塞点在分支同步，不在 release 脚本本身

后续建议：

- 在 feature 分支上准备 release PR 时，推送前先 `git fetch` 看一下同名远端分支是否被别人或自动化更新过
- 如果官方 release 仍要求走 PR -> merge -> `main` -> `pnpm release:prepare`，就不要把这种 `fetch first` 误判成 tag 冲突或 workflow dispatch 失败

相关文件路径：

- `package.json`
- `apps/desktop-tauri/package.json`
- `apps/desktop-tauri/src-tauri/tauri.conf.json`
- `apps/desktop-tauri/src-tauri/Cargo.toml`
- `docforcodex/hole/release-cicd/release-cicd-errors-and-pitfalls.md`

---

### 13. `create-release-tag.yml` 用默认 `GITHUB_TOKEN` 推出的 tag，不会继续触发 `release-desktop.yml`

这次真实打到的现象是：

- 本地执行 `pnpm release:prepare -- --tag 0.1.9`
- 远端 workflow [`create-release-tag.yml`](C:/1W/codingProject/BG3calculator/.github/workflows/create-release-tag.yml) run `23082261518` 被成功 dispatch
- job 里的关键步骤都成功：
  - `Ensure release tag does not already exist remotely`
  - `Preflight release metadata`
  - `Create and push release tag from main HEAD`
- 远端 `0.1.9` tag 也确实已经存在，并指向 `7d4ef52f71d14adb28765e06db6d803ff2448b77`
- 但 [`release-desktop.yml`](C:/1W/codingProject/BG3calculator/.github/workflows/release-desktop.yml) 没有因为这次 tag push 自动出现新的 workflow run

补充细节：

- `create-release-tag` 这次的 run 最终显示 `failure`
- 失败步骤是最后的 `Summarize release handoff`
- 但真正关键的 tag 创建步骤已经成功，因此这不是“tag 没推上去”，而是“tag 推上去后没有带起下游 release workflow”

根因：

- 当前 `create-release-tag.yml` 里推 tag 用的是 workflow 默认的 `GITHUB_TOKEN`
- GitHub Actions 对默认 `GITHUB_TOKEN` 触发出来的大多数仓库事件有递归保护
- 因此“workflow 用 `GITHUB_TOKEN` 再次 `git push` 出来的 tag push”不会继续触发另一个以 `push.tags` 为入口的 workflow
- 当前仓库的正式发布链路是：
  - `create-release-tag.yml`
  - `release-desktop.yml`
- 所以下游 `release-desktop` 被静默拦住了

这次的验证方式：

- `git ls-remote --tags origin refs/tags/0.1.9`
- GitHub Actions run:
  - `create-release-tag / 0.1.9`: `https://github.com/Watout/BG3calculator/actions/runs/23082261518`
- 对照仓库级 push workflow runs，确认没有新的 `release-desktop` / `0.1.9`

这次的临时修复方式：

- 明确授权后，删除远端 `0.1.9` tag
- 使用仓库专属 PAT 从本地重新 push 同名 tag
- 让真正的 PAT 身份产生 tag push，从而触发 `release-desktop.yml`

后续防回归建议：

- 不要再默认假设“workflow 推出的 tag push 一定会继续触发下游 workflow”
- 如果正式链路坚持保留 `create-release-tag.yml -> release-desktop.yml` 两段式设计，需要改成以下任一种稳态方案：
  - 用 PAT / GitHub App 推 tag，而不是默认 `GITHUB_TOKEN`
  - 改成 `repository_dispatch` / `workflow_dispatch` 直接触发 `release-desktop`
  - 或把发布逻辑收口进同一个 workflow，避免依赖二次 `push` 触发
- 在 release 文档里明确记录这个平台行为，不要继续把“tag 创建成功”误写成“release-desktop 一定已启动”

相关文件路径：

- `.github/workflows/create-release-tag.yml`
- `.github/workflows/release-desktop.yml`
- `scripts/release-prepare.mjs`
- `docforcodex/hole/release-cicd/release-cicd-errors-and-pitfalls.md`

---

## 建议保留的测试护栏

下面这些测试已经证明有价值，不要删：

- `release-preflight` 对无 `v` tag 的合法性校验
- `release-preflight` 对裸 `--` 的兼容测试
- `release-preflight` 对版本漂移的失败测试
- `release-sync-version` 对四个版本文件同步更新的测试
- `release-collect-assets` 对裸 `--` 的兼容测试
- `release-collect-assets` 对缺失关键资产组的失败测试
- `release-collect-assets` 对 GitHub output 格式的测试
- `release-publish` 对 release upsert、同名 asset 覆盖与 token 缺失的测试

原因：

- 这次真实出错的两个问题，都是“本地肉眼看起来没问题，但在 CI 环境里会炸”的类型
- 只有测试护栏足够明确，后续改动时才不容易再次回归

---

## 推荐排查顺序

如果后面 release 又炸了，建议按这个顺序查：

1. 先看 workflow 是“解析失败”还是“运行失败”
2. 如果是解析失败，先查 YAML 表达式、`matrix`、`${{ }}` 上下文
3. 如果是运行失败，先看 `release-preflight` 是否把 tag 或版本拦下了
4. 如果 preflight 通过，再看 `release-collect-assets` / `release-publish` 是否缺关键产物或上传失败
5. 再看是否仍有 Node runtime 弃用告警指向旧版 JavaScript action
6. 最后再看 Tauri 构建本身是否产出了预期 bundle

---

## 当前结论

这次已确认并修复或加固的真实坑点有十三个：

1. GitHub Actions job 级 `if` 不能直接引用 `matrix.*`
2. 通过 `pnpm ... -- ...` 调脚本时，CLI 解析必须显式忽略裸 `--`
3. tag 已推送不代表 release 一定会生成；四个版本文件若未先同步到目标 tag，workflow 会在 preflight 提前失败
4. `publish-release` 是独立 job，不能直接假设前一个 job 准备好的 `pnpm` / checkout 仍然存在
5. GitHub Actions 的 Node runtime 弃用告警要看 action metadata；必要时要用仓库内脚本或 CLI/REST API 替换旧 JavaScript action
6. 能 dispatch workflow 的 token，不代表有 GitHub 仓库治理 API 所需的 Administration 权限
7. release tag ruleset 必须显式放行 GitHub Actions integration，否则自动打 tag 会被自己配置的保护规则拦下
8. 个人账号仓库当前不能直接把 `github-actions` integration 作为 tag ruleset bypass actor，需要退到兼容模式或更换仓库/凭据模型
9. `vitest` 不支持 `--runInBand`，不能直接套用 Jest 的命令参数
10. 单管理员个人仓库如果同时要求 PR review 且强制管理员受保护，会把自己锁死
11. 共享 `cicd` skill 如果不跟着仓库 release 治理同步更新，也会把 agent 引回已经废弃的发版路径
12. release 准备提交即使本地校验全绿，也可能因为远端同名 feature 分支已前进而先卡在 `git push (fetch first)`
13. `create-release-tag.yml` 用默认 `GITHUB_TOKEN` 推出的 tag，不会继续触发 `release-desktop.yml`

这几个问题都已经在代码、脚本和测试中补了护栏，后续如果再次出现同类问题，优先先看本文件。
