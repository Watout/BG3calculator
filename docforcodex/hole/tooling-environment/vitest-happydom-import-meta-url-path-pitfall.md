# Vitest happy-dom 下 `import.meta.url` 读本地文件的路径陷阱

## 错误现象

在 2026-03-14 这次“桌面端全局背景改为纯黑”的回归测试里，给 `apps/desktop-tauri/src/App.test.tsx` 新增源码级断言后，首次执行 `pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 test"` 时，只有新增的背景测试失败，其余 136 个测试都通过。

## 报错原文

```text
TypeError: The URL must be of scheme file
```

以及：

```text
FAIL  apps/desktop-tauri/src/App.test.tsx > App attack entry controls > keeps the boot splash and runtime background pure black
```

## 根因

- 测试最初使用了下面这种读文件方式：

```ts
readFileSync(new URL("./App.css", import.meta.url), "utf8");
```

- 在当前仓库的 Vitest + happy-dom 执行环境里，`import.meta.url` 并不保证是 `file:` 协议的本地文件 URL。
- `node:fs` 的 `readFileSync` 在接收到非 `file:` 协议的 `URL` 对象时会直接抛 `TypeError: The URL must be of scheme file`。
- 这属于测试运行时路径解析方式与 Node 文件系统 API 的适配问题，不是业务代码或样式逻辑问题。

## 解决路径

- 不再依赖 `new URL(..., import.meta.url)` 读取仓库内静态文件。
- 改为使用 `process.cwd()` + `node:path/join` 构造仓库根路径下的绝对文件路径：

```ts
readFileSync(join(process.cwd(), "apps/desktop-tauri/src/App.css"), "utf8");
readFileSync(join(process.cwd(), "apps/desktop-tauri/index.html"), "utf8");
```

- 这样可以稳定读取源码文件，同时不依赖 Vitest 对 `import.meta.url` 的具体注入形式。

## 验证结果

- 修复后重新执行：

```powershell
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 test"
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 typecheck"
pwsh.exe -NoProfile -Command "& corepack.cmd pnpm@10.32.1 lint"
```

- 结果：
  - `test` 通过，16 个测试文件、137 个测试全部通过
  - `typecheck` 通过
  - `lint` 通过

## 防回归建议

- 在该仓库的 Vitest 用例里，如果只是读取仓库中的源码文件做静态断言，优先使用 `process.cwd()` + `join(...)`。
- 只有在明确确认 `import.meta.url` 为本地文件协议时，才使用 `new URL(..., import.meta.url)` 传给 `node:fs`。
- 遇到类似错误时，先判断是测试宿主路径协议问题，还是业务模块真正读不到文件，不要误判为样式或组件回归。

## 相关文件路径

- `/apps/desktop-tauri/src/App.test.tsx`
- `/apps/desktop-tauri/src/App.css`
- `/apps/desktop-tauri/index.html`
- `/docforcodex/hole/tooling-environment/package-json-write-race-during-node-tests.md`
