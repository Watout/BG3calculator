# MCP 检索鉴权与 PowerShell 搜索命令陷阱

## 错误现象

在 2026-03-13 这次桌面端数值下拉改造里，前置上下文抓取先后遇到两个环境坑：

1. `ace-tool search_context` 无法返回本地代码语义检索结果，直接报鉴权失败。
2. `pwsh.exe -NoProfile -Command "rg -n \"a|b|c\" ..."` 这类带管道符、反斜杠或 `$PWD.Path` 插值的命令，容易在 PowerShell 里被二次解析，导致查询语句被拆坏，甚至在命令结束后额外抛出 WinGet 的 `PipelineStoppedException`。

## 报错原文

### 1. `ace-tool search_context`

```text
Error: Search failed: 401 Unauthorized - Invalid token
```

### 2. `pwsh.exe` + `rg` / 路径插值

```text
The term 'crit' is not recognized as a name of a cmdlet, function, script file, or executable program.
```

```text
The term 'C:\1W\codingProject\BG3calculator.Path.Length' is not recognized as a name of a cmdlet, function, script file, or executable program.
```

```text
Unhandled exception. System.Management.Automation.PipelineStoppedException: The pipeline has been stopped.
```

## 根因

### 1. `ace-tool search_context`

- 当前会话里 `ace-tool` MCP 没有可用鉴权 token，导致语义检索入口不可用。
- 结果是“工具存在”不等于“当前环境可直接调用”。

### 2. `pwsh.exe` + `rg`

- PowerShell 会优先解释 `|`、`$PWD.Path`、转义引号等语法。
- 当 `rg` 正则或路径拼接直接塞进 `-Command "..."` 时，PowerShell 可能先把表达式拆成自己的 pipeline / 变量访问，再把残缺参数交给 `rg`。
- 当前 Windows 环境里还会在命令退出阶段触发 WinGet 的 command-not-found 反馈逻辑；当 pipeline 提前结束时，偶发会附带一段 `PipelineStoppedException`，干扰日志判断。

## 解决路径

### 1. `ace-tool search_context`

- 发现 `401 Unauthorized - Invalid token` 后，立刻切回 `rg`、源码直读和 explorer subagent，不阻塞主任务。
- 需要恢复语义检索时，再补 MCP token 或重新初始化该工具的认证。

### 2. `pwsh.exe` + `rg`

- 避免把复杂正则直接塞进 `pwsh.exe -Command "..."`。
- 优先拆成多条简单查询，例如分别搜 `criticalThreshold`、`mainHand`、`offHand`、`executionCount`。
- 需要路径长度或字符串插值时，优先使用显式变量或更简单的 PowerShell 写法，不直接拼 `$PWD.Path.Length` 一类表达式。
- 看到结尾附带的 `PipelineStoppedException` 时，先判断前面的实际查询结果是否已经成功输出，不要把它误判成业务代码错误。

## 验证方式

- `ace-tool` 恢复后，再次执行语义检索时不应出现 `401 Unauthorized - Invalid token`。
- 对同类搜索命令，改用“单关键词、多次查询”的 `pwsh.exe -NoProfile -Command "rg -n keyword path"` 形式后，查询应能稳定输出结果，不再把正则片段解释成 PowerShell 命令。
- 即使 PowerShell 末尾仍偶发输出 WinGet 反馈异常，也应确认前面的检索正文已经完整可用。

## 防回归建议

- 把 `ace-tool` 当成“可选增强工具”而不是唯一入口；脚本和协作流程里保留 `rg` 兜底路径。
- 在 Windows + `pwsh.exe` 下，默认避免使用带 `|` 的复杂 `rg` 正则和依赖 PowerShell 插值的长命令。
- 需要批量搜索时，优先多次短命令并行，而不是一条超级正则。

## 相关文件路径

- `/AGENTS.md`
- `/docforcodex/hole/tooling-environment/openspec-cli-not-found.md`
- `/docsforcodex/compact-numeric-controls.md`
