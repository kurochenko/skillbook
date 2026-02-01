# skillbook

A CLI tool to manage AI coding assistant skills across projects and teams.

**Install:**
```bash
curl -fsSL https://raw.githubusercontent.com/kurochenko/skillbook/master/install.sh | bash
```

<!-- TODO: Add screenshot/demo image here -->

## The Problem

**Skills drift across your projects.** You work on multiple projects. Each has its own AI assistant skills. You improve a skill in Project A, forget to update Projects B, C, D. They drift apart. You end up with different versions everywhere, unsure which is best.

**Skills drift across harnesses.** You use Claude Code, Cursor, and OpenCode. Each stores skills differently. Keeping them in sync manually is tedious and error-prone.

**Skills drift across team members.** Your teammate improves a skill, but you never know. You have a better version, but they're stuck with the old one. There's no shared source of truth.

**No shared learning.** You want to share skills company-wide. But copy-pasting files across repos doesn't scale. You need a central library that everyone can fetch from and update.

## Why not just ~/.claude?

A single global folder works if you only use Claude Code and you are solo. It breaks down when you:

- Use multiple harnesses (Cursor, OpenCode) with different formats and locations
- Need team sharing, review, and version history for skills
- Want skills versioned per project so collaborators get the same behavior
- Want project-scoped skill sets instead of a global dump (JS vs Java, frontend vs backend)
- Need diffs and auditability between library and project copies

## The Solution

**skillbook** uses a lock-based copy workflow. The library and each project keep their own copies of skills, tracked with `skillbook.lock.json` for safe sync.

```
~/.skillbook/                    # Central library (Git repo)
└── skills/
    ├── typescript/
    ├── review-gitlab/
    └── beads/

project-a/.skillbook/skills/      # Project copy (committed in repo)
project-a/.opencode/skill/        # Harness symlinks to .skillbook
```

**Share with your team.** Push your library to a shared Git remote. Team members clone it. When you update a skill and push, they pull. Everyone stays in sync.

**Company-wide skill library.** Set up a company repo that everyone can fetch from and contribute to. Best practices propagate automatically.

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/kurochenko/skillbook/master/install.sh | bash
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

Once installed, run `skillbook --help` to see available commands.

## Updating

skillbook can update itself:

```bash
skillbook upgrade
```

It also checks for updates automatically and notifies you when a new version is available.

## Usage

### Initialize Your Library

```bash
skillbook init --library
```

### Initialize a Project

```bash
cd my-project
skillbook init --project
```

### Find Skills Across Projects

Run `scan` from a parent directory containing multiple projects:

```bash
cd ~/projects
skillbook scan
```

This finds all skills in subdirectories and lets you add them to your library interactively.

### Project Workflow

```bash
# Install a skill from the library
skillbook install typescript-cli

# See status against the library
skillbook status

# Push local changes into the library
skillbook push typescript-cli

# Pull library updates into the project
skillbook pull typescript-cli

# Sync project skills into a harness
skillbook harness sync --id opencode
```

### Commands

#### `skillbook status`

Show project skill status vs library.

```bash
skillbook status
```

#### `skillbook install <id>`

Copy a library skill into the project.

```bash
skillbook install typescript-cli
```

#### `skillbook push <id>`

Push local project changes into the library.

```bash
skillbook push typescript-cli
```

#### `skillbook pull <id>`

Pull library updates into the project.

```bash
skillbook pull typescript-cli
```

#### `skillbook harness sync --id <harness>`

Sync project skills into a harness folder.

```bash
skillbook harness sync --id opencode
```

#### `skillbook scan`

Scan for skills in subdirectories (interactive).

```bash
cd ~/projects
skillbook scan
```

#### `skillbook add <path>`

Add a skill file to the library.

```bash
skillbook add .claude/skills/beads/SKILL.md
```

#### `skillbook list`

Show skills in the library and supported harness ids.

```bash
skillbook list
```

#### `skillbook upgrade`

Update skillbook to the latest version.

```bash
skillbook upgrade
```

## Skill Structure

```
~/.skillbook/
└── skills/
    ├── typescript/
    │   └── SKILL.md
    ├── beads/
    │   └── SKILL.md
    └── review-gitlab/
        └── SKILL.md

project/
└── .skillbook/
    └── skills/
        └── typescript/
            └── SKILL.md
```

Each skill is a folder containing a `SKILL.md` file. The folder name is the skill id.

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
