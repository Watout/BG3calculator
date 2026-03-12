# Design: Remote macOS Build Flow

## Decisions

- Keep native macOS build scripts unchanged for real macOS hosts and CI runners.
- Add a separate remote orchestration script instead of overloading `tauri:build:macos:universal`.
- Use Node 24 native `fetch` against the GitHub REST API instead of requiring `gh`.
- Require a clean working tree and a pushed branch so the remote build always matches local HEAD.
- Filter the existing workflow matrix by a new `target` dispatch input so remote macOS requests do not also build Windows.
- Carry a `request_id` workflow input for traceability in the Actions UI.
- Extract the downloaded artifact locally with `pwsh.exe` on Windows.

## Flow

1. Resolve the repository slug from `BG3DC_GITHUB_REPOSITORY`, `GITHUB_REPOSITORY`, or `origin`.
2. Read `GH_TOKEN` or `GITHUB_TOKEN`.
3. Validate current branch, clean working tree, and pushed remote HEAD.
4. Dispatch `.github/workflows/desktop-build.yml` with `target=macos-universal`.
5. Poll workflow runs until the matching `workflow_dispatch` run appears for the local HEAD SHA.
6. Poll the run until it completes successfully.
7. Poll run artifacts until `bg3calculator-macos-universal` is available.
8. Download and extract the artifact into `.artifacts/macos-universal/<request_id>/`.

## Non-Goals

- Do not implement Windows-native cross compilation for macOS bundles.
- Do not add Apple signing, notarization, or keychain automation in this change.
- Do not modify the Tauri app runtime or bundle metadata unless the remote build flow requires it.
