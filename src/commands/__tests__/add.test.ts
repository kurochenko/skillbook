import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const CLI_PATH = join(import.meta.dir, '../../cli.ts')

const runCli = (args: string[], env: Record<string, string> = {}) => {
  const result = spawnSync('bun', ['run', CLI_PATH, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  })

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
    output: result.stdout + result.stderr,
  }
}

describe('add command', () => {
  let tempDir: string
  let libraryDir: string
  let fixturesDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-test-'))
    libraryDir = join(tempDir, 'library')
    fixturesDir = join(tempDir, 'fixtures')
    mkdirSync(fixturesDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LIBRARY: libraryDir })

  const createSkillFile = (path: string, content: string) => {
    const fullPath = join(fixturesDir, path)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
    return fullPath
  }

  const getLibrarySkill = (name: string) => {
    const path = join(libraryDir, 'skills', name, 'SKILL.md')
    return existsSync(path) ? readFileSync(path, 'utf-8') : null
  }


  describe('basic functionality', () => {
    test('adds a skill from .claude/skills/<name>/SKILL.md', () => {
      const skillPath = createSkillFile(
        '.claude/skills/typescript/SKILL.md',
        '# TypeScript Skill\n\nBest practices for TypeScript.',
      )

      const result = runCli(['add', skillPath], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Added')
      expect(result.output).toContain('typescript')
      expect(getLibrarySkill('typescript')).toBe('# TypeScript Skill\n\nBest practices for TypeScript.')
    })

    test('adds a skill from .cursor/rules/<name>.md', () => {
      const skillPath = createSkillFile(
        '.cursor/rules/react-patterns.md',
        '# React Patterns',
      )

      const result = runCli(['add', skillPath], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('react-patterns')
      expect(getLibrarySkill('react-patterns')).toBe('# React Patterns')
    })

    test('adds a skill with explicit --name', () => {
      const skillPath = createSkillFile('random/file.md', '# My Custom Skill')

      const result = runCli(['add', skillPath, '--name', 'custom'], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('custom')
      expect(getLibrarySkill('custom')).toBe('# My Custom Skill')
    })
  })


  describe('library initialization', () => {
    test('creates library as git repo on first add', () => {
      const skillPath = createSkillFile('.claude/skills/test/SKILL.md', '# Test')

      runCli(['add', skillPath], env())

      expect(existsSync(join(libraryDir, '.git'))).toBe(true)
      expect(existsSync(join(libraryDir, '.gitignore'))).toBe(true)
    })

    test('creates commit for added skill', () => {
      const skillPath = createSkillFile('.claude/skills/test/SKILL.md', '# Test')

      const result = runCli(['add', skillPath], env())

      expect(result.output).toMatch(/commit: [a-f0-9]+/)
    })
  })


  describe('duplicate handling', () => {
    test('skips when content is identical', () => {
      const content = '# Same Content'
      const skillPath = createSkillFile('.claude/skills/dupe/SKILL.md', content)

      runCli(['add', skillPath], env())
      const result = runCli(['add', skillPath], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('already up to date')
      expect(result.output).toContain('skipped')
    })

    test('overwrites with --force when content differs', () => {
      const skillPath = createSkillFile('.claude/skills/updatable/SKILL.md', '# Version 1')
      runCli(['add', skillPath], env())

      writeFileSync(skillPath, '# Version 2')
      const result = runCli(['add', skillPath, '--force'], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Updated')
      expect(getLibrarySkill('updatable')).toBe('# Version 2')
    })
  })


  describe('error handling', () => {
    test('fails when file does not exist', () => {
      const result = runCli(['add', '/nonexistent/path.md'], env())

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('File not found')
    })

    test('fails when file is not .md', () => {
      const txtFile = join(fixturesDir, 'skill.txt')
      writeFileSync(txtFile, 'not markdown')

      const result = runCli(['add', txtFile], env())

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must be a .md file')
    })

    test('fails when skill name cannot be extracted and --name not provided', () => {
      const skillPath = createSkillFile('random/file.md', '# Content')

      const result = runCli(['add', skillPath], env())

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Cannot determine skill name')
      expect(result.output).toContain('--name')
    })

    test('fails with invalid --name', () => {
      const skillPath = createSkillFile('random/file.md', '# Content')

      const result = runCli(['add', skillPath, '--name', 'Invalid Name!'], env())

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Invalid skill name')
    })

    test('fails when extracted name is invalid', () => {
      const skillPath = createSkillFile('.claude/skills/-invalid/SKILL.md', '# Content')

      const result = runCli(['add', skillPath], env())

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('invalid')
    })
  })


  describe('path patterns', () => {
    const patterns = [
      { path: '.claude/skills/my-skill/SKILL.md', expected: 'my-skill' },
      { path: '.claude/skills/my_skill/SKILL.md', expected: 'my_skill' },
      { path: '.claude/skills/_private/SKILL.md', expected: '_private' },
      { path: '.cursor/rules/my-skill.md', expected: 'my-skill' },
      { path: '.opencode/skill/my-skill/SKILL.md', expected: 'my-skill' },
      { path: 'custom-skill/SKILL.md', expected: 'custom-skill' },
    ]

    for (const { path, expected } of patterns) {
      test(`extracts '${expected}' from ${path}`, () => {
        const skillPath = createSkillFile(path, `# Skill from ${path}`)

        const result = runCli(['add', skillPath], env())

        expect(result.exitCode).toBe(0)
        expect(getLibrarySkill(expected)).toBe(`# Skill from ${path}`)
      })
    }
  })


  describe('edge cases', () => {
    test('handles skill content with special characters', () => {
      const content = '# Skill\n\n`code blocks`\n\n```typescript\nconst x = 1;\n```\n\n- bullets\n- list'
      const skillPath = createSkillFile('.claude/skills/special/SKILL.md', content)

      runCli(['add', skillPath], env())

      expect(getLibrarySkill('special')).toBe(content)
    })

    test('handles empty skill file', () => {
      const skillPath = createSkillFile('.claude/skills/empty/SKILL.md', '')

      const result = runCli(['add', skillPath], env())

      expect(result.exitCode).toBe(0)
      expect(getLibrarySkill('empty')).toBe('')
    })

    test('handles skill name at max length (50 chars)', () => {
      const longName = 'a'.repeat(50)
      const skillPath = createSkillFile('random/file.md', '# Long name skill')

      const result = runCli(['add', skillPath, '--name', longName], env())

      expect(result.exitCode).toBe(0)
      expect(getLibrarySkill(longName)).toBe('# Long name skill')
    })

    test('handles skill name with numbers', () => {
      const skillPath = createSkillFile('random/file.md', '# Skill')

      const result = runCli(['add', skillPath, '--name', 'skill-v2'], env())

      expect(result.exitCode).toBe(0)
      expect(getLibrarySkill('skill-v2')).toBe('# Skill')
    })

    test('requires path when not using --bulk', () => {
      const result = runCli(['add'], env())

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Path is required')
      expect(result.output).toContain('--bulk')
    })
  })
})


describe('add --bulk command', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-bulk-test-'))
    libraryDir = join(tempDir, 'library')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LIBRARY: libraryDir })

  const createProjectSkill = (path: string, content: string) => {
    const fullPath = join(projectDir, path)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
    return fullPath
  }

  const runCliBulk = (args: string[] = []) => {
    const result = spawnSync('bun', ['run', CLI_PATH, 'add', '--bulk', ...args], {
      encoding: 'utf-8',
      env: { ...process.env, ...env() },
      cwd: projectDir,
      input: '\n',
    })

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? 1,
      output: result.stdout + result.stderr,
    }
  }


  describe('scanning', () => {
    test('reports no skills found in empty project', () => {
      const result = runCliBulk()

      expect(result.output).toContain('No skills found')
    })

    test('finds skills from .claude/skills/', () => {
      createProjectSkill('.claude/skills/typescript/SKILL.md', '# TS')

      const result = runCliBulk()

      expect(result.output).toContain('1 found in 1 projects')
    })

    test('finds skills from .cursor/rules/', () => {
      createProjectSkill('.cursor/rules/react.md', '# React')

      const result = runCliBulk()

      expect(result.output).toContain('1 found in 1 projects')
    })

    test('finds skills from .opencode/skill/', () => {
      createProjectSkill('.opencode/skill/python/SKILL.md', '# Python')

      const result = runCliBulk()

      expect(result.output).toContain('1 found in 1 projects')
    })

    test('finds skills from multiple locations', () => {
      createProjectSkill('.claude/skills/skill-a/SKILL.md', '# A')
      createProjectSkill('.cursor/rules/skill-b.md', '# B')
      createProjectSkill('.opencode/skill/skill-c/SKILL.md', '# C')

      const result = runCliBulk()

      expect(result.output).toContain('3 found in 1 projects')
    })

    test('detects duplicate skills across locations', () => {
      createProjectSkill('.claude/skills/dupe/SKILL.md', '# Claude version')
      createProjectSkill('.cursor/rules/dupe.md', '# Cursor version')

      const result = runCliBulk()

      expect(result.output).toContain('2 found in 1 projects')
      expect(result.output).toContain('multiple locations')
    })

    test('scans specified directory with --dir flag', () => {
      createProjectSkill('.claude/skills/remote-skill/SKILL.md', '# Remote')

      // Run from temp dir (not project dir) with --dir pointing to project
      const result = spawnSync('bun', ['run', CLI_PATH, 'add', '--bulk', '--dir', projectDir], {
        encoding: 'utf-8',
        env: { ...process.env, SKILLBOOK_LIBRARY: libraryDir },
        cwd: tempDir,
        input: '\n',
      })

      const output = result.stdout + result.stderr
      expect(output).toContain('1 found in 1 projects')
    })
  })
})
