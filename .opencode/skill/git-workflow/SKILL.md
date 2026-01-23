---
name: git-workflow
description: Use when creating git branches, commits, or merge requests. Contains branch naming (feat/fix/chore/...), commit format, and MR workflow for squash + fast-forward merge.
---

# Git Workflow Conventions

## Branch Naming

### Format

```
<type>/<short-description>
```

### Examples

```
feat/add-recipe-sharing
feat/dark-mode-toggle
fix/auth-redirect-loop
fix/recipe-save-error
chore/upgrade-dependencies
refactor/extract-chat-logic
docs/api-documentation
```

### Types

| Type       | Purpose                                    |
| ---------- | ------------------------------------------ |
| `feat`     | New feature or functionality               |
| `fix`      | Bug fix                                    |
| `chore`    | Maintenance, dependencies, config          |
| `refactor` | Code restructuring without behavior change |
| `docs`     | Documentation only                         |

### Guidelines

- Use lowercase with hyphens (kebab-case)
- Keep it short but descriptive
- Branch from `main`

---

## Commit Message Format

```
<type>: <description>
```

### Examples

```
feat: add recipe sharing via link
fix: resolve auth redirect loop on logout
chore: upgrade TanStack Router to v1.95
refactor: extract chat panel into separate component
docs: add API documentation for recipe endpoints
```

---

## Description Guidelines

1. **Focus on WHY, not WHAT** - the diff shows what changed, the message explains why
2. **Be concise** - 50-72 characters ideal for the summary line
3. **Use imperative mood** - "add" not "added", "fix" not "fixed"
4. **No period at the end**

### Good Examples

```
feat: add dark mode toggle to settings
fix: prevent duplicate recipe submissions
chore: remove unused dependencies
refactor: simplify auth state management
docs: document recipe markdown format
```

### Bad Examples

```
fix                                    # Missing description
feat: added new feature                # Past tense, vague
fix: Fixed the bug.                    # Past tense, period at end
update stuff                           # Missing type, vague
```

---

## GitLab Merge Request Workflow

### One Purpose Per MR

**Each MR must have a single, focused purpose.**

- Do NOT combine unrelated changes in one MR
- If a revert is needed, it should revert only that specific feature/fix
- Unrelated changes (e.g., a fix + new tooling) must be separate branches/MRs

**When in doubt, ASK**: "These seem like separate concerns - should I create separate branches, or combine them?"

Examples of what NOT to do:

```
# BAD: Mixing a bug fix with unrelated tooling
fix/auth-optimization  # contains auth fix + new skill files

# GOOD: Separate branches for separate purposes
fix/auth-optimization  # only auth-related changes
chore/add-git-skills   # only skill documentation
```

### Process

1. Create feature branch from `main`
2. Make commits (can be multiple, will be squashed)
3. Push branch and open Merge Request
4. **MR Title** = final commit message (must follow convention)
5. **MR Description** = commit body (explains the WHY)
6. Squash all commits on merge
7. Fast-forward merge to main

### MR Title Format

```
<type>: <description>
```

Same format as commit messages since it becomes the final squashed commit.

### MR Description

The MR description becomes the commit body. Focus on:

1. **Why** this change is needed (context, problem being solved)
2. **What** the change does (high-level summary)
3. **Impact** of the change (what it affects)

Example:

```
Users couldn't share recipes with friends because there was no
sharing mechanism. This adds a "Copy Link" button that generates
a shareable URL for any recipe.

The link includes the recipe ID and works for both authenticated
and unauthenticated users (read-only for unauth).
```

---

## Quick Reference

### Branches

```
feat/<description>
fix/<description>
chore/<description>
refactor/<description>
docs/<description>
```

### Commits / MR Titles

```
feat: <what this feature adds>
fix: <what was broken and is now fixed>
chore: <what maintenance was done>
refactor: <what was restructured>
docs: <what documentation was added/updated>
```

### Creating a Branch

```bash
git checkout main
git pull origin main
git checkout -b feat/my-new-feature
```

### Opening an MR

```bash
git push -u origin feat/my-new-feature
glab mr create --title "feat: my new feature" --description "Why this change is needed..."
```
