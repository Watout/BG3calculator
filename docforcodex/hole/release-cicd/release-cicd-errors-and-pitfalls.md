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

这次已确认并修复或加固的真实坑点有五个：

1. GitHub Actions job 级 `if` 不能直接引用 `matrix.*`
2. 通过 `pnpm ... -- ...` 调脚本时，CLI 解析必须显式忽略裸 `--`
3. tag 已推送不代表 release 一定会生成；四个版本文件若未先同步到目标 tag，workflow 会在 preflight 提前失败
4. `publish-release` 是独立 job，不能直接假设前一个 job 准备好的 `pnpm` / checkout 仍然存在
5. GitHub Actions 的 Node runtime 弃用告警要看 action metadata；必要时要用仓库内脚本或 CLI/REST API 替换旧 JavaScript action

这几个问题都已经在代码、脚本和测试中补了护栏，后续如果再次出现同类问题，优先先看本文件。
