export const SKILLBOOK_SKILL = `---
name: skillbook
description: >
  Manages AI coding assistant skills across projects with skillbook CLI.
  Use when installing, syncing, or managing skills in the library or projects.
license: MIT
compatibility: opencode, claude-code, cursor
---

# Skillbook - Skill Library Manager

Manages AI coding assistant skills in one place. Create skills once, reuse them across all projects.

## CRITICAL: Never Touch Git or Library Files Directly

**NEVER run git commands on \`.SB/\` or \`~/.SB/\` folders.**

No \`git pull\`, \`git push\`, \`git commit\`, \`git stash\` - nothing. The skillbook CLI handles all git operations internally.

**NEVER edit files directly in \`~/.SB/skills/\` or \`.SB/skills/\` folders.**

The central library at \`~/.SB/\` should only be modified by the skillbook CLI. Direct edits will cause sync conflicts and show \`[library-dirty]\` status.

### When Editing Skills

1. **Edit in project harness folder** - Modify \`.claude/skills/<name>/SKILL.md\`, \`.cursor/rules/<name>.md\`, or \`.opencode/skill/<name>/SKILL.md\` directly
2. **DO NOT edit in \`.SB/skills/\`** - This folder is managed by the CLI only
3. **Initialize first** - If \`.SB/\` doesn't exist, run \`skillbook\` TUI and install a skill
4. **Use CLI to sync** - After editing, open \`skillbook\` TUI and press \`p\` to push changes to library

### When Skills Are Outdated

If a skill shows \`[behind]\` status, tell the user to run \`skillbook\` and sync from TUI. Do NOT run git commands yourself.

### Library-Dirty Status

If a skill shows \`[library-dirty]\` status, it means the central library has uncommitted changes. This happens when someone edited files directly in \`~/.SB/\`.

**EXCEPTION:** You may use git commands ONLY to fix a dirty library state:

\`\`\`bash
cd ~/.SB
git status                    # See what changed
git checkout -- skills/<name> # Discard changes (or commit if needed)
\`\`\`

This is the ONLY exception to the "never touch git" rule. Use it only for cleanup, never for normal workflows.

## Quick Reference

| Command | Description |
|---------|-------------|
| \`skillbook\` | Open TUI in current project |
| \`skillbook <path>\` | Open TUI for specific project |
| \`skillbook scan ~/projects\` | Find skills across projects |
| \`skillbook list\` | List skills in library |

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Library** | Central storage at \`~/.SB/skills/\` |
| **Skill** | Folder with \`SKILL.md\` file |
| **Harness** | Tool config folder (\`.claude/\`, \`.cursor/\`, \`.opencode/\`) |
| **Installed** | Skill symlinked from library to project |

## Workflows

### Initialize Library

\`\`\`bash
skillbook scan ~/projects
\`\`\`

Finds all skills across projects. Select which to add to library.

### Install Skill in Project

1. Open TUI: \`skillbook\`
2. Navigate to AVAILABLE section
3. Press \`i\` to install

### Push Local Changes

1. Open TUI: \`skillbook\`
2. Select modified skill
3. Press \`p\` to push to library

### Sync from Library

1. Open TUI: \`skillbook\`
2. Select skill with \`[behind]\`, \`[conflict]\`, or \`[library-dirty]\` status
3. Press \`s\` to sync (for \`[library-dirty]\`, fix library first)

## TUI Keybindings

| Key | Action |
|-----|--------|
| \`↑/↓\` | Navigate |
| \`Tab\` | Switch Skills/Harnesses tab |
| \`i\` | Install skill |
| \`u\` | Uninstall skill |
| \`p\` | Push to library |
| \`s\` | Sync from library |
| \`q\` | Quit |

## Skill Status

| Status | Meaning |
|--------|---------|
| \`[ok]\` | Synced with library |
| \`[ahead]\` | Local has newer changes |
| \`[behind]\` | Library has newer changes |
| \`[conflict]\` | Both have changes |
| \`[detached]\` | Not linked to library |
| \`[library-dirty]\` | Library has uncommitted changes |
`

export const DEFAULT_SKILLS = [
  { name: 'skillbook', content: SKILLBOOK_SKILL },
]
