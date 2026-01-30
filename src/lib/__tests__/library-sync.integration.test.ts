import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { addSkillToLibrary } from '@/lib/library'
import { syncSkillFromLibrary } from '@/lib/project-actions'
import { initSparseCheckout } from '@/lib/sparse-checkout'
import { runGit } from '@/test-utils/git'
import { withLibraryEnv } from '@/test-utils/env'

describe('library sync with origin', () => {
  let tempDir: string
  let originDir: string
  let libraryDir: string
  let projectDir: string
  let restoreEnv: (() => void) | null = null

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-sync-test-'))
    originDir = join(tempDir, 'origin')
    libraryDir = join(tempDir, 'library')
    projectDir = join(tempDir, 'project')

    mkdirSync(projectDir, { recursive: true })
    mkdirSync(join(projectDir, '.opencode', 'skill'), { recursive: true })

    restoreEnv = withLibraryEnv(libraryDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    restoreEnv?.()
  })

  const setupOrigin = () => {
    mkdirSync(originDir, { recursive: true })
    runGit(originDir, 'init', '--bare')
  }

  const setupLibraryWithOrigin = () => {
    mkdirSync(libraryDir, { recursive: true })
    runGit(libraryDir, 'init')
    runGit(libraryDir, 'config', 'user.email', 'test@test.com')
    runGit(libraryDir, 'config', 'user.name', 'Test')
    writeFileSync(join(libraryDir, 'README.md'), '# Library')
    runGit(libraryDir, 'add', '.')
    runGit(libraryDir, 'commit', '-m', 'Initial commit')
    runGit(libraryDir, 'remote', 'add', 'origin', originDir)
    runGit(libraryDir, 'push', '-u', 'origin', 'master')
  }

  const getOriginCommitCount = (): number => {
    const result = runGit(originDir, 'rev-list', '--count', 'HEAD')
    return parseInt(result.stdout.trim(), 10)
  }

  describe('push to library', () => {
    test('should push to origin when adding skill to library', async () => {
      setupOrigin()
      setupLibraryWithOrigin()

      const originCommitsBefore = getOriginCommitCount()
      expect(originCommitsBefore).toBe(1)

      await addSkillToLibrary('test-skill', '# Test Skill Content')

      const originCommitsAfter = getOriginCommitCount()

      expect(originCommitsAfter).toBeGreaterThan(originCommitsBefore)
    })

    test('should fail with clear error when library is behind origin', async () => {
      setupOrigin()
      setupLibraryWithOrigin()

      runGit(libraryDir, 'clone', originDir, join(tempDir, 'other-clone'))
      const otherClone = join(tempDir, 'other-clone')
      runGit(otherClone, 'config', 'user.email', 'other@test.com')
      runGit(otherClone, 'config', 'user.name', 'Other')
      
      mkdirSync(join(otherClone, 'skills', 'other-skill'), { recursive: true })
      writeFileSync(join(otherClone, 'skills', 'other-skill', 'SKILL.md'), '# Other Skill')
      runGit(otherClone, 'add', '.')
      runGit(otherClone, 'commit', '-m', 'Add other skill')
      runGit(otherClone, 'push', 'origin', 'master')

      const result = await addSkillToLibrary('test-skill', '# Test Skill Content')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toMatch(/behind origin|diverged/)
      }
    })
  })

  describe('sync from library', () => {
    test('should pull from origin before sparse-checkout when behind', async () => {
      setupOrigin()
      setupLibraryWithOrigin()

      await addSkillToLibrary('original-skill', '# Original')
      runGit(libraryDir, 'push', 'origin', 'master')

      const otherClone = join(tempDir, 'other-clone')
      runGit(libraryDir, 'clone', originDir, otherClone)
      runGit(otherClone, 'config', 'user.email', 'other@test.com')
      runGit(otherClone, 'config', 'user.name', 'Other')
      
      mkdirSync(join(otherClone, 'skills', 'new-remote-skill'), { recursive: true })
      writeFileSync(join(otherClone, 'skills', 'new-remote-skill', 'SKILL.md'), '# New Remote Skill')
      runGit(otherClone, 'add', '.')
      runGit(otherClone, 'commit', '-m', 'Add new remote skill')
      runGit(otherClone, 'push', 'origin', 'master')

      await initSparseCheckout(projectDir)

      const result = await syncSkillFromLibrary(projectDir, 'new-remote-skill')

      expect(result.success).toBe(true)
    })

    test('should auto-heal by pulling when library is behind origin', async () => {
      setupOrigin()
      setupLibraryWithOrigin()

      await addSkillToLibrary('test-skill', '# Version 1')
      runGit(libraryDir, 'push', 'origin', 'master')

      await initSparseCheckout(projectDir)
      
      const otherClone = join(tempDir, 'other-clone')
      runGit(libraryDir, 'clone', originDir, otherClone)
      runGit(otherClone, 'config', 'user.email', 'other@test.com')
      runGit(otherClone, 'config', 'user.name', 'Other')
      
      const skillPath = join(otherClone, 'skills', 'test-skill', 'SKILL.md')
      writeFileSync(skillPath, '# Version 2 - Updated remotely')
      runGit(otherClone, 'add', '.')
      runGit(otherClone, 'commit', '-m', 'Update skill remotely')
      runGit(otherClone, 'push', 'origin', 'master')

      const localSkillDir = join(projectDir, '.skillbook', 'skills', 'test-skill')
      mkdirSync(localSkillDir, { recursive: true })
      writeFileSync(join(localSkillDir, 'SKILL.md'), '# Version 1')
      symlinkSync(
        join('..', '..', '.skillbook', 'skills', 'test-skill'),
        join(projectDir, '.opencode', 'skill', 'test-skill')
      )

      const result = await syncSkillFromLibrary(projectDir, 'test-skill')

      expect(result.success).toBe(true)
      
      const localContent = readFileSync(join(projectDir, '.opencode', 'skill', 'test-skill', 'SKILL.md'), 'utf-8')
      expect(localContent).toBe('# Version 2 - Updated remotely')
    })
  })
})
