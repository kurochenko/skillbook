import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runCli } from '@/test-utils/cli'

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
    const cases = [
      {
        label: 'adds a skill from .claude/skills/<name>/SKILL.md',
        path: '.claude/skills/typescript/SKILL.md',
        content: '# TypeScript Skill\n\nBest practices for TypeScript.',
        args: (skillPath: string) => ['add', skillPath],
        expectedName: 'typescript',
      },
      {
        label: 'adds a skill from .cursor/rules/<name>.md',
        path: '.cursor/rules/react-patterns.md',
        content: '# React Patterns',
        args: (skillPath: string) => ['add', skillPath],
        expectedName: 'react-patterns',
      },
      {
        label: 'adds a skill with explicit --name',
        path: 'random/file.md',
        content: '# My Custom Skill',
        args: (skillPath: string) => ['add', skillPath, '--name', 'custom'],
        expectedName: 'custom',
      },
    ]

    for (const { label, path, content, args, expectedName } of cases) {
      test(label, () => {
        const skillPath = createSkillFile(path, content)

        const result = runCli(args(skillPath), env())

        expect(result.exitCode).toBe(0)
        expect(result.output).toContain(expectedName)
        expect(getLibrarySkill(expectedName)).toBe(content)
      })
    }
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
      expect(result.output).toContain('skillbook scan')
    })
  })
})
