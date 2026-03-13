# Proposal: Add AGENTS Optimization Skill

## Summary

Add a first-class repository skill for creating and refining `AGENTS.md`, and document the repository-wide split between root rules, repo skills, human-readable docs, and `openspec` records.

## Why

The repository already references skills and agent workflows in scattered places, but it does not yet ship a real `/.agents/skills/` structure. As a result:

- `AGENTS.md` is still the nearest collaboration contract, even for guidance that should live in reusable skills.
- skill-related expectations are discoverable only through pitfall logs or older change proposals.
- future collaboration-process cleanup has no repository-local workflow entrypoint.

## What Changes

- add `/.agents/skills/optimize-agents-md/` as the first repo-level skill
- add a reusable concise `AGENTS.md` template under that skill
- wire the new skill into `AGENTS.md`
- add a dedicated `docsforcodex` collaboration index for AGENTS and repo skills
- record the new collaboration contract in `openspec`
- add a small automated test that guards the skill assets

## Impact

- affects repository collaboration docs and local automation guidance only
- does not change application runtime behavior, package APIs, or release semantics
- gives future agent/rule cleanup work a stable repository-local entrypoint
