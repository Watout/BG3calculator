# release-automation

## ADDED Requirements

### Requirement: Local release orchestration must hand off to remote release automation

The repository MUST provide a local release orchestration command that validates local/remote state and dispatches the remote release-tag workflow through the GitHub REST API. It MUST NOT perform a formal local manual release.

#### Scenario: Local release preparation dispatches remote automation

- **GIVEN** the local branch is `main`
- **AND** the working tree is clean
- **AND** `origin/main` already matches local `HEAD`
- **AND** the requested release tag is a new valid semantic version
- **WHEN** the local release orchestration command runs
- **THEN** it dispatches the remote release-tag workflow
- **AND** it does not create a local tag
- **AND** it does not push `main`

#### Scenario: Local release preparation refuses remote drift

- **GIVEN** the requested release tag is valid
- **AND** local `HEAD` does not match `origin/main`
- **WHEN** the local release orchestration command runs
- **THEN** it fails before dispatching
- **AND** it tells the operator to synchronize remote `main` first

### Requirement: Local workflow dispatch must not depend on GitHub CLI

The repository MUST provide a local workflow dispatch entrypoint that can trigger GitHub Actions through the GitHub REST API when a workflow uses `workflow_dispatch`.

#### Scenario: Dispatching a workflow from local tooling

- **GIVEN** a workflow file that supports `workflow_dispatch`
- **AND** a GitHub token is available locally
- **WHEN** the local dispatch command runs with workflow, ref, and inputs
- **THEN** it dispatches the workflow through the GitHub REST API
- **AND** it can optionally wait for the matching run and report its URL

#### Scenario: Missing local token

- **GIVEN** no `GH_TOKEN` or `GITHUB_TOKEN` is present
- **WHEN** the local dispatch command runs
- **THEN** it fails with a clear token requirement message

#### Scenario: Repository-scoped local token is available

- **GIVEN** no global `GH_TOKEN` or `GITHUB_TOKEN` is present
- **AND** a repository-scoped token environment variable for the current repository is present locally
- **WHEN** the local dispatch or release orchestration command runs
- **THEN** it treats that repository-scoped token as valid local authentication
- **AND** it does not require the operator to reuse one global token across unrelated repositories
