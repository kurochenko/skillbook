# Skill Sync: Lock-Based Copy Workflow (No Shared Upstream)

> Status: Proposed
> Last updated: 2026-02-01

## Goals and Constraints

- Skills are committed inside each project so teammates can clone and run prompts without installing Skill Book.
- No shared upstream for libraries. Every developer may have a different local library repo origin.
- The library remains a git repo for versioning, but syncing is done by copying files, not git remotes.
- Conflicts must be detected reliably, even when libraries diverge.

## Core Idea

Maintain a lock file in both the library and the project that records a skill's version and hash. The project lock entry represents the last library version that was copied into the project. Hash mismatches detect local edits; version mismatches detect upstream changes. This enables safe push/pull and conflict detection without any shared git remote.

## File Layout

Library (local, git repo):

```
~/.skillbook/
├── skills/
│   └── <skill-id>/...
└── skillbook.lock.json
```

Project (committed to repo):

```
<project>/
├── .skillbook/
│   ├── skills/
│   │   └── <skill-id>/...
│   └── skillbook.lock.json
└── <harness folders>/...
```

## Lock File Schema

Same schema in both library and project. In the library it represents the current version. In the project it represents the last synced version.

```
{
  "schema": 1,
  "skills": {
    "typescript-cli": {
      "version": 1,
      "hash": "sha256:...",
      "updatedAt": "2026-02-01T10:00:00Z"
    }
  }
}
```

## Hashing Rules

Hash is deterministic across machines:

- Walk all files under `skills/<skill-id>/`.
- Ignore generated metadata like `skillbook.lock.json`.
- Sort by relative path, normalize line endings to `\n`.
- Hash the concatenation of: relative path + newline + file bytes.
- Use `sha256:` prefix for clarity.

## Operations

### Install (Library -> Project)

1. Copy `skills/<id>` from library into project `.skillbook/skills/<id>`.
2. Copy lock entry from library into project lock file.
3. Result: project lock entry is the base version and base hash.

### Detect Local Changes

- Compute `projectHash` for the skill.
- If `projectHash != lock.hash`, project has local edits.

### Push (Project -> Library)

Inputs:

- `Vbase`, `Hbase` from project lock entry
- `Vlib`, `Hlib` from library lock entry (if present)
- `Hproj` computed from project files

Decision table:

- Skill not in library: create `version = 1`, `hash = Hproj`.
- `Vlib == Vbase` and `Hproj != Hbase`: safe push.
  - Increment library version: `Vlib + 1`.
  - Update library hash to `Hproj`.
  - Update project lock to new version and hash.
- `Vlib > Vbase` and `Hproj == Hbase`: project behind, pull instead.
- `Vlib > Vbase` and `Hproj != Hbase`: diverged, merge required.

### Pull (Library -> Project)

- If `Hproj == Hbase` and `Vlib > Vbase`: safe pull.
  - Copy library skill into project.
  - Update project lock to `Vlib`, `Hlib`.
- If `Hproj != Hbase` and `Vlib == Vbase`: project ahead, push instead.
- If `Hproj != Hbase` and `Vlib > Vbase`: diverged, merge required.

### Merge (Diverged)

When both project and library changed:

1. Bring library version into a temp location.
2. Perform a two-way merge between library and project content.
3. Resolve conflicts manually when needed.
4. Push merged result to library as new version (`Vlib + 1`).
5. Update project lock to the new version and hash.

Note: With only version+hash you can detect divergence but cannot do a true 3-way merge. If we want automatic merges, store a base snapshot in the project (for example `.skillbook/base/<id>/`) and use it as the third input.

## Status Mapping

- `synced`: `Hproj == Hbase` and `Vlib == Vbase`
- `ahead`: `Hproj != Hbase` and `Vlib == Vbase`
- `behind`: `Hproj == Hbase` and `Vlib > Vbase`
- `diverged`: `Hproj != Hbase` and `Vlib > Vbase`

## CLI Responsibilities

- `skillbook install <id>`: copy library -> project, write lock entry
- `skillbook push <id>`: apply push rules, bump version in library lock
- `skillbook pull <id>`: apply pull rules, update project lock
- `skillbook status`: compute hashes and report synced/ahead/behind/diverged

## Acceptance Criteria

- Skills are usable in a project after clone with no Skill Book install.
- Project lock file changes only on install, pull, or push.
- Divergence is detected reliably with no shared upstream.
- A manual merge path is available when both library and project changed.
- Hashes are deterministic across machines.
