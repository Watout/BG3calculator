# Proposal: Add Remote macOS Build Flow For Windows Developers

## Summary

Add a Windows-friendly remote build entrypoint that dispatches the existing GitHub Actions macOS workflow, waits for completion, and downloads the macOS bundle artifact back to the local machine.

## Why

The repository already supports macOS bundles on `macos-latest`, but Windows developers still have to trigger Actions manually and download artifacts by hand. That gap makes the macOS packaging path incomplete for day-to-day local use.

## Outcome

- Windows developers can run one local command to request a macOS universal build.
- The command fails fast when the branch is dirty or not pushed.
- The command downloads the `bg3calculator-macos-universal` artifact into a predictable local directory.
- README, openspec, and Codex-facing project notes all describe the same workflow.
