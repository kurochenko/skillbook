# skillbook

Lock-based skill management for AI coding assistants. Keep a central library and project-local copies that are safe to commit.

## How it works

- **Library**: `~/.skillbook/skills/<id>/SKILL.md` (git repo for versioning)
- **Project**: `<project>/.skillbook/skills/<id>/SKILL.md` (committable)
- **Lockfile**: `skillbook.lock.json` stores `version` + `hash` per skill
- **Harnesses**: synced from project skills (`.claude/`, `.codex/`, `.cursor/`, `.opencode/`) using `symlink` or `copy` mode

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/kurochenko/skillbook/master/install.sh | bash
```

## Quick start

```bash
# Initialize library and scan existing projects
skillbook init --library
skillbook scan ~/projects
skillbook list

# Initialize a project and install a skill from the list
cd my-project
skillbook init --project
skillbook install <skill-id>
skillbook harness enable --id opencode --mode symlink
```

## Common workflows

### 1) Build your library (first time)

```bash
skillbook init --library
skillbook scan ~/projects
```

If you already have `~/.skillbook/skills`, generate lock entries:

```bash
skillbook migrate --library
```

### 2) Add a skill you edited in a harness

If you changed a harness file (Claude/Cursor/OpenCode), import it into the project copy, then push:

```bash
skillbook harness import --id opencode
skillbook push my-skill
```

### 3) Install skills into a project

```bash
skillbook init --project
skillbook install my-skill
skillbook harness enable --id cursor --mode copy
```

### 4) Update a skill and publish to the library

Edit the project copy, then push:

```bash
edit .skillbook/skills/my-skill/SKILL.md
skillbook push my-skill
```

### 5) Pull updates from the library

```bash
skillbook pull my-skill
```

### 6) Resolve conflicts

If `status` shows `diverged`, pick a winner:

```bash
skillbook resolve my-skill --strategy library
# or
skillbook resolve my-skill --strategy project
```

### 7) Re-sync harness outputs

If harness files were changed, removed, or drifted:

```bash
skillbook harness status --id opencode
skillbook harness sync --id opencode
# overwrite drifted copied harness files
skillbook harness sync --id opencode --force
```

### 8) Use copy mode on filesystems without symlink support

If symlinks are unsupported in your environment, use copy mode explicitly:

```bash
skillbook harness enable --id opencode --mode copy
```

When symlink mode is enabled but unsupported by the filesystem, skillbook automatically falls back to copy mode and persists it in `skillbook.lock.json`.

## Common commands

```bash
skillbook status                          # project vs library
skillbook install <id>                    # library -> project
skillbook push <id>                       # project -> library
skillbook pull <id>                       # library -> project
skillbook resolve <id> --strategy library|project
```

## Supported harnesses

| Tool | Path | Format |
| --- | --- | --- |
| Claude Code | `.claude/skills/<id>/SKILL.md` | directory |
| Codex | `.codex/skills/<id>/SKILL.md` | directory |
| Cursor | `.cursor/rules/<id>.md` | file |
| OpenCode | `.opencode/skill/<id>/SKILL.md` | directory |

## Development

```bash
bun run dev <command>              # Run CLI in dev mode
bun test                           # Run all tests
bun test src/lib/__tests__/library.test.ts   # Run a single test file
bun test --watch                   # Watch mode
bun run build                      # Compile to dist/skillbook
```

Test fixtures in `test-fixtures/` are generated at runtime and gitignored.

## License

MIT
