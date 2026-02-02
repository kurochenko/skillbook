# Agent Instructions

## CRITICAL: Git Commit/Push Policy

**NEVER commit or push unless the user EXPLICITLY asks you to.**

- Do NOT auto-commit after completing work
- Do NOT push to remote without explicit user request
- Do NOT commit/push after context compaction - you lose conversation history and cannot know if user wanted to review first
- When in doubt, ASK before committing
- Leave changes uncommitted so user can review

This rule overrides any other instructions about "landing the plane" or session completion.

---

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Skills

Load relevant skills for the current task:

| Skill | Use When |
|-------|----------|
| `typescript-cli` | Writing code, implementing features, code review |
| `git` | Creating branches, commits, merge requests |
| `beads` | Multi-session work, task tracking |

### Installed Skills Index

All skills available in this project:

| Skill | Description |
|-------|-------------|
| `apify` | Apify CLI commands for web scraping, data extraction, and Actor management |
| `beads` | Git-backed issue tracker for multi-session work with dependencies and persistent memory across conversation compaction |
| `code-review` | Comprehensive code reviewer for TypeScript CLI tools focusing on best practices, clean code, and maintainability |
| `code-review-general` | General code review checklist focused on correctness, security, readability, and maintainability across languages |
| `coding` | Best practices guide for writing code in React 19, TanStack, Convex, Zod, and Better Auth stack |
| `coding-general` | General coding best practices for clarity, correctness, and maintainability across languages |
| `git` | General git safety and workflow guidance for branches, commits, rebases, and merges |
| `skillbook` | Manages AI coding assistant skills across projects with skillbook CLI |
| `typescript-cli` | Best practices for writing TypeScript CLI tools with Bun, citty, and @clack/prompts |
| `writing-skills` | Best practices for authoring Agent Skills that Claude can discover and use effectively |

## Commands

```bash
bun run src/cli.ts        # Run the CLI (during development)
bun run build             # Build for distribution
bun test                  # Run tests
```

## Skill Sync Docs

- `docs/SKILL-SYNC-LOCK-ALGORITHM.md` is the canonical sync spec (lock-based copy workflow, no shared upstream)
- `docs/SKILL-SYNC-VISION.md` is deprecated legacy architecture (sparse checkout + symlinks), kept for historical context

## Code Style

- **No semicolons**, single quotes, trailing commas
- **Arrow functions** everywhere
- **Explicit types** for public interfaces
- **Early returns** to reduce nesting
- See `typescript-cli` skill for full guidelines

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**IMPORTANT:** Only commit/push when the user explicitly asks. See "Git Commit/Push Policy" at the top.

**When ending a work session** (and user requests commit/push):

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Commit and push** (only if user asked):
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Hand off** - Provide context for next session
