# Design: Stabilize Desktop Release CI/CD

## Decisions

- Keep the existing `verify -> build -> publish` workflow shape and tighten it with explicit preflight and asset collection scripts.
- Continue using GitHub tag pushes as the release trigger, but switch the contract to semantic versions without a leading `v`.
- Validate the release tag against all version declarations before any build starts.
- Keep prerelease detection tag-driven by SemVer prerelease identifiers such as `0.1.2-beta.1`.
- Move asset selection logic out of inline workflow shell into a Node script with unit tests.
- Continue publishing unsigned desktop bundles only; do not add Tauri updater, signing, or notarization in this change.

## Release Flow

1. A tag matching `*.*.*` is pushed.
2. `release-preflight` validates the tag format and checks `package.json`, `apps/desktop-tauri/package.json`, `apps/desktop-tauri/src-tauri/tauri.conf.json`, and `apps/desktop-tauri/src-tauri/Cargo.toml`.
3. The workflow runs the existing workspace verification commands.
4. Windows and macOS desktop bundles are built in parallel.
5. The publish job downloads the build artifacts.
6. `release-collect-assets` verifies required Windows/macOS bundle outputs and emits the newline-delimited file list for `softprops/action-gh-release`.
7. The GitHub Release for the tag is created or updated with the collected assets.

## Non-Goals

- Do not automate version bumping or tag creation.
- Do not support both `v0.1.2` and `0.1.2`; the contract is no-leading-`v` only.
- Do not add runtime updater configuration, signed update artifacts, or release notes customization beyond GitHub's generated notes.
