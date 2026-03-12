# Tasks

- [x] Add a local `pnpm tauri:build:macos:remote` entrypoint that dispatches the macOS GitHub Actions workflow.
- [x] Add workflow dispatch inputs so the remote entrypoint can target `macos-universal` without running the Windows matrix entry.
- [x] Download and extract the macOS artifact to a predictable local `.artifacts/` directory.
- [x] Add automated tests for dispatch payload creation, workflow-run matching, artifact selection, and timeout/failure behavior.
- [x] Update README, openspec, and `docsforcodex` to document the remote macOS build flow and its unsigned-package limitation.
