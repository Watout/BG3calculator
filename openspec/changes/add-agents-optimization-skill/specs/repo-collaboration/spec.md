# repo-collaboration

## ADDED Requirements

### Requirement: Repository collaboration guidance must provide an AGENTS optimization skill

The repository MUST provide a repository-local workflow for creating or refactoring `AGENTS.md` so root rules stay concise and reusable procedures move into repo skills.

#### Scenario: Discovering the supported AGENTS workflow

- **GIVEN** an operator needs to create, slim, or restructure `AGENTS.md`
- **WHEN** the operator looks for the supported repository-local workflow
- **THEN** the repository exposes `/.agents/skills/optimize-agents-md/SKILL.md`
- **AND** the skill explains how to keep `AGENTS.md` concise
- **AND** the skill routes long procedures into `/.agents/skills/*/SKILL.md`

### Requirement: Repository docs must describe the AGENTS-skill-docs split

The repository MUST document how root `AGENTS.md`, repo skills, `docsforcodex`, and `openspec` divide responsibility so collaboration rules remain discoverable.

#### Scenario: Discovering repository collaboration assets

- **WHEN** an operator reads the repository collaboration docs
- **THEN** the docs identify the roles of `AGENTS.md`, `/.agents/skills/*`, `docsforcodex/*`, and `openspec/changes/*`
- **AND** they point to the current AGENTS optimization skill
