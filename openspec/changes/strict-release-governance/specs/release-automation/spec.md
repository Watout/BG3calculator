# release-automation

## ADDED Requirements

### Requirement: Formal releases must create tags from protected remote main

The repository MUST treat the remote `main` branch as the only formal release source of truth, and formal release tags MUST be created by remote automation from that branch.

#### Scenario: Release tag creation succeeds from main

- **GIVEN** the target release version has already been merged into remote `main`
- **AND** the four release version files already match the requested tag
- **AND** the requested tag does not already exist remotely
- **WHEN** the operator triggers the release-tag workflow
- **THEN** the workflow validates release metadata on remote `main`
- **AND** it creates and pushes a brand new tag from that remote `main` commit
- **AND** it does not commit, modify, or push `main`

#### Scenario: Version drift blocks remote tag creation

- **GIVEN** the requested tag is `0.1.8`
- **AND** one or more release version files in `main` still declare a different version
- **WHEN** the release-tag workflow runs
- **THEN** `release:preflight` fails
- **AND** no new tag is created

### Requirement: Repository guardrails must be reproducible from code

The repository MUST provide an automated way to apply the GitHub-side branch and tag protections that enforce the release contract.

#### Scenario: Guardrails script applies branch protection and tag rules

- **GIVEN** an operator has a GitHub token with repository Administration write permission
- **WHEN** the operator runs `pnpm cicd:apply-github-guardrails`
- **THEN** `main` branch protection is updated to require the repository CI checks
- **AND** the release tag ruleset is created or updated
- **AND** the release tag ruleset preserves a bypass for the `github-actions` integration so release automation can still push new tags

### Requirement: Local release entrypoints must not perform formal manual releases

The repository MUST NOT expose a local formal release command that commits, pushes `main`, creates a release tag, or falls back to a local manual publish path.

#### Scenario: Local release wrapper dispatches remote automation only

- **GIVEN** the operator runs `pnpm release:prepare -- --tag 0.1.8`
- **AND** local `main` is checked out
- **AND** the working tree is clean
- **AND** `origin/main` already matches local `HEAD`
- **WHEN** the command runs successfully
- **THEN** it dispatches the remote release-tag workflow
- **AND** it does not create a local tag
- **AND** it does not push `main`

#### Scenario: Local branch is ahead of origin/main

- **GIVEN** the operator runs `pnpm release:prepare -- --tag 0.1.8`
- **AND** local `HEAD` does not match `origin/main`
- **WHEN** the command validates local and remote state
- **THEN** it fails before dispatching
- **AND** it tells the operator to synchronize remote `main` first
