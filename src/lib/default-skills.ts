export const SKILLBOOK_SKILL = `---
name: skillbook
description: >
  Manages AI coding assistant skills across projects with skillbook CLI.
  Use when installing, syncing, or managing skills in the library or projects.
license: MIT
compatibility: opencode, claude-code, codex, cursor
---

# Skillbook - Skill Library Manager

Lock-based skill syncing for projects and harnesses.

## Safety Rules

- Do not edit ~/.skillbook/ directly. Use skillbook commands.
- Project canonical location is .skillbook/skills/<id>/.

## Quick Reference

| Command | Description |
|---------|-------------|
| skillbook init --library | Initialize the library at ~/.skillbook |
| skillbook init --project | Initialize .skillbook in a project |
| skillbook status | Show project status vs library |
| skillbook install <id> | Copy library skill into project |
| skillbook push <id> | Push project changes into library |
| skillbook pull <id> | Pull library changes into project |
| skillbook resolve <id> --strategy library|project | Resolve diverged skill |
| skillbook harness sync --id opencode | Sync project skills to harness |
| skillbook harness import --id opencode | Import harness skills into project |
| skillbook migrate --library | Create lockfile for ~/.skillbook |

## Workflows

### Initialize

~~~bash
skillbook init --library
skillbook init --project
~~~

### Edit Skills

1. Edit in project .skillbook/skills/<id>/ (preferred).
2. If you edited a harness file, run skillbook harness import --id <harness>.
3. Run skillbook status to see changes.

### Sync

- Push local changes: skillbook push <id>
- Pull library changes: skillbook pull <id>
- Resolve conflicts: skillbook resolve <id> --strategy library|project

## Status

- [synced] project matches library
- [ahead] project has local changes
- [behind] library has newer changes
- [diverged] both changed
- [local-only] exists only in project
`

export const DEFAULT_SKILLS = [
  { name: 'skillbook', content: SKILLBOOK_SKILL },
]
