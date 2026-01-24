import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readlinkSync, lstatSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const CLI_PATH = join(import.meta.dir, '../../cli.ts')

describe('init command', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-init-test-'))
    libraryDir = join(tempDir, 'library')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LIBRARY: libraryDir })

  const createLibrarySkill = (name: string, content: string = '# Skill') => {
    const skillDir = join(libraryDir, 'skills', name)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), content)
  }

  const runCli = (args: string[]) => {
    const result = spawnSync('bun', ['run', CLI_PATH, 'init', '-d', projectDir, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, ...env() },
    })

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? 1,
      output: result.stdout + result.stderr,
    }
  }

  const getSymlinkTarget = (path: string): string | null => {
    const fullPath = join(projectDir, path)
    try {
      if (lstatSync(fullPath).isSymbolicLink()) {
        return readlinkSync(fullPath)
      }
    } catch {
      return null
    }
    return null
  }


  describe('validation', () => {
    test('shows error for unknown skill', () => {
      createLibrarySkill('typescript')

      const result = runCli(['--skill', 'nonexistent', '--tool', 'claude-code'])

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Unknown skill')
      expect(result.output).toContain('nonexistent')
    })

    test('shows error for unknown tool', () => {
      createLibrarySkill('typescript')

      const result = runCli(['--skill', 'typescript', '--tool', 'invalid-tool'])

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('Unknown tool')
      expect(result.output).toContain('invalid-tool')
    })
  })


  describe('claude-code tool', () => {
    test('creates symlink to .claude/skills/<name>/SKILL.md', () => {
      createLibrarySkill('typescript', '# TS Skill')

      const result = runCli(['--skill', 'typescript', '--tool', 'claude-code'])

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Created')
      expect(result.output).toContain('.claude/skills/typescript/SKILL.md')

      const target = getSymlinkTarget('.claude/skills/typescript/SKILL.md')
      expect(target).not.toBeNull()
      expect(target).toContain('library/skills/typescript/SKILL.md')
    })
  })


  describe('cursor tool', () => {
    test('creates symlink to .cursor/rules/<name>.md', () => {
      createLibrarySkill('react', '# React Skill')

      const result = runCli(['--skill', 'react', '--tool', 'cursor'])

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Created')
      expect(result.output).toContain('.cursor/rules/react.md')

      const target = getSymlinkTarget('.cursor/rules/react.md')
      expect(target).not.toBeNull()
      expect(target).toContain('library/skills/react/SKILL.md')
    })
  })


  describe('opencode tool', () => {
    test('creates symlink to .opencode/skill/<name>/SKILL.md', () => {
      createLibrarySkill('python', '# Python Skill')

      const result = runCli(['--skill', 'python', '--tool', 'opencode'])

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Created')
      expect(result.output).toContain('.opencode/skill/python/SKILL.md')

      const target = getSymlinkTarget('.opencode/skill/python/SKILL.md')
      expect(target).not.toBeNull()
      expect(target).toContain('library/skills/python/SKILL.md')
    })
  })


  describe('multiple tools', () => {
    test('creates symlinks for all specified tools', () => {
      createLibrarySkill('beads', '# Beads Skill')

      const result = runCli(['--skill', 'beads', '--tool', 'claude-code,cursor,opencode'])

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Created 3 symlinks')
      expect(result.output).toContain('.claude/skills/beads/SKILL.md')
      expect(result.output).toContain('.cursor/rules/beads.md')
      expect(result.output).toContain('.opencode/skill/beads/SKILL.md')
    })
  })


  describe('multiple skills', () => {
    test('creates symlinks for all specified skills', () => {
      createLibrarySkill('typescript')
      createLibrarySkill('react')

      const result = runCli(['--skill', 'typescript,react', '--tool', 'claude-code'])

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Created 2 symlinks')
      expect(result.output).toContain('.claude/skills/typescript/SKILL.md')
      expect(result.output).toContain('.claude/skills/react/SKILL.md')
    })
  })


  describe('idempotent behavior', () => {
    test('reports already existing symlinks as up to date', () => {
      createLibrarySkill('typescript')

      // First run
      runCli(['--skill', 'typescript', '--tool', 'claude-code'])

      // Second run
      const result = runCli(['--skill', 'typescript', '--tool', 'claude-code'])

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('already up to date')
    })

    test('updates symlink when target changes', async () => {
      createLibrarySkill('typescript')

      // Create initial symlink pointing elsewhere
      const symlinkDir = join(projectDir, '.claude/skills/typescript')
      mkdirSync(symlinkDir, { recursive: true })
      const { symlinkSync } = await import('fs')
      symlinkSync('/some/other/path', join(symlinkDir, 'SKILL.md'))

      // Run init - should update to point to library
      const result = runCli(['--skill', 'typescript', '--tool', 'claude-code'])

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Updated')

      const target = getSymlinkTarget('.claude/skills/typescript/SKILL.md')
      expect(target).toContain('library/skills/typescript/SKILL.md')
    })
  })


  describe('conflict handling', () => {
    test('fails when regular file exists at symlink location', () => {
      createLibrarySkill('typescript')

      // Create a regular file where symlink would go
      const conflictPath = join(projectDir, '.claude/skills/typescript')
      mkdirSync(conflictPath, { recursive: true })
      writeFileSync(join(conflictPath, 'SKILL.md'), '# Existing file')

      const result = runCli(['--skill', 'typescript', '--tool', 'claude-code'])

      expect(result.output).toContain('Failed')
      expect(result.output).toContain('not a symlink')
    })
  })


  describe('relative paths', () => {
    test('creates relative symlinks, not absolute', () => {
      createLibrarySkill('typescript')

      runCli(['--skill', 'typescript', '--tool', 'claude-code'])

      const target = getSymlinkTarget('.claude/skills/typescript/SKILL.md')
      expect(target).not.toBeNull()
      // Should be relative, not absolute
      expect(target).not.toMatch(/^\//)
      expect(target).toContain('..')
    })
  })


  describe('directory flag', () => {
    test('creates symlinks in specified directory', () => {
      createLibrarySkill('typescript')
      const customDir = join(tempDir, 'custom-project')
      mkdirSync(customDir, { recursive: true })

      const result = spawnSync(
        'bun',
        ['run', CLI_PATH, 'init', '-d', customDir, '--skill', 'typescript', '--tool', 'claude-code'],
        {
          encoding: 'utf-8',
          env: { ...process.env, ...env() },
        },
      )

      const output = result.stdout + result.stderr
      expect(output).toContain('Created')

      // Check symlink was created in custom dir
      const symlinkPath = join(customDir, '.claude/skills/typescript/SKILL.md')
      expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true)
    })
  })
})
