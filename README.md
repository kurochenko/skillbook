# skillbook

A CLI tool to manage AI coding assistant skills across projects and teams.

**Install:**
```bash
curl -fsSL https://raw.githubusercontent.com/kurochenko/skillbook/main/install.sh | bash
```

<!-- TODO: Add screenshot/demo image here -->

## The Problem

**Skills drift across your projects.** You work on multiple projects. Each has its own AI assistant skills. You improve a skill in Project A, forget to update Projects B, C, D. They drift apart. You end up with different versions everywhere, unsure which is best.

**Skills drift across harnesses.** You use Claude Code, Cursor, and OpenCode. Each stores skills differently. Keeping them in sync manually is tedious and error-prone.

**Skills drift across team members.** Your teammate improves a skill, but you never know. You have a better version, but they're stuck with the old one. There's no shared source of truth.

**No shared learning.** You want to share skills company-wide. But copy-pasting files across repos doesn't scale. You need a central library that everyone can fetch from and update.

## The Solution

**skillbook** is a centralized Git repository that serves as your skill library. Projects link to it via sparse checkouts, keeping skills in sync automatically:

```
~/.skillbook/                    # Central library (Git repo)
└── skills/
    ├── typescript/
    ├── review-gitlab/
    └── beads/

project-a/.claude/skills/        # Sparse checkout from library
project-b/.cursor/rules/         # Same skills, always in sync
project-c/.opencode/skill/       # Team-wide consistency
```

**Share with your team.** Push your library to a shared Git remote. Team members clone it. When you update a skill and push, they pull. Everyone stays in sync.

**Company-wide skill library.** Set up a company repo that everyone can fetch from and contribute to. Best practices propagate automatically.

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/kurochenko/skillbook/main/install.sh | bash
```

Windows is not supported. Use WSL or run on macOS/Linux.

### Homebrew (coming soon)

```bash
brew install kurochenko/tap/skillbook
```

### From Source

Requires [Bun](https://bun.sh/) runtime.

```bash
git clone https://github.com/kurochenko/skillbook.git
cd skillbook
bun install
bun link
```

Once installed, run `skillbook` to see how to get started.

## Updating

skillbook can update itself:

```bash
skillbook upgrade
```

It also checks for updates automatically and notifies you when a new version is available.

## Usage

### Initialize Your Library

```bash
# Create the central library
skillbook init
```

### Find Skills Across Projects

Run `scan` from a parent directory containing multiple projects:

```bash
cd ~/projects
skillbook scan
```

This finds all skills in subdirectories and lets you add them to your library interactively.

### Project View

Run `skillbook` without arguments inside a project folder:

```bash
cd my-project
skillbook
```

**Skills tab** shows:
- Installed skills in the current project
- Available skills from your library
- Differences between installed and library versions

**Harness tab** lets you:
- See which harnesses are installed (Claude Code, Cursor, OpenCode)
- Install a harness to start syncing skills to it
- Eject a harness to stop syncing

### Commands

#### `skillbook` (no args)

Interactive project view. Shows installed vs available skills and their sync status.

#### `skillbook scan`

Scan for skills in subdirectories. Run from a parent folder containing multiple projects.

```bash
cd ~/projects
skillbook scan
# Finds skills in project-a/.claude/skills/, project-b/.cursor/rules/, etc.
```

#### `skillbook add <path>`

Add a skill from your current project to the library.

```bash
skillbook add .claude/skills/beads/SKILL.md
# -> Copies to ~/.skillbook/skills/beads/SKILL.md

skillbook add .claude/skills/beads/SKILL.md --force  # Overwrite existing
```

#### `skillbook list`

Show all skills in your library.

```bash
skillbook list
```

#### `skillbook upgrade`

Update skillbook to the latest version.

```bash
skillbook upgrade
```

## Skill Library Structure

```
~/.skillbook/
└── skills/
    ├── typescript/
    │   └── SKILL.md
    ├── beads/
    │   └── SKILL.md
    └── review-gitlab/
        └── SKILL.md
```

Each skill is a folder containing a `SKILL.md` file. The folder name is the skill name.

## Supported Tools

| Tool | Skill Location | Format |
|------|---------------|--------|
| **Claude Code** | `.claude/skills/<name>/SKILL.md` | Directory with SKILL.md |
| **Cursor** | `.cursor/rules/<name>.md` | Flat .md file |
| **OpenCode** | `.opencode/skill/<name>/SKILL.md` | Directory with SKILL.md |

## Development

```bash
bun run src/cli.ts <command>   # Run during development
bun test                        # Run tests
bun run build                   # Build binary
```

## License

MIT
