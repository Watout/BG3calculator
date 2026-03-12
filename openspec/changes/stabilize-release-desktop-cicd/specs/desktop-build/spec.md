# desktop-build

## ADDED Requirements

### Requirement: Desktop release tags must match declared versions

The desktop release workflow MUST validate the pushed release tag against every declared desktop version before any build starts.

#### Scenario: Matching stable release tag

- **GIVEN** the pushed tag is `0.1.2`
- **AND** the root workspace, desktop package, Tauri config, and Cargo manifest all declare version `0.1.2`
- **WHEN** the release workflow starts
- **THEN** the preflight step succeeds
- **AND** the workflow continues to workspace verification and desktop builds

#### Scenario: Mismatched manifest version

- **GIVEN** the pushed tag is `0.1.2`
- **AND** one of the declared desktop versions is not `0.1.2`
- **WHEN** the release workflow starts
- **THEN** the preflight step fails with a message that identifies the drifting file
- **AND** no desktop build job runs

### Requirement: Desktop releases use no-leading-v semantic tags

The desktop release workflow MUST only accept semantic version tags without a leading `v`.

#### Scenario: Prerelease tag

- **GIVEN** the pushed tag is `0.1.2-beta.1`
- **WHEN** the release workflow evaluates the tag
- **THEN** the tag is accepted
- **AND** the published GitHub Release is marked as a prerelease

#### Scenario: Leading-v tag

- **GIVEN** the pushed tag is `v0.1.2`
- **WHEN** the release workflow starts
- **THEN** the preflight step fails with an invalid tag error

### Requirement: Desktop release assets are collected through a validated contract

The desktop release workflow MUST verify that the downloaded build artifacts contain the expected desktop bundle files before publishing a GitHub Release.

#### Scenario: Required assets are present

- **GIVEN** the publish job downloads the Windows and macOS artifacts
- **AND** they include at least one `.msi`, one `.exe`, and one `.dmg`
- **WHEN** the asset collection step runs
- **THEN** it emits a stable newline-delimited file list for the release action
- **AND** the GitHub Release is created or updated with those assets

#### Scenario: Required assets are missing

- **GIVEN** the publish job downloads artifacts that are missing one required asset group
- **WHEN** the asset collection step runs
- **THEN** the step fails with a clear missing-asset error
- **AND** the GitHub Release is not published
