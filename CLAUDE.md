# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is skillbook

CLI tool for managing AI coding assistant skills (prompt files) across projects. Skills live in a central library (`~/.skillbook/`) backed by git, and are installed into projects via a lockfile (`skillbook.lock.json`). Symlinks ("harnesses") connect project skills to tool-specific paths (`.claude/`, `.cursor/`, `.codex/`, `.opencode/`).

## Commands

```bash
bun run dev <command>        # Run CLI in dev mode (e.g. bun run dev scan ~/projects)
bun test                     # Run all tests
bun test src/lib/__tests__/library.test.ts  # Run a single test file
bun test --watch             # Watch mode
bun run build                # Compile to dist/skillbook
```

## Architecture

**Runtime**: Bun (ESM, TypeScript, `bun:test`). No transpile step needed for dev — `bun run src/cli.ts` executes directly.

**Path alias**: `@/*` maps to `./src/*` (configured in tsconfig.json).

**CLI framework**: `citty` — each command is a `defineCommand()` in `src/commands/<name>.ts`, lazy-imported from `src/cli.ts`.

**TUI**: The `scan` command renders an interactive Ink (React) app (`src/tui/ScanApp.tsx`). Tests use `ink-testing-library`.

### Core layers

- **`src/lib/lockfile.ts`** — Read/write `skillbook.lock.json`. Schema: `{ schema: 1, skills: Record<id, { version, hash }>, harnesses: string[] }`.
- **`src/lib/lock-paths.ts`** / **`lock-context.ts`** — Resolve paths for library (`~/.skillbook` or `SKILLBOOK_LOCK_LIBRARY`) and project (`.skillbook/` within project root).
- **`src/lib/lock-status.ts`** — Compare project vs library lock entries to determine sync status: `synced | ahead | behind | diverged | local-only | library-only`.
- **`src/lib/library.ts`** — Library operations: `ensureLibrary()` (init git repo), `addSkillToLibrary()`, `scanProjectSkills()` (crawl filesystem via `fdir`), `listSkills()`.
- **`src/lib/lock-harness.ts`** — Symlink management: create/remove symlinks from harness dirs to `.skillbook/skills/`.
- **`src/lib/skill-hash.ts`** — Content hashing for change detection.
- **`src/lib/skills.ts`** — Skill name validation (`/^[a-z0-9_][a-z0-9_-]{0,49}$/`) and extraction from file paths.

### Two path systems

The library has a legacy path system (`src/lib/paths.ts`, env `SKILLBOOK_LIBRARY`) and a lock-based system (`src/lib/lock-paths.ts`, env `SKILLBOOK_LOCK_LIBRARY`). Both default to `~/.skillbook`. New code should use the lock-based system.

## Testing patterns

Tests use `bun:test` with temp directories and env overrides. The helper `withLibraryEnv(path)` from `src/test-utils/env.ts` sets both `SKILLBOOK_LIBRARY` and `SKILLBOOK_LOCK_LIBRARY` to isolate tests from the real library. Integration tests in `src/commands/__tests__/` use `runCli()` from `src/test-utils/cli.ts` which spawns a subprocess.

## Key constants

- Skill file: `SKILL.md` (in a directory named after the skill)
- Project dir: `.skillbook/skills/<id>/SKILL.md`
- Library dir: `~/.skillbook/skills/<id>/SKILL.md`
- Lock file: `skillbook.lock.json`
- Supported harness IDs: `claude-code`, `codex`, `cursor`, `opencode`

## TypeScript strictness

Strict mode enabled with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`. The project uses `verbatimModuleSyntax` — use `import type` for type-only imports.
