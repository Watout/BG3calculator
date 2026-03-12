# Release CI/CD 错误与坑点落库

## 目标

本文件用于记录这次在桌面端 Release CI/CD 收敛过程中，真实出现过的错误、根因、修复方式，以及后续需要特别注意的坑点。

适用范围：

- `/.github/workflows/desktop-build.yml`
- `/.github/workflows/release-desktop.yml`
- `/scripts/release-preflight.mjs`
- `/scripts/release-collect-assets.mjs`

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

## 建议保留的测试护栏

下面这些测试已经证明有价值，不要删：

- `release-preflight` 对无 `v` tag 的合法性校验
- `release-preflight` 对裸 `--` 的兼容测试
- `release-preflight` 对版本漂移的失败测试
- `release-sync-version` 对四个版本文件同步更新的测试
- `release-collect-assets` 对裸 `--` 的兼容测试
- `release-collect-assets` 对缺失关键资产组的失败测试
- `release-collect-assets` 对 GitHub output 格式的测试

原因：

- 这次真实出错的两个问题，都是“本地肉眼看起来没问题，但在 CI 环境里会炸”的类型
- 只有测试护栏足够明确，后续改动时才不容易再次回归

---

## 推荐排查顺序

如果后面 release 又炸了，建议按这个顺序查：

1. 先看 workflow 是“解析失败”还是“运行失败”
2. 如果是解析失败，先查 YAML 表达式、`matrix`、`${{ }}` 上下文
3. 如果是运行失败，先看 `release-preflight` 是否把 tag 或版本拦下了
4. 如果 preflight 通过，再看 `release-collect-assets` 是否缺关键产物
5. 最后再看 Tauri 构建本身是否产出了预期 bundle

---

## 当前结论

这次已确认并修复或加固的真实坑点有三个：

1. GitHub Actions job 级 `if` 不能直接引用 `matrix.*`
2. 通过 `pnpm ... -- ...` 调脚本时，CLI 解析必须显式忽略裸 `--`
3. tag 已推送不代表 release 一定会生成；四个版本文件若未先同步到目标 tag，workflow 会在 preflight 提前失败

这几个问题都已经在代码、脚本和测试中补了护栏，后续如果再次出现同类问题，优先先看本文件。
