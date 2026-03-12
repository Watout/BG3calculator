# desktop-build Specification

## ADDED Requirements

### Requirement: Windows users can trigger a macOS build remotely

The repository MUST provide a Windows-friendly local command that dispatches the GitHub Actions macOS build and downloads the resulting artifact.

#### Scenario: Clean pushed branch dispatches a macOS build

- **GIVEN** the developer is on a local branch whose `origin/<branch>` matches local `HEAD`
- **AND** `GH_TOKEN` or `GITHUB_TOKEN` is available
- **WHEN** the developer runs the remote macOS build command
- **THEN** the repository dispatches `.github/workflows/desktop-build.yml` with `target=macos-universal`
- **AND** waits for the matching workflow run to complete
- **AND** downloads the `bg3calculator-macos-universal` artifact into a local artifact directory

### Requirement: Remote macOS dispatch must fail fast on local mismatches

The repository MUST stop before dispatching when the local state cannot be reproduced remotely.

#### Scenario: Dirty working tree is rejected

- **GIVEN** the current branch has uncommitted or untracked changes
- **WHEN** the developer runs the remote macOS build command
- **THEN** the command exits with a clear error telling the developer to commit or stash local changes
- **AND** no workflow dispatch request is sent

#### Scenario: Branch is not pushed

- **GIVEN** the current branch local `HEAD` does not match `origin/<branch>`
- **WHEN** the developer runs the remote macOS build command
- **THEN** the command exits with a clear error telling the developer to push the branch first
- **AND** no workflow dispatch request is sent

### Requirement: Workflow dispatch supports target filtering

The desktop build workflow MUST support a caller selecting which matrix target to build.

#### Scenario: macOS-only remote dispatch

- **GIVEN** the workflow is dispatched with `target=macos-universal`
- **WHEN** GitHub Actions evaluates the desktop build matrix
- **THEN** only the `macos-universal` matrix entry runs
- **AND** the workflow uploads the `bg3calculator-macos-universal` artifact
