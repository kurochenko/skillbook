# skillbook: AI Coding Assistant Skill Library Manager

> **Status**: MVP Development  
> **Last Updated**: 2025-01-23  
> **Name**: `skillbook` (available on npm, crates.io, GitHub)

---

## The Problem

### Personal Pain Point

I work on ~6 projects throughout the day:
- **Languages**: TypeScript, JavaScript, Java
- **Context**: Work projects, personal projects
- **Collaboration**: Solo work and team projects

My AI coding assistant skills (Claude Code, Cursor, OpenCode) are **copy-pasted chaos**:
- Skills duplicated across projects
- They drift over time as I improve them in one place
- I improve a skill in Project A, forget to update Projects B-F
- Team members have their own copies that diverge
- No single source of truth

### The Broader Problem

This is a widely-felt pain point in the AI coding assistant community:

- **Reddit threads** full of developers asking "how do I sync my Claude Code skills across projects?"
- **Enterprise teams** (50+ developers) struggling to maintain consistent rules
- **Manual copying** described as "tedious" and "prone to drift"
- **No standardization** across different AI tools (Claude Code vs Cursor vs OpenCode)

---

## Solution: skillbook

A CLI tool to manage AI coding assistant skills across projects.

### MVP Commands

```bash
# Add a skill from current project to the library
skillbook add .claude/skills/beads/SKILL.md
# -> Copies to ~/.config/skillbook/skills/beads/SKILL.md

# Initialize skills in a new project
skillbook init
# -> Interactive checkbox selection
# -> Creates symlinks to tool-specific locations

# List available skills in library
skillbook list
# -> Shows all skills in ~/.config/skillbook/skills/
```

### Library Structure (Convention-based)

```
~/.config/skillbook/
└── skills/
    ├── beads/
    │   └── SKILL.md
    ├── typescript/
    │   └── SKILL.md
    ├── review-gitlab/
    │   └── SKILL.md
    └── sentry/
        └── SKILL.md
```

**Convention:** Each folder in `skills/` is a skill. Folder name = skill name. No config files needed for MVP.

### Project Structure After `skillbook init`

```
project/
├── .claude/skills/
│   └── beads/SKILL.md      -> symlink to library
├── .cursor/rules/
│   └── beads.md            -> symlink to library
└── .opencode/skills/
    └── beads.md            -> symlink to library
```

---

## Technical Decisions

### Tech Stack

| Choice | Decision | Reasoning |
|--------|----------|-----------|
| **Language** | TypeScript + Bun | Fast development, familiar, can compile to binary later |
| **CLI Framework** | citty | Lightweight (7KB), modern, good TypeScript support |
| **Interactive UI** | @clack/prompts | Beautiful checkboxes, used by Astro/SvelteKit |
| **Colors** | picocolors | Fastest, smallest |
| **Config Format** | JSON (if needed) | Native to TypeScript, machine-generated |
| **Sync Strategy** | Symlinks | Simple, instant updates, no duplication |
| **Platform** | macOS + Linux | No Windows support needed |

### Dependencies (Minimal)

```json
{
  "dependencies": {
    "citty": "^0.1.6",
    "@clack/prompts": "^0.8.0",
    "picocolors": "^1.1.0"
  }
}
```

### Binary Distribution (Future)

When ready to distribute:
```bash
bun build ./src/cli.ts --compile --outfile skillbook
```

---

## MVP Scope

### Phase 0: Minimal MVP (Current)

| Command | Description | Status |
|---------|-------------|--------|
| `skillbook add <path>` | Copy skill from project to library | TODO |
| `skillbook init` | Interactive select + create symlinks | TODO |
| `skillbook list` | Show available skills | TODO |

**No config files, no versioning, no manifest** - just files and symlinks.

### Phase 1: Basic Workflow

| Command | Description |
|---------|-------------|
| `skillbook status` | Show installed skills in current project |
| `skillbook remove <skill>` | Remove skill symlinks from project |

### Phase 2: Sync Features

| Command | Description |
|---------|-------------|
| `skillbook sync` | Pull updates (re-link if library changed) |
| `skillbook push <skill>` | Copy modified skill back to library |
| `skillbook diff <skill>` | Show differences between project and library |

### Phase 3: Advanced

| Feature | Description |
|---------|-------------|
| Version tracking | Track which commit each skill was installed from |
| Manifest file | `.skillbook/manifest.json` for project state |
| Skill composition | Skills that reference other skills |
| Team sharing | Multiple library sources |

---

## Tool-Specific Paths

