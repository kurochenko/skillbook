# skillbook: AI Coding Assistant Skill Library Manager

> **Status**: MVP Development  
> **Last Updated**: 2026-01-24  
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

**Core principles:**
1. **Git is enabler, CLI is interface** - Users don't need to know git
2. **Non-invasive** - Works for non-skillbook users (hard copies, not symlinks)
3. **Minimal config** - Convention over configuration
4. **Per-project harness config** - Different tools per project

---

## User Stories (Prioritized)

### P0: Critical for MVP

**US1: First-time library building**
> As a new user, I want to discover all my existing skills and add them to my library.

- Command: `skillbook add --bulk`
- Scans from current directory recursively
- Finds skills in `.claude/skills/`, `.cursor/rules/`, `.opencode/skill/`
- Shows skills grouped by project with status (new/synced/changed)
- Interactive selection to add to library
- **Status: Done**

**US2: Install skill in project**
> As a user in a project, I want to install a skill from my library into this project.

- Interactive: `skillbook init` (full setup - select harnesses + skills)
- Quick: `skillbook install <skill>` (uses existing config)
- Creates hard copies in harness paths (not symlinks)
- Creates `.skillbook/config.yaml` for project preferences
- **Status: Needs implementation**

**US3: Project harness config**
> As a user, I want to configure which harnesses (tools) this project uses.

- Config stored in `.skillbook/config.yaml`
- Created during `init` or first `install`
- Per-project (different projects can use different tools)
- **Status: Needs implementation**

### P1: Important (v1)

**US4: Status check**
> As a user, I want to see the tracking status of skills in my project.

- Command: `skillbook status`
- Compare harness files to library
- Show tracking status: untracked, synced, ahead, behind, diverged
- **Status: Not started**

**US5: Push local changes to library**
> As a user, I want to contribute my local skill changes back to the library.

- Command: `skillbook push` or `skillbook push <skill>`
- Copy from harness → library
- Git commit in library
- **Status: Not started**

### P2: Nice to have (Later)

**US6: Pull library updates** - `skillbook pull`
**US7: Modify project config** - `skillbook config`
**US8: Remove skill from project** - `skillbook remove <skill>`

---

## Command Structure

| Command | Direction | Description |
|---------|-----------|-------------|
| `add <path>` | → library | Add single skill file to library |
| `add --bulk` | → library | Scan & bulk add skills to library |
| `init` | ← project | Full project setup (harnesses + skills) |
| `install <skill>` | ← project | Quick install using existing config |
| `list` | — | List skills in library |
| `status` | — | Show sync status in current project |
| `push [skill]` | → library | Push local changes to library |
| `pull` | ← project | Pull library updates to project |

**Key insight**: "add" always means "to library", "install" means "to project".

---

## Architecture: Hard Copies

### Why Not Symlinks?

The initial MVP used symlinks, but they have significant drawbacks:

| Issue | Problem |
|-------|---------|
| **Non-portable** | Breaks for non-skillbook users (team members, CI) |
| **Git noise** | Symlinks committed to repo point to missing files |
| **Cross-platform** | Windows symlink support is problematic |
| **Clone issues** | `git clone` doesn't resolve symlinks |

### Architecture Overview

```
~/.config/skillbook/              # Master library (git repo)
├── skills/
│   ├── beads/SKILL.md
│   ├── typescript/SKILL.md
│   └── review-gitlab/SKILL.md
└── config.yaml                   # Global preferences (optional)

project/
├── .skillbook/                   # Project config (gitignored)
│   └── config.yaml               # Harness preferences + installed skills
├── .claude/skills/               # Hard copies (committed)
│   └── beads/SKILL.md
├── .cursor/rules/                # Hard copies (committed)
│   └── beads.md
└── .gitignore                    # Contains: .skillbook/
```

### Key Concepts

