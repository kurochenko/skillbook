# Test Fixtures

This directory contains test fixtures for integration testing.

## Structure

```
test-fixtures/
├── setup.ts              # Script to create/reset fixtures
├── README.md             # This file
├── library/              # Generated - mock library
└── project/              # Generated - mock project
```

## Generated Structure

After running `setup.ts`:

```
library/                                    # Mock ~/.skillbook
├── .git/
└── skills/
    ├── skill-in-lib/SKILL.md              # Installed in project
    ├── skill-available/SKILL.md           # Not installed (AVAILABLE)
    ├── skill-detached/SKILL.md            # Matches project's real file
    ├── skill-conflict/SKILL.md            # Differs from project version
    └── skill-unanimous-conflict/SKILL.md  # For testing unanimous conflict

project/                                    # Mock project
├── .git/
├── .skillbook/                             # Sparse checkout (--no-cone mode)
│   ├── .git/
│   ├── config.json                         # harnesses: ['claude-code']
│   └── skills/
│       └── skill-in-lib/SKILL.md
├── .claude/skills/                         # Enabled harness
│   ├── skill-in-lib/                       # Directory symlink -> .skillbook/skills/skill-in-lib
│   ├── skill-detached/SKILL.md             # Real file, matches library
│   ├── skill-local/SKILL.md                # Real file, not in library
│   └── skill-unanimous-conflict/SKILL.md   # Real file, differs from library
└── .opencode/skill/                        # Not in config
    ├── skill-in-lib/SKILL.md               # Real file, differs from library
    └── skill-unanimous-conflict/SKILL.md   # Real file, same as .claude version
```

## Skill States Represented

| Skill | Location | State | Expected Display |
|-------|----------|-------|------------------|
| skill-in-lib | claude | directory symlink to .skillbook | `[✓]` ok (but mixed due to opencode) |
| skill-in-lib | opencode | real file, differs | `[conflict]` |
| skill-detached | claude | real file, matches lib | `[detached]` |
| skill-local | claude | real file, not in lib | LOCAL section |
| skill-available | library only | not installed | AVAILABLE section |
| skill-unanimous-conflict | claude + opencode | real files, both differ from lib | `[conflict]` (unanimous) |

## Symlink Architecture

For directory-based harnesses (Claude Code, OpenCode), symlinks are at the **directory level**:

```
.claude/skills/skill-in-lib/     # This is the symlink
└── SKILL.md                     # Accessed through symlink
```

The symlink target is relative:
```
../../.skillbook/skills/skill-in-lib
```

For flat-file harnesses (Cursor), symlinks are at the file level:
```
.cursor/rules/skill-name.md -> ../.skillbook/skills/skill-name/SKILL.md
```

## Usage

### Manual Setup

```bash
bun run test-fixtures/setup.ts
```

### In Tests

```typescript
import { setupFixtures, cleanupFixtures, LIBRARY_PATH, PROJECT_PATH } from '../../../test-fixtures/setup'

beforeAll(() => {
  process.env.SKILLBOOK_LIBRARY = LIBRARY_PATH
})

beforeEach(() => {
  setupFixtures()  // Reset fixtures before each test
})

afterAll(() => {
  cleanupFixtures()
})
```

## Notes

- `library/` and `project/` are generated and should be in `.gitignore`
- Git repos are initialized fresh each time to ensure clean state
- Config sets only `claude-code` as enabled harness
- Sparse checkout uses `--no-cone` mode with patterns matching production behavior
