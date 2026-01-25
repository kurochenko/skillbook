import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import {
  initSparseCheckout,
  addToSparseCheckout,
  removeFromSparseCheckout,
  getSparseCheckoutSkills,
  isSkillbookInitialized,
} from '@/lib/sparse-checkout'

const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (result.status !== 0) {
    throw new Error(`Git failed: git ${args.join(' ')}\n${result.stderr}`)
  }
  return result
}

const createSkill = (libraryPath: string, skillName: string, content: string) => {
  const skillDir = join(libraryPath, 'skills', skillName)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), content)
}

const initLibraryRepo = (libraryPath: string) => {
  mkdirSync(libraryPath, { recursive: true })
  git(libraryPath, 'init')
  git(libraryPath, 'config', 'user.email', 'test@test.com')
  git(libraryPath, 'config', 'user.name', 'Test')
  writeFileSync(join(libraryPath, 'README.md'), '# Library')
  git(libraryPath, 'add', '.')
  git(libraryPath, 'commit', '-m', 'init')
}

describe('sparse-checkout', () => {
  let tempDir: string
  let libraryPath: string
  let projectPath: string
  let originalEnv: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sparse-checkout-test-'))
    libraryPath = join(tempDir, 'library')
    projectPath = join(tempDir, 'project')
    mkdirSync(projectPath, { recursive: true })

    originalEnv = process.env.SKILLBOOK_LIBRARY
    process.env.SKILLBOOK_LIBRARY = libraryPath
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    if (originalEnv !== undefined) {
      process.env.SKILLBOOK_LIBRARY = originalEnv
    } else {
      delete process.env.SKILLBOOK_LIBRARY
    }
  })

  describe('initSparseCheckout', () => {
    test('initializes .skillbook as sparse checkout', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      git(libraryPath, 'add', '.')
      git(libraryPath, 'commit', '-m', 'add skill')

      expect(isSkillbookInitialized(projectPath)).toBe(false)

      const result = await initSparseCheckout(projectPath)

      expect(result.success).toBe(true)
      expect(isSkillbookInitialized(projectPath)).toBe(true)
      expect(getSparseCheckoutSkills(projectPath)).toEqual([])
    })

    test('returns error when library does not exist', async () => {
      const result = await initSparseCheckout(projectPath)

      expect(result.success).toBe(false)
      expect(result.success === false && result.error).toContain('Library not found')
    })

    test('succeeds if already initialized', async () => {
      initLibraryRepo(libraryPath)

      await initSparseCheckout(projectPath)
      const result = await initSparseCheckout(projectPath)

      expect(result.success).toBe(true)
    })
  })

  describe('addToSparseCheckout', () => {
    test('adds skill to checkout', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      createSkill(libraryPath, 'skill-b', '# Skill B')
      git(libraryPath, 'add', '.')
      git(libraryPath, 'commit', '-m', 'add skills')

      await initSparseCheckout(projectPath)

      const result = await addToSparseCheckout(projectPath, 'skill-a')

      expect(result.success).toBe(true)
      expect(getSparseCheckoutSkills(projectPath)).toEqual(['skill-a'])
    })

    test('is idempotent', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      git(libraryPath, 'add', '.')
      git(libraryPath, 'commit', '-m', 'add skill')

      await initSparseCheckout(projectPath)
      await addToSparseCheckout(projectPath, 'skill-a')

      const result = await addToSparseCheckout(projectPath, 'skill-a')

      expect(result.success).toBe(true)
      expect(getSparseCheckoutSkills(projectPath)).toEqual(['skill-a'])
    })
  })

  describe('removeFromSparseCheckout', () => {
    test('removes skill from checkout', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      createSkill(libraryPath, 'skill-b', '# Skill B')
      git(libraryPath, 'add', '.')
      git(libraryPath, 'commit', '-m', 'add skills')

      await initSparseCheckout(projectPath)
      await addToSparseCheckout(projectPath, 'skill-a')
      await addToSparseCheckout(projectPath, 'skill-b')

      const result = await removeFromSparseCheckout(projectPath, 'skill-a')

      expect(result.success).toBe(true)
      expect(getSparseCheckoutSkills(projectPath)).toEqual(['skill-b'])
    })

    test('removing last skill leaves empty checkout', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      createSkill(libraryPath, 'skill-b', '# Skill B')
      git(libraryPath, 'add', '.')
      git(libraryPath, 'commit', '-m', 'add skills')

      await initSparseCheckout(projectPath)
      await addToSparseCheckout(projectPath, 'skill-a')
      await removeFromSparseCheckout(projectPath, 'skill-a')

      expect(getSparseCheckoutSkills(projectPath)).toEqual([])
    })

    test('is idempotent', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      git(libraryPath, 'add', '.')
      git(libraryPath, 'commit', '-m', 'add skill')

      await initSparseCheckout(projectPath)
      await addToSparseCheckout(projectPath, 'skill-a')
      await removeFromSparseCheckout(projectPath, 'skill-a')

      const result = await removeFromSparseCheckout(projectPath, 'skill-a')

      expect(result.success).toBe(true)
    })
  })
})
