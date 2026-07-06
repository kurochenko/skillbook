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

- **`src/lib/lockfile.ts`** — Read/write `skillbook.lock.json` (validated, atomic writes). Schema: `{ schema: 1, skills: Record<id, { version, hash, updatedAt? }>, harnesses?: string[], harnessModes?: Record<id, 'symlink' | 'copy'> }`.
- **`src/lib/paths.ts`** / **`lock-context.ts`** — Resolve paths for library (`~/.skillbook` or `SKILLBOOK_LIBRARY`) and project (`.skillbook/` within project root).
- **`src/lib/lock-status.ts`** — Compare project vs library lock entries to determine sync status: `synced | ahead | behind | diverged | local-only | library-only`.
- **`src/lib/library.ts`** — Library operations: `ensureLibrary()` (init git repo), `addSkillToLibrary()`, `scanProjectSkills()` (crawl filesystem via `fdir`), `listSkills()`.
- **`src/lib/lock-harness.ts`** — Re-export barrel over `harness-inspect.ts` (path/status inspection), `harness-link.ts` (symlink/copy primitives), and `harness-batch.ts` (bulk sync/import/status, stale-entry cleanup).
- **`src/lib/skill-hash.ts`** — Content hashing for change detection.
- **`src/lib/skills.ts`** — Skill name validation (`validateSkillName` enforces the Agent Skills spec for new names; `validateExistingSkillName` also tolerates legacy underscores) and extraction from file paths.

### Path system

The library and lock-based commands share `src/lib/paths.ts`. `SKILLBOOK_LIBRARY` is the canonical library override, defaulting to `~/.skillbook`. `SKILLBOOK_LOCK_LIBRARY` is still honored as a deprecated fallback when `SKILLBOOK_LIBRARY` is unset.

## Testing patterns

Tests use `bun:test` with temp directories and env overrides. The helper `withLibraryEnv(path)` from `src/test-utils/env.ts` sets `SKILLBOOK_LIBRARY` to isolate tests from the real library. Integration tests in `src/commands/__tests__/` use `runCli()` from `src/test-utils/cli.ts` which spawns a subprocess.

## Key constants

- Skill file: `SKILL.md` (in a directory named after the skill)
- Project dir: `.skillbook/skills/<id>/SKILL.md`
- Library dir: `~/.skillbook/skills/<id>/SKILL.md`
- Lock file: `skillbook.lock.json`
- Supported harness IDs: `claude-code`, `codex`, `cursor`, `opencode`, `pi`

## TypeScript strictness

Strict mode enabled with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`. The project uses `verbatimModuleSyntax` — use `import type` for type-only imports.
