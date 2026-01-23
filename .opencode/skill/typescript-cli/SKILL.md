---
name: typescript-cli
description: Best practices for writing TypeScript CLI tools with Bun, citty, and @clack/prompts. Covers coding standards, clean code principles, and CLI-specific patterns.
license: MIT
compatibility: opencode, claude-code, cursor
metadata:
  audience: developers
  workflow: implementation, review
---

# TypeScript CLI Development Skill

A comprehensive guide for building high-quality TypeScript CLI tools using Bun runtime, citty for command parsing, and @clack/prompts for interactive UX.

## When to Use

Use this skill when:
- Writing CLI commands and subcommands
- Implementing interactive prompts and user input
- Creating file system utilities
- Building tools that work across projects
- Reviewing CLI code for best practices

---

## Code Style Rules

### Formatting

```typescript
// NO semicolons
const value = 'hello'

// Single quotes
const name = 'skillbook'

// Trailing commas
const config = {
  name: 'skillbook',
  version: '1.0.0',
}
```

### Arrow Functions Everywhere

```typescript
// GOOD - Arrow function
const formatSkillName = (name: string) => name.toLowerCase().replace(/\s+/g, '-')

// GOOD - Arrow function for main logic
const runCommand = async (args: Args) => {
  const result = await processInput(args)
  return result
}

// BAD - function keyword
function formatSkillName(name: string) { ... }
```

### Imports Order

```typescript
// 1. Node.js built-ins
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'

// 2. External packages
import { defineCommand, runMain } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

// 3. Local imports
import { getLibraryPath } from './lib/paths'
import { TOOL_CONFIGS } from './constants'
```

### Type Definitions

```typescript
// GOOD - Explicit types for public interfaces
type SkillInfo = {
  name: string
  path: string
  description?: string
}

// GOOD - Infer types for internal variables
const skills = await scanSkills() // Type inferred

// GOOD - Use 'type' over 'interface' for consistency
type Config = {
  libraryPath: string
  tools: string[]
}

// BAD - interface when type would work
interface Config { ... }
```

---

## Clean Code Principles

### Keep It Simple (KISS)

```typescript
// GOOD - Simple and clear
const isValidSkill = (path: string) => existsSync(join(path, 'SKILL.md'))

// BAD - Over-engineered
const isValidSkill = (path: string) => {
  const validator = new SkillValidator(path)
  return validator.checkFile('SKILL.md').isValid()
}
```

### Don't Repeat Yourself (DRY)

```typescript
// GOOD - Extracted helper
const ensureDir = (path: string) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

// Usage
ensureDir(getLibraryPath())
ensureDir(join(projectPath, '.claude', 'skills'))

// BAD - Repeated logic
if (!existsSync(libraryPath)) mkdirSync(libraryPath, { recursive: true })
if (!existsSync(claudePath)) mkdirSync(claudePath, { recursive: true })
```

### You Aren't Gonna Need It (YAGNI)

```typescript
// GOOD - Only what's needed now
const copySkill = (src: string, dest: string) => {
  copyFileSync(src, dest)
}

// BAD - Premature features
const copySkill = (src: string, dest: string, options?: {
  transform?: (content: string) => string
  validate?: boolean
  backup?: boolean
  dryRun?: boolean
}) => { ... }
```

### Single Responsibility

```typescript
// GOOD - Each function does one thing
const scanSkills = async (libraryPath: string): Promise<string[]> => {
  const entries = readdirSync(libraryPath, { withFileTypes: true })
  return entries.filter(e => e.isDirectory()).map(e => e.name)
}

const getSkillPath = (libraryPath: string, skillName: string) =>
  join(libraryPath, skillName, 'SKILL.md')

const skillExists = (libraryPath: string, skillName: string) =>
  existsSync(getSkillPath(libraryPath, skillName))

// BAD - Function does too much
const getSkillsWithValidation = async (path: string) => {
  // 50 lines mixing scanning, validation, formatting...
}
```

### Early Returns

