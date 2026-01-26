import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  initSparseCheckout,
  addToSparseCheckout,
  removeFromSparseCheckout,
  getSparseCheckoutSkills,
  isSkillbookInitialized,
} from '@/lib/sparse-checkout'
import { runGit } from '@/test-utils/git'
import { withLibraryEnv } from '@/test-utils/env'

const createSkill = (libraryPath: string, skillName: string, content: string) => {
  const skillDir = join(libraryPath, 'skills', skillName)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), content)
}

const initLibraryRepo = (libraryPath: string) => {
  mkdirSync(libraryPath, { recursive: true })
  runGit(libraryPath, 'init')
  runGit(libraryPath, 'config', 'user.email', 'test@test.com')
  runGit(libraryPath, 'config', 'user.name', 'Test')
  writeFileSync(join(libraryPath, 'README.md'), '# Library')
  runGit(libraryPath, 'add', '.')
  runGit(libraryPath, 'commit', '-m', 'init')
}

describe('sparse-checkout', () => {
  let tempDir: string
  let libraryPath: string
  let projectPath: string
  let restoreEnv: (() => void) | null = null

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sparse-checkout-test-'))
    libraryPath = join(tempDir, 'library')
    projectPath = join(tempDir, 'project')
    mkdirSync(projectPath, { recursive: true })

    restoreEnv = withLibraryEnv(libraryPath)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    restoreEnv?.()
  })

  describe('initSparseCheckout', () => {
    test('initializes .skillbook as sparse checkout', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skill')

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
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skills')

      await initSparseCheckout(projectPath)

      const result = await addToSparseCheckout(projectPath, 'skill-a')

      expect(result.success).toBe(true)
      expect(getSparseCheckoutSkills(projectPath)).toEqual(['skill-a'])
    })

    test('is idempotent', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skill')

      await initSparseCheckout(projectPath)
      await addToSparseCheckout(projectPath, 'skill-a')

      const result = await addToSparseCheckout(projectPath, 'skill-a')

      expect(result.success).toBe(true)
      expect(getSparseCheckoutSkills(projectPath)).toEqual(['skill-a'])
    })

    test('pulls latest library before checkout', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skill-a')

      await initSparseCheckout(projectPath)

      createSkill(libraryPath, 'skill-new', '# Skill New')
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skill-new')

      const result = await addToSparseCheckout(projectPath, 'skill-new')

      expect(result.success).toBe(true)
      expect(getSparseCheckoutSkills(projectPath)).toEqual(['skill-new'])
    })

    test('adds new skill when checkout is dirty', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skill-a')

      await initSparseCheckout(projectPath)
      await addToSparseCheckout(projectPath, 'skill-a')

      const dirtyPath = join(projectPath, '.skillbook', 'skills', 'skill-a', 'SKILL.md')
      writeFileSync(dirtyPath, '# Skill A (local edit)')

      createSkill(libraryPath, 'skill-new', '# Skill New')
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skill-new')

      const result = await addToSparseCheckout(projectPath, 'skill-new')

      expect(result.success).toBe(true)
      expect(readFileSync(dirtyPath, 'utf-8')).toBe('# Skill A (local edit)')
      expect(getSparseCheckoutSkills(projectPath)).toEqual(['skill-a', 'skill-new'])
    })
  })

  describe('removeFromSparseCheckout', () => {
    test('removes skill from checkout', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      createSkill(libraryPath, 'skill-b', '# Skill B')
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skills')

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
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skills')

      await initSparseCheckout(projectPath)
      await addToSparseCheckout(projectPath, 'skill-a')
      await removeFromSparseCheckout(projectPath, 'skill-a')

      expect(getSparseCheckoutSkills(projectPath)).toEqual([])
    })

    test('is idempotent', async () => {
      initLibraryRepo(libraryPath)
      createSkill(libraryPath, 'skill-a', '# Skill A')
      runGit(libraryPath, 'add', '.')
      runGit(libraryPath, 'commit', '-m', 'add skill')

      await initSparseCheckout(projectPath)
      await addToSparseCheckout(projectPath, 'skill-a')
      await removeFromSparseCheckout(projectPath, 'skill-a')

      const result = await removeFromSparseCheckout(projectPath, 'skill-a')

      expect(result.success).toBe(true)
    })
  })
})
