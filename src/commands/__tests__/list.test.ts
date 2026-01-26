import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runCli } from '@/test-utils/cli'

describe('list command', () => {
  let tempDir: string
  let libraryDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-list-test-'))
    libraryDir = join(tempDir, 'library')
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


  describe('empty library', () => {
    test('shows message when library does not exist', () => {
      const result = runCli(['list'], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('No skills library found')
      expect(result.output).toContain('skillbook add')
    })

    test('shows message when library exists but has no skills', () => {
      mkdirSync(join(libraryDir, 'skills'), { recursive: true })

      const result = runCli(['list'], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('No skills in the library')
    })
  })


  describe('with skills', () => {
    test('lists single skill', () => {
      createLibrarySkill('typescript')

      const result = runCli(['list'], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Available skills')
      expect(result.output).toContain('typescript')
      expect(result.output).toContain('1 skill')
    })

    test('lists multiple skills alphabetically', () => {
      createLibrarySkill('zod')
      createLibrarySkill('react')
      createLibrarySkill('typescript')

      const result = runCli(['list'], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('react')
      expect(result.output).toContain('typescript')
      expect(result.output).toContain('zod')
      expect(result.output).toContain('3 skills')

      const reactPos = result.output.indexOf('react')
      const tsPos = result.output.indexOf('typescript')
      const zodPos = result.output.indexOf('zod')
      expect(reactPos).toBeLessThan(tsPos)
      expect(tsPos).toBeLessThan(zodPos)
    })

    test('only lists directories with SKILL.md', () => {
      createLibrarySkill('valid-skill')
      mkdirSync(join(libraryDir, 'skills', 'invalid-dir'), { recursive: true })
      writeFileSync(join(libraryDir, 'skills', 'invalid-dir', 'README.md'), '# Not a skill')

      const result = runCli(['list'], env())

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('valid-skill')
      expect(result.output).not.toContain('invalid-dir')
      expect(result.output).toContain('1 skill')
    })

    test('shows library path in output', () => {
      createLibrarySkill('test-skill')

      const result = runCli(['list'], env())

      expect(result.output).toContain(libraryDir)
    })
  })
})
