# Proposal: Generalize Local CI/CD Orchestration

## Summary

Add a reusable local CI/CD orchestration layer so repository automation no longer depends on ad-hoc manual command sequences or the presence of `gh` for workflow dispatch.

## Why

The repository already has safe release workflows, but the local operating path is still split across:

- agent skill instructions
- manual shell command sequences
- a GitHub CLI-only workflow dispatch example

That works for BG3calculator today, but it does not scale into a reusable local CI/CD pattern for future automation tasks or other repositories.

## Outcome

- The repository exposes a first-class local release orchestration command.
- The repository exposes a generic workflow dispatch script that uses GitHub REST API instead of requiring `gh`.
- `docsforcodex` and the local `cicd` skill describe a reusable “discover triggers -> validate -> commit -> push/tag or dispatch” pattern.
