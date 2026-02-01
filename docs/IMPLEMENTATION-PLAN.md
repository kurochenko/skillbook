# Implementation Plan: Skillbook MVP (Deprecated)

This document describes the legacy TUI and sparse-checkout design. The lock-based copy workflow is now canonical. See `docs/SKILL-SYNC-LOCK-ALGORITHM.md` and `docs/SKILL-SYNC-CLI-COMMANDS.md`.

---

## Commands

### `skillbook scan [path]`
- Scans folders for projects with skills
- Interactive selection to add to library
- **Existing:** `add --bulk` logic, just needs rename/cleanup

### `skillbook` (default)
- Interactive TUI (LazyGit-style)
- Works in project or outside (treats as empty project)
- **Skills tab:** INSTALLED | UNTRACKED | AVAILABLE
- **Harnesses tab:** Toggle on/off with auto-detection
- `.SB/` only created on first action

---

## Module Implementation

### 1. Config Module (`src/lib/config.ts`)

```typescript
// Project config stored in .SB/config.json
type ProjectConfig = {
  harnesses: string[]      // enabled harnesses
}

// Note: No skills array - filesystem is source of truth (sparse checkout contents)

// Functions:
readConfig(projectPath): ProjectConfig | null     // returns null if no config
writeConfig(projectPath, config): void            // creates .SB/ on write
getConfigPath(projectPath): string                // .SB/config.json
ensureSkillbookDir(projectPath): void             // creates .SB/ if needed
```

### 2. Project Module (`src/lib/project.ts`)

```typescript
type InstalledSkill = {
  name: string
  status: 'synced' | 'ahead' | 'behind' | 'diverged'
  diff?: { additions: number, deletions: number }
}

type UntrackedSkill = {
  name: string
  path: string
  content: string
}

// Functions:
detectProjectContext(cwd): string | null          // returns project root or null
getInstalledSkills(projectPath): InstalledSkill[] // from .SB/skills/
getUntrackedSkills(projectPath): UntrackedSkill[] // local, not in library
installSkill(projectPath, skillName): void        // library -> .SB/skills/ -> harnesses
uninstallSkill(projectPath, skillName): void      // remove from project + harnesses
pushSkill(projectPath, skillName): void           // .SB/skills/ -> library
syncSkill(projectPath, skillName): void           // pull library -> local
```

### 3. Harness Module (`src/lib/harness.ts`)

```typescript
const HARNESS_PATHS = {
  'claude-code': '.claude/skills/',
  'cursor': '.cursor/rules/',
  'opencode': '.opencode/skill/',
}

// Functions:
detectHarnesses(projectPath): string[]            // which harness folders exist
getEnabledHarnesses(projectPath): string[]        // from config, or auto-detect
setHarnessEnabled(projectPath, harness, enabled): void
syncToHarness(projectPath, skillName, harness): void   // write skill to harness
removeFromHarness(projectPath, skillName, harness): void
syncAllHarnesses(projectPath): void               // sync all installed skills
```

### 4. TUI Updates (`src/tui/App.tsx`)

**Replace mock data with real data:**
- Load installed skills from `getInstalledSkills()`
- Load untracked skills from `getUntrackedSkills()`
- Load available skills from `listSkills()` minus installed
- Load harness state from `detectHarnesses()` + `getEnabledHarnesses()`

**Implement actions:**
- `i` = install: `installSkill()` + refresh
- `u` = uninstall: `uninstallSkill()` + refresh
- `p` = push: `pushSkill()` + refresh
- `s` = sync: `syncSkill()` + refresh
- `space` on harness = toggle + `setHarnessEnabled()`

### 5. CLI Entry Point (`src/cli.ts`)

```typescript
// Default command (no subcommand) -> TUI
skillbook               // launches TUI

// Scan command
skillbook scan [path]   // scans and adds to library
```

---

## Data Flow

```
Library (~/.SB/skills/)
    |
    | installSkill() copies library -> project
    v
Project (.SB/skills/)       <- source of truth for project
    |
    | syncToHarness() copies to enabled harnesses
    v
Harnesses (.claude/skills/, .cursor/rules/, etc.)
```

**Key insight:** `.SB/skills/` is the canonical location in project.
Harnesses are just output targets that get synced from it.

---

## File Structure After Implementation

```
src/
├── cli.ts                 # Entry point - default=TUI, scan=discovery
├── commands/
│   ├── scan.ts            # skillbook scan (renamed from add.ts bulk logic)
│   └── ... (keep others for now)
├── lib/
│   ├── config.ts          # NEW: Project config management
│   ├── project.ts         # NEW: Project skill operations
│   ├── harness.ts         # NEW: Harness sync operations
│   ├── library.ts         # Existing: Library operations
│   ├── paths.ts           # Existing: Path helpers
│   ├── skills.ts          # Existing: Skill name validation
│   └── git.ts             # Existing: Git operations
├── tui/
│   ├── App.tsx            # Main TUI component (update)
│   └── index.tsx          # TUI entry point
├── constants.ts           # Tool configs
└── types.ts               # Shared types
```

---

## Implementation Order

1. **config.ts** - Foundation for persistence
2. **project.ts** - Core operations (depends on config)
3. **harness.ts** - Harness sync (depends on config, project)
4. **Update App.tsx** - Wire to real data
5. **Update cli.ts** - Wire default command to TUI
6. **Create scan.ts** - Extract from add.ts
7. **Test everything**

---

## Key Behaviors

| Scenario | Behavior |
|----------|----------|
| `skillbook` outside project | Treat as empty project, show AVAILABLE only |
| `skillbook` in project | Show INSTALLED + UNTRACKED + AVAILABLE |
| First action (install/toggle) | Create `.SB/` folder |
| Install skill | Copy: library -> `.SB/skills/` -> enabled harnesses |
| Toggle harness ON | Sync all installed skills to that harness |
| Toggle harness OFF | Remove all skills from that harness |
| Push skill | Copy: `.SB/skills/` -> library (git commit) |
| Sync skill | Copy: library -> `.SB/skills/` -> harnesses |
