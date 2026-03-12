# package.json 写入与 Node 测试并行导致的瞬时配置损坏

## 错误现象

在同一时间并行执行版本同步脚本和 `pnpm test` 时，Vitest 子进程偶发报错，提示当前仓库的 `package.json` 无效。

## 报错原文

```text
Error: Invalid package config \\?\C:\1W\codingProject\BG3calculator\package.json.
code: 'ERR_INVALID_PACKAGE_CONFIG'
```

以及：

```text
Vitest caught 1 unhandled error during the test run.
Error: [vitest-pool]: Worker forks emitted error.
```

## 根因

- `pnpm release:sync-version -- --tag <tag>` 会重写根目录 `package.json`
- 如果同时并行启动新的 Node / Vitest worker，它可能正好在文件写入尚未完成时读取 `package.json`
- 于是会把一个瞬时半成品文件当成 package config 读取，抛出 `ERR_INVALID_PACKAGE_CONFIG`

## 解决路径

- 不要把会改写 `package.json` 的脚本和 Node 测试并行执行
- 先完成版本同步，再串行运行 `release:preflight`、`lint`、`typecheck`、`test`
- 如果已经遇到该错误，确认 `package.json` 实际内容完整后，重新串行执行测试即可

## 验证方式

- 先运行 `pnpm release:sync-version -- --tag <tag>`
- 再单独运行 `pnpm test`
- 不再出现 `ERR_INVALID_PACKAGE_CONFIG` 或 Vitest worker 异常退出

## 防回归建议

- 涉及 `package.json` 改写的操作，不要和任何新的 Node 进程启动动作并行化
- 在自动化代理里，版本同步与测试校验应明确分成两个串行阶段

## 相关文件路径

- `/package.json`
- `/scripts/release-sync-version.mjs`
- `/docforcodex/hole/tooling-environment/openspec-cli-not-found.md`
