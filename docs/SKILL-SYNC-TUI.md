# Skill Sync TUI (2E) Design

> Ticket: skill-book-lhz.2
> Status: Proposed
> Last updated: 2026-02-01

## Goals

- Mirror the CLI command surface so humans and agents use the same operations.
- Make conflicts and drift obvious, with fast paths to resolve.
- Keep the project as the canonical source for harness output.

## Views

### Skills (Project)

- Primary view for project-installed skills.
- Shows status against library and against harnesses.
- Actions map 1:1 to CLI commands.

### Library

- Browse library-only skills.
- Quick install into project.

### Harnesses

- Show harness state (enabled/disabled/available).
- Sync project -> harness and import harness -> project.

### Conflicts

- Filtered list of `diverged` skills.
- Fast access to resolve and diff.

## Status Display

Skill-level status (project vs library):

- `synced`
- `ahead`
- `behind`
- `diverged`
- `local-only`
- `library-only`

Harness-level status (project vs harness):

- `harness-synced`
- `harness-drifted`

## Actions and CLI Mapping

| TUI Action | CLI Command |
| --- | --- |
| Install | `skillbook install <skill>` |
| Pull | `skillbook pull <skill>` |
| Push | `skillbook push <skill>` |
| Diff | `skillbook diff <skill> --from library --to project` |
| Resolve | `skillbook resolve <skill> --strategy ...` |
| Uninstall | `skillbook uninstall <skill>` |
| Harness Sync | `skillbook harness sync --harness <id>` |
| Harness Import | `skillbook harness import --harness <id>` |
| Enable Harness | `skillbook harness enable <id>` |
| Disable Harness | `skillbook harness disable <id>` |

## Detail Panel

- `baseVersion`, `baseHash` (from project lock)
- `projectHash` (computed)
- `libraryVersion`, `libraryHash` (from library lock)
- Diff stats for project vs library and project vs harness

## Confirmation Rules

- Confirm when data loss is possible (overwrite, uninstall, resolve with winner).
- No confirmation for safe read-only actions (list, status, diff).