```typescript
// GOOD - Early returns reduce nesting
const processSkill = async (skillPath: string) => {
  if (!existsSync(skillPath)) {
    return { error: 'Skill not found' }
  }

  const content = readFileSync(skillPath, 'utf-8')
  if (!content.trim()) {
    return { error: 'Skill file is empty' }
  }

  return { content }
}

// BAD - Deep nesting
const processSkill = async (skillPath: string) => {
  if (existsSync(skillPath)) {
    const content = readFileSync(skillPath, 'utf-8')
    if (content.trim()) {
      return { content }
    } else {
      return { error: 'Skill file is empty' }
    }
  } else {
    return { error: 'Skill not found' }
  }
}
```

### Immutability

```typescript
// GOOD - Immutable updates
const addTool = (tools: string[], newTool: string) => [...tools, newTool]

const updateConfig = (config: Config, updates: Partial<Config>) => ({
  ...config,
  ...updates,
})

// BAD - Mutation
tools.push(newTool)
config.tools = newTools
```

---

## Naming Conventions

### Variables and Functions

```typescript
// Descriptive names
const libraryPath = getLibraryPath()
const availableSkills = await scanSkills(libraryPath)

// Boolean variables: is, has, should, can
const isInstalled = checkInstallation(skillName)
const hasPermission = canWriteToPath(destPath)
const shouldOverwrite = await confirmOverwrite()

// Event handlers: handle or on prefix
const handleSelection = (selected: string[]) => { ... }
const onCancel = () => process.exit(0)
```

### Constants

```typescript
// SCREAMING_SNAKE_CASE for true constants
const DEFAULT_LIBRARY_PATH = '~/.config/skillbook'
const SUPPORTED_TOOLS = ['claude-code', 'cursor', 'opencode'] as const

// Regular camelCase for derived values
const libraryPath = expandPath(DEFAULT_LIBRARY_PATH)
```

---

## CLI Patterns with citty

### Command Definition

```typescript
import { defineCommand, runMain } from 'citty'

const main = defineCommand({
  meta: {
    name: 'skillbook',
    version: '1.0.0',
    description: 'Manage AI coding assistant skills',
  },
  subCommands: {
    add: () => import('./commands/add').then(m => m.default),
    init: () => import('./commands/init').then(m => m.default),
    list: () => import('./commands/list').then(m => m.default),
  },
})

runMain(main)
```

### Subcommand with Arguments

```typescript
import { defineCommand } from 'citty'

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a skill to the library',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Path to the skill file',
      required: true,
    },
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Overwrite existing skill',
      default: false,
    },
  },
  run: async ({ args }) => {
    const { path, force } = args
    await addSkill(path, { force })
  },
})
```

---

## Interactive Prompts with @clack/prompts

### Basic Flow

```typescript
import * as p from '@clack/prompts'
import pc from 'picocolors'

const runInit = async () => {
  p.intro(pc.bgCyan(pc.black(' skillbook init ')))

  const skills = await p.multiselect({
    message: 'Select skills to install',
    options: availableSkills.map(s => ({
      value: s.name,
      label: s.name,
      hint: s.description,
    })),
    required: true,
  })

  if (p.isCancel(skills)) {
    p.cancel('Operation cancelled')
    process.exit(0)
  }

  const tools = await p.multiselect({
    message: 'Select tools to configure',
    options: [
      { value: 'claude-code', label: 'Claude Code' },
      { value: 'cursor', label: 'Cursor' },
      { value: 'opencode', label: 'OpenCode' },
    ],
  })

  if (p.isCancel(tools)) {
    p.cancel('Operation cancelled')
    process.exit(0)
  }

  const spinner = p.spinner()
  spinner.start('Creating symlinks')

  await createSymlinks(skills, tools)

  spinner.stop('Symlinks created')

  p.outro(pc.green('Skills installed successfully!'))
}
```

### Handling Cancellation

```typescript
// ALWAYS check for cancellation after prompts
const result = await p.text({ message: 'Enter name' })

if (p.isCancel(result)) {
  p.cancel('Cancelled')
  process.exit(0)
}

// Now result is guaranteed to be string, not symbol
```

### Confirmation Prompts

```typescript
const shouldProceed = await p.confirm({
  message: 'Skill already exists. Overwrite?',
  initialValue: false,
})

if (p.isCancel(shouldProceed) || !shouldProceed) {
  p.cancel('Aborted')
  process.exit(0)
}
```

---

## File System Patterns

### Path Helpers

```typescript
import { homedir } from 'os'
import { join } from 'path'

const expandPath = (path: string) =>
  path.startsWith('~') ? path.replace('~', homedir()) : path

const getLibraryPath = () => expandPath('~/.config/skillbook')

const getSkillsPath = () => join(getLibraryPath(), 'skills')
```

