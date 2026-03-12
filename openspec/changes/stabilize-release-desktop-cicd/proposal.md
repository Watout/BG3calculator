# Proposal: Stabilize Desktop Release CI/CD

## Summary

Stabilize the desktop release workflow so pushing a semantic version tag without a leading `v` reliably validates version metadata, builds Windows/macOS artifacts, and updates the matching GitHub Release assets.

## Why

The repository already has a desktop release workflow, but the trigger pattern and documentation still assume `v*.*.*` tags while the actual repository history uses `0.1.0` and `0.1.1`. The workflow also publishes artifacts without checking that the tag matches the versions declared in the workspace, desktop package, Tauri config, and Cargo manifest.

## Outcome

- Desktop releases are triggered by tags like `0.1.2` and `0.1.2-beta.1`.
- A release preflight step fails fast when tag and manifest versions drift.
- Release assets are collected through a tested script and uploaded back onto the matching GitHub Release.
- README, `docsforcodex`, and openspec describe the same release contract.
