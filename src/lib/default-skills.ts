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

## IMPORTANT: Where to Edit Skills

The main library at \`~/.skillbook/\` is **off-limits**. Never modify files there directly.

When updating a skill:

1. **Work in the project folder** - Edit skills in \`.skillbook/skills/<name>/SKILL.md\` within the current project
2. **Initialize if needed** - If \`.skillbook/\` doesn't exist, run \`skillbook\` TUI and install a skill first
3. **Don't commit** - Let the skillbook CLI handle all git operations
4. **Use the TUI to sync** - After editing, use \`skillbook\` TUI to push changes to the library

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
| **Library** | Central storage at \`~/.skillbook/skills/\` |
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
2. Select skill with \`[behind]\` or \`[conflict]\` status
3. Press \`s\` to sync

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
`

export const DEFAULT_SKILLS = [
  { name: 'skillbook', content: SKILLBOOK_SKILL },
]