### Safe Directory Creation

```typescript
import { existsSync, mkdirSync } from 'fs'

const ensureDir = (path: string) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}
```

### Symlink Creation

```typescript
import { symlinkSync, existsSync, unlinkSync, lstatSync } from 'fs'
import { dirname } from 'path'

const createSymlink = (target: string, linkPath: string, force = false) => {
  ensureDir(dirname(linkPath))

  if (existsSync(linkPath)) {
    if (!force) {
      throw new Error(`Path already exists: ${linkPath}`)
    }
    // Remove existing file/symlink
    unlinkSync(linkPath)
  }

  symlinkSync(target, linkPath)
}
```

### Directory Scanning

```typescript
import { readdirSync } from 'fs'

const scanSkills = (libraryPath: string): string[] => {
  if (!existsSync(libraryPath)) return []

  return readdirSync(libraryPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}
```

---

## Error Handling

### User-Friendly Errors

```typescript
import * as p from '@clack/prompts'
import pc from 'picocolors'

const handleError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  p.log.error(pc.red(message))
  process.exit(1)
}

// Usage in commands
const run = async () => {
  try {
    await doSomething()
  } catch (error) {
    handleError(error)
  }
}
```

### Validation Errors

```typescript
const validateSkillPath = (path: string) => {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`)
  }

  if (!path.endsWith('.md')) {
    throw new Error('Skill file must be a .md file')
  }

  return true
}
```

---

## Output Formatting

### Colors with picocolors

```typescript
import pc from 'picocolors'

// Success
console.log(pc.green('✓ Skill added'))

// Error
console.log(pc.red('✗ Failed to add skill'))

// Info
console.log(pc.cyan('→ Processing...'))

// Dim for secondary info
console.log(pc.dim('Path: ~/.config/skillbook/skills/beads'))

// Bold for emphasis
console.log(pc.bold('skillbook v1.0.0'))

// Combine styles
console.log(pc.green(pc.bold('Success!')))
```

### Structured Output

```typescript
const printSkillList = (skills: SkillInfo[]) => {
  if (skills.length === 0) {
    p.log.warn('No skills found in library')
    return
  }

  p.log.info(`Found ${skills.length} skills:`)

  for (const skill of skills) {
    console.log(`  ${pc.cyan(skill.name)}`)
    if (skill.description) {
      console.log(`    ${pc.dim(skill.description)}`)
    }
  }
}
```

---

## Code Review Checklist

### Structure
- [ ] Commands are in separate files (`commands/*.ts`)
- [ ] Shared logic is in `lib/` directory
- [ ] Constants are centralized in `constants.ts`
- [ ] Types are in `types.ts` or colocated

### Clean Code
- [ ] Functions have single responsibility
- [ ] Early returns used to reduce nesting
- [ ] No magic strings/numbers (use constants)
- [ ] Names are descriptive and consistent
- [ ] No code duplication (DRY)

### CLI UX
- [ ] Clear error messages for users
- [ ] Cancellation handled gracefully (check `p.isCancel`)
- [ ] Spinners for long operations
- [ ] Success/failure clearly indicated
- [ ] Help text is accurate and helpful

### TypeScript
- [ ] No `any` types
- [ ] Explicit return types on public functions
- [ ] Proper null/undefined handling
- [ ] Types match runtime behavior

### File Operations
- [ ] Paths are properly joined (use `path.join`)
- [ ] Home directory expanded (`~`)
- [ ] Directories created before writing
- [ ] Symlinks created with proper targets

---

## Project Structure

```
src/
├── cli.ts              # Entry point, citty main command
├── commands/
│   ├── add.ts          # skillbook add
│   ├── init.ts         # skillbook init
│   └── list.ts         # skillbook list
├── lib/
│   ├── paths.ts        # Path utilities
│   ├── library.ts      # Library operations
│   └── symlinks.ts     # Symlink utilities
├── constants.ts        # Tool configs, defaults
└── types.ts            # Type definitions
```

---

## Before Committing

1. Run `bun run check` if available (lint + format)
2. Test commands manually
3. Check for `console.log` debug statements (remove them)
4. Verify error handling works
5. Ensure help text is accurate
