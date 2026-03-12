# OpenSpec CLI 缺失问题

## 错误现象

在仓库根目录尝试执行 `openspec status --json` 时，当前 Windows 本地环境直接报命令不存在，无法使用 CLI 查询 change / task 状态。

## 报错原文

```text
openspec: The term 'openspec' is not recognized as a name of a cmdlet, function, script file, or executable program.
Check the spelling of the name, or if a path was included, verify that the path is correct and try again.
```

## 根因

- 仓库中已经存在 `openspec/` 目录和相关变更文档
- 但当前本地环境没有安装或没有暴露 `openspec` 可执行命令
- 结果是“文档资产在仓库内存在”与“CLI 可直接调用”之间出现断层

## 解决路径

- 若只是查阅规格和变更记录，直接阅读仓库内的 `openspec/` 目录即可
- 若需要使用 `openspec status`、`openspec instructions apply` 这类命令，先在本地安装并配置 OpenSpec CLI，再重新执行
- 在未补齐 CLI 之前，不要假设任何自动化代理都能直接调用 `openspec`

## 验证方式

- 重新执行 `pwsh.exe -NoProfile -Command "openspec status --json"`，确认命令可被识别
- 能成功列出当前 change / task 状态，而不是报 `The term 'openspec' is not recognized`

## 防回归建议

- 在项目 onboarding 文档或本地环境初始化步骤里，明确区分“仓库里有 `openspec/` 文档”与“本机已安装 OpenSpec CLI”
- 如果某条工作流或协作约定强依赖 OpenSpec CLI，先在文档里写清安装入口，避免执行时才发现缺命令

## 相关文件路径

- `/openspec/`
- `/AGENTS.md`
- `/docforcodex/hole/README.md`
