---
name: optimize-agents-md
description: Use when creating, slimming, or refactoring repository AGENTS.md files and their companion repo skills. Turns AGENTS.md into a concise rule set plus skill router instead of a long runbook.
---

## Goal

Keep repository collaboration instructions short, enforceable, and reusable.

This skill treats:

- `AGENTS.md` as the place for repo-wide hard rules, tool routing, and high-priority commands.
- `/.agents/skills/*/SKILL.md` as the place for scenario-specific workflows, long checklists, templates, and reusable procedures.
- `docsforcodex/*` as the human-readable explanation layer.
- `openspec/changes/*` as the long-lived change record for durable collaboration-process updates.

## Use this skill when

- creating a new repository-level `AGENTS.md`
- slimming a bloated `AGENTS.md`
- splitting long procedures out of `AGENTS.md` into reusable skills
- adding tool routing or tool-priority rules
- standardizing how repo docs, skills, and `openspec` stay in sync

## Do not use this skill when

- editing a tiny typo that does not change structure, routing, or workflow
- changing only one existing skill body without touching `AGENTS.md` structure or repo collaboration rules

## Required reading

1. `AGENTS.md`
2. `docsforcodex/overall.md`
3. `docsforcodex/codex-local-setup-and-release.md`
4. `README.md`
5. relevant `openspec/changes/*`
6. relevant `docforcodex/hole/*` records if the change is motivated by a real pitfall

## Workflow

1. Map the current collaboration instructions into four buckets:
   - repo-wide hard rules
   - tool routing and priority
   - reusable workflows
   - explanatory docs and examples
2. Keep in `AGENTS.md` only the short, always-on rules:
   - project overview or scope if needed
   - mandatory skill usage
   - tool routing and tool priority
   - build and test commands
   - safety and compatibility rules
3. Move any long checklist, runbook, or scenario-specific workflow into `/.agents/skills/<skill-name>/SKILL.md`.
4. If the repository has no repo-level skills directory yet, create `/.agents/skills/`.
5. Add or refresh a reference template when the skill benefits from repeatable output, for example under `/.agents/skills/<skill-name>/references/`.
6. Sync docs:
   - `docsforcodex/overall.md`
   - `docsforcodex/codex-local-setup-and-release.md`
   - `docsforcodex/agents-and-skills.md` if the repository keeps a collaboration index
   - `README.md` when discoverability matters
7. If the collaboration process becomes a durable repository rule, record it under `openspec/changes/<change-id>/`.
8. If the work was triggered by a real failure or environment pitfall, update the matching `docforcodex/hole/*` record.

## Output checklist

- a concise `AGENTS.md`
- one or more repo skills under `/.agents/skills/`
- synced docs and change records
- validation evidence

## Tool priority

- local code / `README.md` / `docsforcodex/*`
- matching repo skill
- official or trusted MCP
- web
- external write operations require confirmation first

## Quality bar

- `AGENTS.md` should read like a router, not like a handbook.
- Prefer `situation -> skill/tool` bullets over long prose.
- Prefer `local facts -> skill -> official MCP -> web` as the default information priority.
- Require confirmation before external write operations.
- Keep naming stable and literal so future agents can find the skill from path alone.
- If you add a new reusable workflow, give it a single responsibility.

## Repository-specific guardrails for BG3calculator

- Use `pwsh.exe` / PowerShell 7 command examples.
- Use `pnpm` rather than `npm`.
- Re-read `docsforcodex/overall.md` before editing repository rules.
- When repo collaboration rules change here, sync:
  - `AGENTS.md`
  - `README.md`
  - `docsforcodex/overall.md`
  - `docsforcodex/codex-local-setup-and-release.md`
  - `docsforcodex/agents-and-skills.md`
  - related `openspec/changes/*`
