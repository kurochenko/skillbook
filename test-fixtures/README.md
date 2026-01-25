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
library/                           # Mock ~/.config/skillbook
├── .git/
└── skills/
    ├── skill-in-lib/SKILL.md     # Installed in project
    ├── skill-available/SKILL.md  # Not installed (AVAILABLE)
    ├── skill-detached/SKILL.md   # Matches project's real file
    └── skill-conflict/SKILL.md   # Differs from project version

project/                           # Mock project
├── .git/
├── .skillbook/                    # Sparse checkout
│   ├── .git/
│   ├── config.json               # harnesses: ['claude-code']
│   └── skills/
│       └── skill-in-lib/SKILL.md
├── .claude/skills/                # Enabled harness
│   ├── skill-in-lib/SKILL.md     → symlink (status: ok)
│   ├── skill-detached/SKILL.md   # real file, matches (status: detached)
│   └── skill-local/SKILL.md      # real file, not in lib (section: LOCAL)
└── .opencode/skill/               # Not in config
    └── skill-in-lib/SKILL.md     # real file, differs (status: conflict)
```

## Skill States Represented

| Skill | Location | State | Expected Display |
|-------|----------|-------|------------------|
| skill-in-lib | claude | symlink to .skillbook | `[✓]` ok |
| skill-in-lib | opencode | real file, differs | `[conflict]` |
| skill-detached | claude | real file, matches lib | `[detached]` |
| skill-local | claude | real file, not in lib | LOCAL section |
| skill-available | library only | not installed | AVAILABLE section |

## Usage

### Manual Setup

```bash
bun run test-fixtures/setup.ts
```

### In Tests

```typescript
import { setupFixtures, cleanupFixtures, LIBRARY_PATH, PROJECT_PATH } from '../../../test-fixtures/setup'

beforeAll(() => {
  setupFixtures()
  process.env.SKILLBOOK_LIBRARY = LIBRARY_PATH
})

afterAll(() => {
  cleanupFixtures()
})
```

## Notes

- `library/` and `project/` are generated and should be in `.gitignore`
- Git repos are initialized fresh each time to ensure clean state
- Config sets only `claude-code` as enabled harness