| Component | Location | Git Status | Purpose |
|-----------|----------|------------|---------|
| **Master Library** | `~/.config/skillbook/` | Git repo | Source of truth |
| **Project Config** | `project/.skillbook/` | Gitignored | Harness prefs, installed skills |
| **Harness Files** | `.claude/`, `.cursor/` | Committed | Tool-specific hard copies |

### Sync Flow (MVP)

```
Library (~/.config/skillbook/)
     ↓ direct copy
Harness files (.claude/, .cursor/)
```

For MVP, we skip the sparse checkout complexity. Direct comparison:
- **Install**: Library → Harness (copy)
- **Push**: Harness → Library (copy + git commit)
- **Status**: Compare harness to library directly

### Tracking Status (Git-Inspired Terminology)

Skills have a **tracking status** describing their relationship to the library, inspired by git:

| Status | Label | Meaning |
|--------|-------|---------|
| Not in library | `[untracked]` | Library doesn't track this skill yet |
| In library, identical | `[synced]` | Tracked, up to date with library |
| In library, local differs | `[ahead +5/-3]` | Tracked, local has changes not in library |
| In library, library updated | `[behind]` | Tracked, library has newer version |
| Both changed | `[diverged]` | Tracked, both have different changes |

**Context-dependent visibility:**

| Command | Detectable Statuses | Why |
|---------|---------------------|-----|
| `add --bulk` | untracked, synced, ahead | Scans local files only |
| `status` | All statuses | Compares against project config |
| `pull` | behind, diverged | Checks library for updates |

### Change Detection

Simple file comparison - no hash tracking or state files:

```typescript
// Status detection
const libraryContent = read('~/.config/skillbook/skills/beads/SKILL.md')
const localContent = read('.claude/skills/beads/SKILL.md')

if (!libraryContent) return 'untracked'      // not in library
if (!localContent) return 'not-installed'    // in library but not locally
if (libraryContent === localContent) return 'synced'
return 'ahead'  // local has changes (for add --bulk context)
```

For `[ahead]` status, show git-style diff stats: `[ahead +5/-3]`

---

## Technical Decisions

### Tech Stack

| Choice | Decision | Reasoning |
|--------|----------|-----------|
| **Language** | TypeScript + Bun | Fast development, familiar, can compile to binary later |
| **CLI Framework** | citty | Lightweight (7KB), modern, good TypeScript support |
| **Interactive UI** | @clack/prompts | Beautiful checkboxes, used by Astro/SvelteKit |
| **Colors** | picocolors | Fastest, smallest |
| **Sync Strategy** | Hard copies | Non-invasive, works for everyone |
| **Platform** | macOS + Linux | No Windows support needed |

### Config Files

**Global config** (`~/.config/skillbook/config.yaml`):
```yaml
# Optional: default harnesses for new projects
default_harnesses:
  - claude-code
  - cursor
```

**Project config** (`project/.skillbook/config.yaml`):
```yaml
# Which harnesses to sync in this project
harnesses:
  - claude-code
  - cursor

# Skills installed in this project (auto-managed)
skills:
  - beads
  - typescript
```

### Binary Distribution (Future)

When ready to distribute:
```bash
bun build ./src/cli.ts --compile --outfile skillbook
```

---

## Implementation Phases

### Phase 0: Library Building (Done)

| Command | Description | Status |
|---------|-------------|--------|
| `skillbook add <path>` | Copy skill to library | ✅ Done |
| `skillbook add --bulk` | Scan and bulk add | ✅ Done |
| `skillbook list` | Show available skills | ✅ Done |
| `skillbook init` | Interactive select + symlinks | ✅ Done (needs update) |

### Phase 1: Hard Copies MVP (Current)

| Task | Description | Status |
|------|-------------|--------|
| Project config | `.skillbook/config.yaml` with harness list | TODO |
| Update `init` | Hard copies instead of symlinks | TODO |
| Add `.skillbook/` to `.gitignore` | Auto-add on init | TODO |
| `install <skill>` command | Quick install using existing config | TODO |
| `status` command | Show sync status in project | TODO |

