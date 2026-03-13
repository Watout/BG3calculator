# MCP 检索鉴权与 PowerShell 搜索命令陷阱

## 错误现象

在 2026-03-13 这次桌面端数值下拉改造里，前置上下文抓取先后遇到两个环境坑：

1. `ace-tool search_context` 无法返回本地代码语义检索结果，直接报鉴权失败。
2. `pwsh.exe -NoProfile -Command "rg -n \"a|b|c\" ..."` 这类带管道符、反斜杠或 `$PWD.Path` 插值的命令，容易在 PowerShell 里被二次解析，导致查询语句被拆坏，甚至在命令结束后额外抛出 WinGet 的 `PipelineStoppedException`。
3. `pwsh.exe -NoProfile -Command "$path='...'; $start=...; ..."` 这类包含多个 `$` 变量和格式化表达式的短脚本，在 Codex 工具的 JSON + PowerShell 双重转义下也容易被截断，表现成 `ParserError`。

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

```text
An error has occurred that was not properly handled. Additional information is shown below. The PowerShell process will exit.
Unhandled exception. System.Management.Automation.PipelineStoppedException: The pipeline has been stopped.
...
at Microsoft.WinGet.CommandNotFound.WinGetCommandNotFoundFeedbackPredictor.WarmUp()
```

```text
ParserError:
Missing expression after unary operator ','.
```

```text
ParserError:
Missing variable name after foreach. The correct form is: foreach ($a in $b) {...}
```

```text
rg: regex parse error:
error: unrecognized escape sequence
```

## 根因

### 1. `ace-tool search_context`

- 当前会话里 `ace-tool` MCP 没有可用鉴权 token，导致语义检索入口不可用。
- 结果是“工具存在”不等于“当前环境可直接调用”。

### 2. `pwsh.exe` + `rg`

- PowerShell 会优先解释 `|`、`$PWD.Path`、转义引号等语法。
- 当 `rg` 正则或路径拼接直接塞进 `-Command "..."` 时，PowerShell 可能先把表达式拆成自己的 pipeline / 变量访问，再把残缺参数交给 `rg`。
- 当前 Windows 环境里还会在命令退出阶段触发 WinGet 的 command-not-found 反馈逻辑；当 pipeline 提前结束时，偶发会附带一段 `PipelineStoppedException`，干扰日志判断。
- 即使绕过了 PowerShell 本身的语法解析，`rg` 查询如果包含被错误转义的 `\"`、`\|` 片段，也可能直接在 ripgrep 层报 `regex parse error: unrecognized escape sequence`。

### 3. `pwsh.exe -NoProfile -Command` + 多个 `$` 局部变量脚本

- 当命令字符串还要再经过 Codex 工具参数序列化时，`$path`、`$start`、`$i`、`foreach ($path in $files)` 这类变量脚本更容易因为引号或插值层级不一致而被截断。
- 一旦变量名、格式化参数或 `foreach` 头部丢失，PowerShell 会把残缺片段解释成空表达式，直接抛 `Missing expression after unary operator ','` 或 `Missing variable name after foreach`。

### 3. `pwsh.exe -NoProfile -Command "Get-Content ... -Raw"` 等简单命令

- 这次在 Codex 终端工具里又确认了一个更容易误判的变体：
  - 命令正文已经成功输出
  - 但 PowerShell 进程退出阶段，WinGet 的 `CommandNotFoundFeedbackPredictor` 仍可能异步抛出 `PipelineStoppedException`
  - 最终表现成“有正常输出，但进程退出码是 `-532462766`”
- 这不是仓库脚本逻辑报错，也不代表读取文件或 `git status` 真正失败，而是当前终端宿主 + WinGet 反馈逻辑的噪音问题。

## 解决路径

### 1. `ace-tool search_context`

- 发现 `401 Unauthorized - Invalid token` 后，立刻切回 `rg`、源码直读和 explorer subagent，不阻塞主任务。
- 需要恢复语义检索时，再补 MCP token 或重新初始化该工具的认证。

### 2. `pwsh.exe` + `rg`

- 避免把复杂正则直接塞进 `pwsh.exe -Command "..."`。
- 优先拆成多条简单查询，例如分别搜 `criticalThreshold`、`mainHand`、`offHand`、`executionCount`。
- 如果只是想同时匹配多个字面量，优先改成多次 `rg -n keyword path`，不要在 `pwsh.exe` 里硬塞带引号和反斜杠的组合正则。
- 需要路径长度或字符串插值时，优先使用显式变量或更简单的 PowerShell 写法，不直接拼 `$PWD.Path.Length` 一类表达式。
- 看到结尾附带的 `PipelineStoppedException` 时，先判断前面的实际查询结果是否已经成功输出，不要把它误判成业务代码错误。
- 需要读特定代码片段时，优先用 `rg -n -C <context>`、`Get-Content ... | Select-Object -Skip <n> -First <m>` 这类不依赖多个 `$` 变量的短命令，而不是把一整段 PowerShell 小脚本塞进 `-Command`。

### 3. `pwsh.exe` 收尾阶段的 WinGet 噪音

- 对 `Get-Content -Raw`、`git status --short --branch`、`git show --oneline` 这类简单命令，如果正文已经输出完整，优先按“命令成功、宿主收尾噪音”处理。
- 不要仅凭最后的 `Process exited with code -532462766` 就判定脚本失败；要结合正文输出、文件状态和后续验证结果一起判断。
- 在自动化场景里，如果需要稳定判定结果，优先让命令本身输出可验证正文，再用业务语义确认，而不是只看 PowerShell 退出码。

## 验证方式

- `ace-tool` 恢复后，再次执行语义检索时不应出现 `401 Unauthorized - Invalid token`。
- 对同类搜索命令，改用“单关键词、多次查询”的 `pwsh.exe -NoProfile -Command "rg -n keyword path"` 形式后，查询应能稳定输出结果，不再把正则片段解释成 PowerShell 命令。
- 即使 PowerShell 末尾仍偶发输出 WinGet 反馈异常，也应确认前面的检索正文已经完整可用。
- 把“多变量短脚本”改成更短的单用途命令后，不应再出现 `Missing expression after unary operator ','` 或 `Missing variable name after foreach` 这类解析错误。
- 对 `Get-Content`、`git status` 一类简单命令，如果能稳定拿到完整正文，并且后续实际状态与正文一致，就可以确认这是“命令成功 + 收尾噪音”而不是业务失败。

## 防回归建议

- 把 `ace-tool` 当成“可选增强工具”而不是唯一入口；脚本和协作流程里保留 `rg` 兜底路径。
- 在 Windows + `pwsh.exe` 下，默认避免使用带 `|` 的复杂 `rg` 正则和依赖 PowerShell 插值的长命令。
- 需要批量搜索时，优先多次短命令并行，而不是一条超级正则。
- 需要带行号读取局部片段时，优先让外层工具负责拆分任务，不要把复杂循环、计数器和格式化逻辑全部塞进一次 `pwsh.exe -Command`。
- 对 PowerShell 工具调用结果，优先看“正文是否可用 + 后续是否能复现”，不要只看进程末尾的 WinGet 反馈异常。

## 相关文件路径

- `/AGENTS.md`
- `/docforcodex/hole/tooling-environment/openspec-cli-not-found.md`
- `/docsforcodex/compact-numeric-controls.md`
