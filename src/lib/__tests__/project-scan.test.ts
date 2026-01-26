import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getProjectSkills } from '@/lib/project-scan'
import { addSkillToLibrary } from '@/lib/library'
import { withLibraryEnv } from '@/test-utils/env'

describe('getProjectSkills', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string
  let restoreEnv: (() => void) | null = null

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-project-scan-test-'))
    libraryDir = join(tempDir, 'library')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
    mkdirSync(join(projectDir, '.skillbook', 'skills'), { recursive: true })

    restoreEnv = withLibraryEnv(libraryDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    restoreEnv?.()
  })

  const createSymlinkedSkill = async (name: string, libraryContent: string, localContent: string) => {
    await addSkillToLibrary(name, libraryContent)

    const localSkillDir = join(projectDir, '.skillbook', 'skills', name)
    mkdirSync(localSkillDir, { recursive: true })
    writeFileSync(join(localSkillDir, 'SKILL.md'), localContent)

    const harnessSkillDir = join(projectDir, '.opencode', 'skill', name)
    mkdirSync(join(projectDir, '.opencode', 'skill'), { recursive: true })
    symlinkSync(join('..', '..', '.skillbook', 'skills', name), harnessSkillDir)
  }

  describe('sync status for symlinked skills', () => {
    test('shows "ok" when local content matches library', async () => {
      const content = '# Same content'
      await createSymlinkedSkill('test-skill', content, content)

      const { installed } = getProjectSkills(projectDir)

      expect(installed).toHaveLength(1)
      expect(installed[0]!.status).toBe('ok')
    })

    test('shows "ahead" when local has MORE content than library', async () => {
      const libraryContent = '# Original'
      const localContent = '# Original\nNew line added locally'
      await createSymlinkedSkill('test-skill', libraryContent, localContent)

      const { installed } = getProjectSkills(projectDir)

      expect(installed).toHaveLength(1)
      expect(installed[0]!.status).toBe('ahead')
      expect(installed[0]!.diff!.additions).toBeGreaterThan(installed[0]!.diff!.deletions)
    })

    test('shows "behind" when library has MORE content than local', async () => {
      const libraryContent = '# Original\nNew line added in library'
      const localContent = '# Original'
      await createSymlinkedSkill('test-skill', libraryContent, localContent)

      const { installed } = getProjectSkills(projectDir)

      expect(installed).toHaveLength(1)
      expect(installed[0]!.status).toBe('behind')
      expect(installed[0]!.diff!.deletions).toBeGreaterThan(installed[0]!.diff!.additions)
    })

    test('shows "ahead" when changes are equal but content differs', async () => {
      const libraryContent = '# Version A'
      const localContent = '# Version B'
      await createSymlinkedSkill('test-skill', libraryContent, localContent)

      const { installed } = getProjectSkills(projectDir)

      expect(installed).toHaveLength(1)
      expect(installed[0]!.status).toBe('ahead')
    })
  })
})