### Phase 2: Sync Features (v1)

| Command | Description |
|---------|-------------|
| `skillbook push [skill]` | Push harness changes to library |
| `skillbook pull` | Pull library updates to harnesses |

### Phase 3: Polish (Later)

| Feature | Description |
|---------|-------------|
| `skillbook config` | Modify harnesses without full init |
| `skillbook remove <skill>` | Remove skill from project |
| Conflict resolution | Handle divergent changes |
| Diff display | Show changes before sync |

---

## Tool-Specific Paths (Harnesses)

| Tool | Skill Location | Transform |
|------|---------------|-----------|
| **Claude Code** | `.claude/skills/<name>/SKILL.md` | Directory + SKILL.md |
| **Cursor** | `.cursor/rules/<name>.md` | Flat file |
| **OpenCode** | `.opencode/skills/<name>.md` | Flat file |

Note: Claude Code expects a directory with SKILL.md inside. Cursor/OpenCode expect a flat .md file.

---

## File Structure

```
src/
├── cli.ts                 # Entry point, citty setup
├── commands/
│   ├── add.ts             # skillbook add <path>
│   ├── init.ts            # skillbook init  
│   ├── list.ts            # skillbook list
│   ├── status.ts          # skillbook status
│   ├── sync.ts            # skillbook sync
│   ├── pull.ts            # skillbook pull
│   └── push.ts            # skillbook push
├── lib/
│   ├── paths.ts           # Path helpers
│   ├── library.ts         # Library operations
│   ├── cache.ts           # Sparse checkout operations
│   ├── harness.ts         # Harness file operations
│   ├── config.ts          # Config file handling
│   └── git.ts             # Git operations
└── constants.ts           # Tool configs, paths
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
3. **Non-invasive distribution** - All use symlinks

Our approach: **Simplest possible thing that works**, then iterate.

### Native Tool Capabilities

| Feature | Claude Code | Cursor | OpenCode |
|---------|-------------|--------|----------|
| Skill location | `.claude/skills/` | `.cursor/rules/` | `.opencode/skills/` |
| File format | `SKILL.md` in folder | `.md` or `.mdc` | `.md` |
| User-level skills | `~/.claude/skills/` | `~/.cursor/skills/` | `~/.opencode/skills/` |

---

## Open Questions

### Resolved

| Question | Decision |
|----------|----------|
| TOML vs JSON? | **YAML** - human-friendly for config |
| Symlinks vs Copy? | **Hard copies** - non-invasive |
| State tracking? | **No** - direct file comparison |
| Windows support? | **No** - macOS + Linux only |
| Binary distribution? | **Later** - Bun runtime OK for now |
| Command naming? | **add** = to library, **install** = to project |

### Open (Decide when implementing)

| Question | Options |
|----------|---------|
| Config creation on `install` (no config exists) | (a) Fail with "run init first" (b) Auto-detect harnesses from existing dirs (c) Prompt interactively |
| Sparse checkout needed? | Maybe not for MVP - direct library comparison might be enough |

---

## References

### Tools to Study

- skillshare: https://github.com/runkids/skillshare
- agent-resources: https://github.com/kasperjunge/agent-resources
- chezmoi: https://github.com/twpayne/chezmoi
- GNU Stow: https://www.gnu.org/software/stow/
- git sparse-checkout: https://git-scm.com/docs/git-sparse-checkout

### Standards

- Agent Skills: https://agentskills.io
- Claude Code docs: https://docs.anthropic.com/en/docs/claude-code
- Cursor docs: https://docs.cursor.com/context/rules

### CLI Frameworks Evaluated

- citty (chosen): https://github.com/unjs/citty
- @clack/prompts (chosen): https://github.com/bombshell-dev/clack
- commander: https://github.com/tj/commander.js
- ink: https://github.com/vadimdemedes/ink
