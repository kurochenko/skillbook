# skillbook: AI Coding Assistant Skill Library Manager

> **Status**: MVP Development  
> **Last Updated**: 2026-01-25  
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

---

## Solution: skillbook

A CLI tool to manage AI coding assistant skills across projects.

**Core principles:**
1. **Git is enabler, CLI is interface** - Users don't need to know git
2. **Single source of truth** - Library is the canonical version
3. **Multi-harness sync** - One skill file, symlinked to all harnesses
4. **Progressive adoption** - Works read-only before migration
5. **Reversible** - Eject anytime, back to vanilla files

---

## Architecture: Sparse Checkout + Symlinks

### Overview

```
~/.config/skillbook/              # Library (git repo, ALL skills)
├── .git/
├── skills/
│   ├── beads/SKILL.md
│   ├── typescript-cli/SKILL.md
│   ├── code-review/SKILL.md
│   └── ... (all your skills)
└── config.json

project/
├── .skillbook/                   # Sparse checkout of library (only project's skills)
│   └── skills/
│       ├── beads/SKILL.md        ← sparse-checked-out from library
│       └── typescript-cli/SKILL.md
├── .claude/skills/
│   ├── beads/SKILL.md            ← symlink → .skillbook/skills/beads/SKILL.md
│   └── typescript-cli/SKILL.md   ← symlink
├── .opencode/skill/
│   ├── beads/SKILL.md            ← symlink → .skillbook/skills/beads/SKILL.md
│   └── typescript-cli/SKILL.md   ← symlink
└── .cursor/rules/
    ├── beads.md                  ← symlink → .skillbook/skills/beads/SKILL.md
    └── typescript-cli.md         ← symlink
```

### Key Concepts

| Component | Location | What It Is | Git Status |
|-----------|----------|------------|------------|
| **Library** | `~/.config/skillbook/` | Git repo with ALL skills | Own git repo |
| **Project Cache** | `.skillbook/` | Sparse checkout of library | Part of project git |
| **Harness Folders** | `.claude/`, `.cursor/`, `.opencode/` | Symlinks to `.skillbook/` | Part of project git |

### Why This Architecture?

| Problem | Solution |
|---------|----------|
| Skills duplicated per harness | Single file in `.skillbook/`, symlinked to harnesses |
| Skills drift between projects | Library is source of truth, sparse checkout syncs |
| Team members use different tools | Symlinks work for all harnesses from same source |
| Want to leave skillbook | `eject` converts symlinks to real files |

---

## Status Reference

### Skill-Level Status Badges

| Status | Badge | Color | Meaning |
|--------|-------|-------|---------|
| OK | `[✓]` | green | Symlinked to .skillbook, up to date |
| Ahead | `[ahead]` | yellow | Symlinked, local has unpushed changes |
| Behind | `[behind]` | cyan | Symlinked, library has updates to pull |
| Detached | `[detached]` | dim | Real file, same as library (safe to sync) |
| Conflict | `[conflict]` | red | Real file, differs from library (choose action) |

### Harness-Level Status Badges

When a skill has different states across harnesses, we show a tree with per-harness entries.
These statuses only apply to individual harness entries:

| Status | Badge | Meaning |
|--------|-------|---------|
| OK | `[✓]` | Symlinked to .skillbook |
| Detached | `[detached]` | Real file, matches library |
| Conflict | `[conflict]` | Real file, differs from library |

**Note:** `ahead`/`behind` are skill-level only because symlinks share the same `.skillbook/` source.

### Sections

| Section | Contents |
|---------|----------|
| **INSTALLED** | Skills present locally AND in library |
| **LOCAL** | Skills present locally but NOT in library |
| **AVAILABLE** | Skills in library but NOT installed locally |

### Tree View Display

Skills show on a single line when **unanimous** (all harnesses have same status):
```
[✓] beads                    ← all harnesses symlinked
[detached] typescript-cli    ← all harnesses have real files matching library
```

Skills show a tree when harnesses **differ**:
```
typescript-cli
  ├─ claude-code    [✓]          ← symlinked
  └─ opencode       [conflict]   ← real file, differs
```

### Actions by Level

#### Skill Level

| Status | Available Actions |
|--------|-------------------|
| `[✓]` | `[u]ninstall` |
| `[ahead]` | `[p]ush` to library, `[u]ninstall` |
| `[behind]` | `[s]ync` from library, `[u]ninstall` |
| `[detached]` | `[s]ync` to link, `[u]ninstall` |
| `[conflict]` | `[s]ync` (use library), `[p]ush` (use local), `[u]ninstall` |
| LOCAL | `[p]ush` to add to library |
| AVAILABLE | `[i]nstall` |

#### Harness Entry Level

| Action | Key | Description |
|--------|-----|-------------|
| Use as source | `s` | Push this harness's content to library, sync all other harnesses |

Destructive actions show confirmation prompts only when information would be lost.

---

## Harness Tab

### Harness States

