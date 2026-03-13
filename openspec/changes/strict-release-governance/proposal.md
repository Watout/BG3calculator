# Proposal: Strict Release Governance

## Summary

Move the repository onto a single release path: release metadata is prepared in a PR, the protected remote `main` branch remains the only release source of truth, and GitHub Actions creates the release tag before `release-desktop` publishes artifacts.

## Why

The repository already had workable local/remote release tooling, but it still exposed two conflicting ideas of truth:

- local manual release could `commit/push/tag`
- remote workflows could also create tags and publish releases

That split makes branch protection, auditability, and release provenance harder to reason about.

## Outcome

- Local manual release fallback is removed.
- `pnpm release:prepare` becomes a remote-only wrapper around `create-release-tag.yml`.
- `pnpm cicd:apply-github-guardrails` becomes the bootstrap path for applying `main` protection and release tag rules to the GitHub repository.
- The release-tag workflow validates remote `main` and creates a brand new tag without mutating `main`.
- `release-desktop` and `desktop-build` share one reusable desktop build matrix workflow.
- Docs and pitfall logs describe `origin/main` as the only release source of truth.
