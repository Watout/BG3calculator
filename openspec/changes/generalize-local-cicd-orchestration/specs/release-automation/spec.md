# release-automation

## ADDED Requirements

### Requirement: Local release orchestration must encode the repository-safe publish sequence

The repository MUST provide a local release orchestration command that validates release metadata, runs workspace verification, commits required version-file changes, pushes the release branch, and pushes a brand new tag.

#### Scenario: Local release preparation succeeds

- **GIVEN** the working tree is clean
- **AND** the requested release tag is a new valid semantic version
- **WHEN** the local release orchestration command runs
- **THEN** it synchronizes release metadata
- **AND** it runs preflight and workspace verification
- **AND** it commits version-file changes when needed
- **AND** it pushes the release branch before pushing the new tag

#### Scenario: Local release preparation refuses reused tags

- **GIVEN** the requested release tag already exists locally or remotely
- **WHEN** the local release orchestration command runs
- **THEN** it fails before mutating git state
- **AND** it tells the operator to bump to a new version

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