| State | Symbol | Description |
|-------|--------|-------------|
| **Enabled** | `[✓]` | Fully managed, all installed skills are symlinked |
| **Detached** | `[d]` | Folder exists with real files only (no symlinks), clean standalone state |
| **Partial** | `[~]` | Mixed state (some symlinks, some real files, or inconsistent) |
| **Available** | `[ ]` | No folder exists |

### Harness Actions

| Key | Action | When Available | Description | Confirm? |
|-----|--------|----------------|-------------|----------|
| `e` | **Enable** | Partial, Detached, Available | Add to config, sync all installed skills (create symlinks) | No |
| `r` | **Remove** | Enabled, Detached, Partial | Delete the harness folder entirely | Yes |
| `d` | **Detach** | Enabled, Partial | Convert symlinks to real files, remove from config | No |

### Harness State Detection

```
if (folder doesn't exist):
  state = 'available'
else if (in config AND all installed skills are symlinked):
  state = 'enabled'
else if (not in config AND all present skills are real files):
  state = 'detached'
else:
  state = 'partial'  // mixed state
```

### Harness Tab Display

```
HARNESSES
> [✓] Claude Code                    ← enabled, fully managed
  [d] OpenCode                       ← detached, real files only
  [~] Cursor                         ← partial, mixed state
  [ ] Other                          ← available, no folder
```
if (folder doesn't exist):
  state = 'available'
else if (in config AND all installed skills are symlinked):
  state = 'enabled'
else:
  state = 'partial'  // folder exists but not fully managed
```

### Harness Tab Display

```
HARNESSES
> [✓] Claude Code                    ← enabled, fully managed
  [~] OpenCode                       ← partial, has content but not managed
  [ ] Cursor                         ← available, no folder
```

---

## User Flows

### TUI Display

```
┌─────────────────────────────────────────────────────────────┐
│ skillbook                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ INSTALLED                                                   │
│   [✓] beads                    ← unanimous, all symlinked   │
│   [ahead] typescript-cli       ← unanimous, local changes   │
│   git-workflow                 ← discrepancy, show tree     │
│     ├─ claude-code    [✓]                                   │
│     └─ opencode       [conflict]                            │
│   [detached] my-skill          ← unanimous, real files      │
│                                                             │
│ LOCAL                                                       │
│   my-custom                    ← not in library yet         │
│     └─ claude-code                                          │
│                                                             │
│ AVAILABLE                                                   │
│   code-review                  ← can install                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [s]ync  [p]ush  [u]ninstall  [tab] harnesses  [q]uit        │
└─────────────────────────────────────────────────────────────┘
```

### Navigation

- **Arrow keys**: Navigate skills AND harness entries (two-level selection)
- **Tab**: Switch between Skills and Harnesses tabs
- **Actions**: Context-sensitive based on selection level

### Lazy Initialization

No separate "setup" step required. On first sync/install action:

1. `.skillbook/` is automatically created as sparse checkout of library
2. Skill is added to sparse checkout
3. Symlink created in harness folder

### Sync Flow (for `[unlinked]` or `[conflict]` skills)

When user presses `[s]ync` on an unlinked/conflict skill:

1. If `.skillbook/` doesn't exist → init sparse checkout (lazy init)
2. Add skill to sparse checkout
3. Remove real file/folder from harness
4. Create symlink to `.skillbook/skills/<name>/`

For `[conflict]`: sync uses library version (local changes lost)

### Install Skill

After setup, installing a skill:

```
1. Add skill to sparse checkout (git sparse-checkout add)
2. Create symlinks in all enabled harnesses
```

### Uninstall Skill

```
1. Remove symlinks from all harnesses
2. Remove from sparse checkout (git sparse-checkout remove)
```

### Push Changes

When user edits a skill (via any harness symlink):

```
Changes are in .skillbook/skills/ (sparse checkout)
  ↓
Commit in .skillbook/ = commit in library
  ↓
Push to library remote (if configured)
```

### Sync / Pull

```
git pull in .skillbook/
  ↓
Sparse checkout updates automatically
  ↓
Symlinks point to updated files
```

### Eject

User wants to leave skillbook:

```
skillbook eject

Ejecting will:
  1. Copy all skills to harness folders as real files
  2. Remove symlinks
  3. Remove .skillbook/ folder

You can run 'skillbook' again anytime to re-setup.

Which harnesses to eject to?
  [x] opencode
  [ ] claude-code
  [ ] cursor

[Enter] Confirm  [Esc] Cancel
```

After eject:
- Harness folders have real files (copies)
- No `.skillbook/` folder
- Running `skillbook` again shows read-only mode, offers setup

---

## Commands

| Command | Description |
|---------|-------------|
| `skillbook` | Interactive TUI (default) |
| `skillbook scan [path]` | Scan for skills, add to library |
| `skillbook list` | List skills in library |
| `skillbook eject` | Convert symlinks to real files, remove .skillbook |

### Scan Command

Scans directories for skills and adds them to your central library. This is the primary way to populate your library from existing skills across projects.

**Purpose:** Find skills across projects and add them to your central library for later use.

#### Scan Status Badges

| Status | Badge | Color | Meaning | Action |
|--------|-------|-------|---------|--------|
| Local only | `[local]` | dim | Not in library yet | `[a]dd to library` |
| Matches | `[matches]` | green | In library, content identical | None needed |
| Differs | `[differs]` | yellow | In library, content different | `[o]verwrite library` |

#### Variant Warnings

When multiple projects have the same skill with **different content**, a warning is shown:

```
beads [differs] ⚠ 1 of 3 variants
gitlab-mr-review [local] ⚠ 1 of 2 variants
```

**Key rules:**
- `[matches]` items **never** show variant warnings (they match the library)
- Variants are only counted **within the same status category**
- Warning format: `⚠ 1 of N variants` - indicates this is one of N different versions

#### Scan TUI Actions

| Key | Action | When | Confirmation |
|-----|--------|------|--------------|
| `a` | Add to library | On `[local]` skill | No |
| `o` | Overwrite library | On `[differs]` skill | Yes - warns about replacing |
| `q` | Quit | Always | No |

#### Example Output

```
skillbook - Library Scan

Find skills across projects and add them to your central library.

[local] not in library  [matches] matches library version  [differs] differs from library version

PROJECTS (5)
23 skills found

apify-hackaton-2026 (2)
  ├─ apify [matches]
  └─ beads [differs] ⚠ 1 of 3 variants
frontend (6)
  ├─ atlassian-jira [differs]
  ├─ git-rebase [matches]
  └─ gitlab-mr-review [local] ⚠ 1 of 2 variants
[✓ skillbook] skill-book (4)
  ├─ atlassian-jira [matches]
  └─ coding [matches]

┌────────────────────────────────────────────────────────────────┐
│ [a]dd to library  [q]uit                                       │
└────────────────────────────────────────────────────────────────┘
```

#### Overwrite Confirmation

When pressing `[o]` on a skill that differs from library:

```
Overwrite 'beads' in library? This will replace the existing version.
[y]es  [n]o
```

### TUI Actions

| Key | Action | When |
|-----|--------|------|
| `i` | Install skill | On AVAILABLE skill |
| `u` | Uninstall skill | On INSTALLED skill |
| `p` | Push to library | On `[ahead]`, `[conflict]`, or LOCAL skill |
| `s` | Sync from library | On `[unlinked]`, `[conflict]`, or `[behind]` skill |
| `l` | Pull from library | On `[behind]` skill |
| `Space` | Toggle harness | On harness tab |
| `Tab` | Switch tabs | Always |
| `q` | Quit | Always |

---

## Config

### Project Config (`.skillbook/config.json`)

```json
{
  "harnesses": ["opencode", "claude-code"]
}
```

Note: No `skills` array - filesystem is source of truth (sparse checkout contents).

### Library Config (`~/.config/skillbook/config.json`)

```json
{
  "defaultHarnesses": ["claude-code"]
}
```

---

## Implementation Status

### Done
- [x] Library management (add, list, scan)
- [x] TUI prototype with Ink
- [x] Harness detection
- [x] Config module (JSON-based)
- [x] Sparse checkout for `.skillbook/`
- [x] Symlink management (folder symlinks for directory harnesses)
- [x] Lazy init on first sync/install
- [x] Install/uninstall/sync actions
- [x] Status naming convention (ok/ahead/behind/detached/conflict)
- [x] Harness enable/disable with auto-detection preservation
- [x] Per-harness tree view (show harness entries when status differs)
- [x] Two-level navigation (skill + harness entry selection)
- [x] Harness-level "use as source" action with confirmation prompt
- [x] Enable harness properly converts real files to symlinks
- [x] Scan follows symlinks to find skills in skillbook-managed projects
- [x] Scan TUI with Ink (replaced clack prompts)
- [x] Scan statuses: `[local]`, `[matches]`, `[differs]` with clear meanings
- [x] Scan actions: `[a]dd` for local, `[o]verwrite` for differs (with confirmation)
- [x] Scan variant warnings only on non-matches with multiple different versions
- [x] Scan description explaining purpose: "Find skills and add to library"

### TODO
- [ ] Push/pull actions for ahead/behind states
- [ ] Eject command
- [ ] Detect ahead/behind states (compare with library)

---

## Tool-Specific Paths (Harnesses)

| Tool | Skill Location | Format |
|------|---------------|--------|
| **Claude Code** | `.claude/skills/<name>/SKILL.md` | Directory + SKILL.md |
| **Cursor** | `.cursor/rules/<name>.md` | Flat file |
| **OpenCode** | `.opencode/skill/<name>/SKILL.md` | Directory + SKILL.md |

---

## Technical Decisions

| Choice | Decision | Reasoning |
|--------|----------|-----------|
| Language | TypeScript + Bun | Fast, familiar |
| TUI | Ink (React) | Used by Claude Code, modern |
| Config | JSON | Native to JS, no extra deps |
| Sync | Sparse checkout + symlinks | Single source, multi-harness |
| Platform | macOS + Linux | No Windows needed |
