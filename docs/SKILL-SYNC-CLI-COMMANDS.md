# Skill Sync CLI Commands (Lock-Based Copy)

> Ticket: skill-book-lhz.1
> Status: Proposed
> Last updated: 2026-02-01

## Scope

- Non-interactive commands for LLM use and automation.
- Same capabilities as the TUI (2E) so humans and agents stay in sync.
- Works without shared upstreams between library repos.
- Canonical algorithm lives in `docs/SKILL-SYNC-LOCK-ALGORITHM.md`.

## Status Model

Project vs library:

- `synced`: project hash matches lock hash and library version.
- `ahead`: project hash differs, library version unchanged since lock.
- `behind`: project hash matches lock, library version advanced.
- `diverged`: project hash differs and library version advanced.
- `local-only`: skill exists in project but not in library.
- `library-only`: skill exists in library but not in project.

Project vs harness:

- `harness-synced`: harness content matches project canonical copy.
- `harness-drifted`: harness differs from project canonical copy.

## Commands

### Setup and Environment

- `skillbook init --library`
  - Create or validate `~/.SB/` git repo and `skillbook.lock.json`.
- `skillbook init --project`
  - Create `<project>/.SB/skills` and project lock file.
- `skillbook doctor`
  - Validate expected folders, lock schema, and git status in library.

### Listing and Inspection

- `skillbook list --library|--project`
  - Enumerate skills with id, version, and hash.
- `skillbook show <skill> --library|--project`
  - Show lock entry and computed hash for one skill.
- `skillbook status [<skill>]`
  - Compute sync status for project vs library and project vs harness.
- `skillbook diff <skill> --from library --to project`
  - Show content diff to aid decisions.

### Library <-> Project Sync

- `skillbook install <skill>`
  - Copy library -> project and write lock entry.
- `skillbook pull <skill|--all>`
  - Pull library changes into project when behind.
- `skillbook push <skill|--all>`
  - Push project changes into library when ahead, bump version.
- `skillbook resolve <skill> --strategy library|project|merge`
  - Resolve diverged state with a chosen strategy.
- `skillbook uninstall <skill>`
  - Remove skill from project (library untouched).

### Project <-> Harness Sync

- `skillbook harness list`
  - List available harness ids.
- `skillbook harness enable <id>` / `skillbook harness disable <id>`
  - Update project config for enabled harnesses.
- `skillbook harness sync [--id <harness>]`
  - Copy project canonical skills -> harness.
- `skillbook harness import [--id <harness>]`
  - Copy harness changes -> project, marking skill as ahead.

### Ingestion and Discovery

- `skillbook scan <path>`
  - Discover skills in projects/harnesses; allow add to library.
- `skillbook add <skill> --from <path>`
  - Add a new skill to the library (initial version = 1).

### Migration

- `skillbook migrate --from legacy`
  - Convert sparse-checkout + symlink workflow to lock-based copy.

## Shared Flags

- `--json`: machine-readable output for LLMs.
- `--dry-run`: show intended changes only.
- `--yes`: skip confirmations.
- `--force`: override safety checks.
- `--all`: batch mode.
- `--project <path>` / `--library <path>`: explicit targeting.

## Exit Codes

- `0`: success
- `1`: error
- `2`: conflict or diverged state requiring manual action