| Tool | Skill Location | Symlink Target |
|------|---------------|----------------|
| **Claude Code** | `.claude/skills/<name>/SKILL.md` | `~/.config/skillbook/skills/<name>/SKILL.md` |
| **Cursor** | `.cursor/rules/<name>.md` | `~/.config/skillbook/skills/<name>/SKILL.md` |
| **OpenCode** | `.opencode/skills/<name>.md` | `~/.config/skillbook/skills/<name>/SKILL.md` |

Note: Claude Code expects a directory with SKILL.md inside. Cursor/OpenCode expect a flat .md file.

---

## Implementation Plan

### File Structure

```
src/
├── cli.ts                 # Entry point, citty setup
├── commands/
│   ├── add.ts             # skillbook add <path>
│   ├── init.ts            # skillbook init  
│   └── list.ts            # skillbook list
├── lib/
│   ├── paths.ts           # Path helpers (~/.config/skillbook, etc.)
│   ├── library.ts         # Library operations (scan, add skill)
│   └── symlinks.ts        # Create symlinks for each tool
└── constants.ts           # Tool configs, paths
```

### Command: `skillbook add <path>`

```typescript
// 1. Validate path exists and is a .md file
// 2. Extract skill name from parent folder
//    .claude/skills/beads/SKILL.md -> "beads"
// 3. Create ~/.config/skillbook/skills/<name>/
// 4. Copy file to ~/.config/skillbook/skills/<name>/SKILL.md
// 5. Print success message
```

### Command: `skillbook init`

```typescript
// 1. Scan ~/.config/skillbook/skills/ for available skills
// 2. Show multi-select checkbox prompt
// 3. Ask which tools to configure (Claude Code, Cursor, OpenCode)
// 4. For each selected skill + tool:
//    - Create tool-specific directory if needed
//    - Create symlink from tool location to library
// 5. Print summary of created symlinks
```

### Command: `skillbook list`

```typescript
// 1. Scan ~/.config/skillbook/skills/
// 2. For each folder, print skill name
// 3. Optionally show if skill.md exists
```

---

## Research Findings

### Existing Tools (Competition/Inspiration)

| Tool | Stars | What It Does | Gap |
|------|-------|--------------|-----|
| **[skillshare](https://github.com/runkids/skillshare)** | 249 | Multi-tool symlink sync | No selective install |
| **[agent-resources](https://github.com/kasperjunge/agent-resources)** | 349 | Package manager for skills | Claude Code only |
| **[craftdesk](https://github.com/mensfeld/craftdesk)** | 39 | Full package manager | Complex |
| **[glooit](https://github.com/nikuscs/glooit)** | 18 | Multi-tool + MCP sync | No selection UI |

### Why Build Our Own?

None of the existing tools offer the simple workflow we want:
1. **Add skill from project** - Most are pull-only from registries
2. **Interactive selection** - Most are config-file based
3. **Multi-tool symlinks** - Some do this, but with complex config

Our approach: **Simplest possible thing that works**, then iterate.

### Native Tool Capabilities

| Feature | Claude Code | Cursor | OpenCode |
|---------|-------------|--------|----------|
| Skill location | `.claude/skills/` | `.cursor/rules/` | `.opencode/skills/` |
| File format | `SKILL.md` in folder | `.md` or `.mdc` | `.md` |
| Symlinks work? | Yes | Yes | Yes |
| User-level skills | `~/.claude/skills/` | `~/.cursor/skills/` | `~/.opencode/skills/` |

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| TOML vs JSON? | **JSON** - native to TypeScript, machine-generated |
| Symlinks vs Copy? | **Symlinks** - simpler for MVP |
| Manifest file? | **No** - not needed for MVP |
| Windows support? | **No** - macOS + Linux only |
| Binary distribution? | **Later** - Bun runtime OK for now |

---

## References

### Tools to Study

- skillshare: https://github.com/runkids/skillshare
- agent-resources: https://github.com/kasperjunge/agent-resources
- chezmoi: https://github.com/twpayne/chezmoi
- GNU Stow: https://www.gnu.org/software/stow/

### Standards

- Agent Skills: https://agentskills.io
- Claude Code docs: https://docs.anthropic.com/en/docs/claude-code
- Cursor docs: https://docs.cursor.com/context/rules

### CLI Frameworks Evaluated

- citty (chosen): https://github.com/unjs/citty
- @clack/prompts (chosen): https://github.com/bombshell-dev/clack
- commander: https://github.com/tj/commander.js
- ink: https://github.com/vadimdemedes/ink
