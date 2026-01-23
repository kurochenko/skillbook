# skillbook

A CLI tool to manage AI coding assistant skills across projects. Stop copy-pasting your Claude Code, Cursor, and OpenCode skills - maintain them in one place and sync to all your projects.

## The Problem

You work on multiple projects. Each has its own AI assistant skills scattered across `.claude/skills/`, `.cursor/rules/`, `.opencode/skills/`. You improve a skill in Project A, forget to update Projects B-F. They drift. Chaos ensues.

## The Solution

**skillbook** gives you a central library of skills that sync to any project:

```
~/.config/skillbook/skills/     # Your skill library (one source of truth)
├── typescript/
├── review-gitlab/
└── beads/

project-a/.claude/skills/       # Symlinked from library
project-b/.cursor/rules/        # Same skills, different tool
project-c/.opencode/skills/     # Always in sync
```

## Installation

### Prerequisites

- [Bun](https://bun.sh/) runtime installed

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/skillbook.git
cd skillbook

# Install dependencies
bun install

# Run directly
bun run src/cli.ts --help

# Or link globally for development
bun link
```

### Build Binary (Optional)

```bash
bun run build
./dist/skillbook --help
```

## Usage

### Quick Start

```bash
# 1. Add a skill from an existing project to your library
skillbook add .claude/skills/typescript/SKILL.md

# 2. In a new project, initialize skills you want
skillbook init

# 3. See what skills are available
skillbook list
```

### Commands

#### `skillbook add <path>`

Add a skill from your current project to the central library.

```bash
# Add a skill - extracts name from parent folder
skillbook add .claude/skills/beads/SKILL.md
# -> Copies to ~/.config/skillbook/skills/beads/SKILL.md

# Force overwrite if skill exists
skillbook add .claude/skills/beads/SKILL.md --force
```

#### `skillbook init`

Interactive setup - select skills and tools, creates symlinks.

```bash
skillbook init

# Prompts:
# ? Select skills to install
#   [x] typescript
#   [x] beads
#   [ ] review-gitlab
#
# ? Select tools to configure
#   [x] Claude Code
#   [x] Cursor
#   [ ] OpenCode
#
# Creates:
#   .claude/skills/typescript/SKILL.md -> ~/.config/skillbook/skills/typescript/SKILL.md
#   .cursor/rules/typescript.md -> ~/.config/skillbook/skills/typescript/SKILL.md
```

#### `skillbook list`

Show all skills in your library.

```bash
skillbook list

# Output:
# Available skills:
#   - beads
#   - typescript
#   - review-gitlab
```

## Skill Library Structure

Skills live in `~/.config/skillbook/skills/`:

```
~/.config/skillbook/
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
| **OpenCode** | `.opencode/skills/<name>.md` | Flat .md file |

## Development

### Running Locally

```bash
# Run CLI during development
bun run src/cli.ts <command>

# Or use the dev script
bun run dev <command>

# Examples
bun run dev --help
bun run dev list
bun run dev add ./path/to/skill.md
```

### Project Structure

```
src/
├── cli.ts              # Entry point
├── commands/
│   ├── add.ts          # skillbook add
│   ├── init.ts         # skillbook init
│   └── list.ts         # skillbook list
├── lib/
│   └── paths.ts        # Path utilities
├── constants.ts        # Tool configurations
└── types.ts            # TypeScript types
```

### Running Tests

```bash
bun test
```

## Roadmap

### MVP (Current)
- [x] Project setup
- [ ] `skillbook list` - List available skills
- [ ] `skillbook add` - Add skill to library
- [ ] `skillbook init` - Interactive skill installation

### Phase 2
- [ ] `skillbook status` - Show installed skills in project
- [ ] `skillbook sync` - Pull updates from library
- [ ] `skillbook push` - Push changes back to library

### Phase 3
- [ ] Version tracking
- [ ] Skill composition (skills referencing other skills)
- [ ] Team library sharing

## Why Not Use Existing Tools?

We evaluated [skillshare](https://github.com/runkids/skillshare), [agent-resources](https://github.com/kasperjunge/agent-resources), [craftdesk](https://github.com/mensfeld/craftdesk), and [glooit](https://github.com/nikuscs/glooit). Each solves part of the problem, but none offer:

1. **Add from project** - Most are pull-only from registries
2. **Interactive selection** - Most use config files
3. **Multi-tool symlinks** - With a simple, no-config approach

skillbook aims to be the simplest possible thing that works.

## License

MIT
