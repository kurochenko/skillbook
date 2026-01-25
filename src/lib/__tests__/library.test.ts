import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scanProjectSkills, addSkillToLibrary, type ScanSkillStatus } from '@/lib/library'
import { withLibraryEnv } from '@/test-utils/env'

describe('scanProjectSkills', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string
  let restoreEnv: (() => void) | null = null

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-scan-test-'))
    libraryDir = join(tempDir, 'library')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })

    restoreEnv = withLibraryEnv(libraryDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    restoreEnv?.()
  })

  const createProjectSkill = (path: string, content: string) => {
    const fullPath = join(projectDir, path)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }


  describe('finding skills', () => {
    test('returns empty array for empty project', async () => {
      const skills = await scanProjectSkills(projectDir)
      expect(skills).toEqual([])
    })

    const singleSkillCases = [
      {
        label: 'finds .claude/skills/*/SKILL.md',
        path: '.claude/skills/typescript/SKILL.md',
        name: 'typescript',
      },
      {
        label: 'finds .cursor/rules/*.md',
        path: '.cursor/rules/react.md',
        name: 'react',
      },
      {
        label: 'finds .opencode/skill/*/SKILL.md',
        path: '.opencode/skill/python/SKILL.md',
        name: 'python',
      },
    ]

    for (const { label, path, name } of singleSkillCases) {
      test(label, async () => {
        createProjectSkill(path, '# Content')

        const skills = await scanProjectSkills(projectDir)

        expect(skills).toHaveLength(1)
        expect(skills[0]!.name).toBe(name)
      })
    }

    test('finds skills from multiple locations', async () => {
      createProjectSkill('.claude/skills/skill-a/SKILL.md', '# A')
      createProjectSkill('.cursor/rules/skill-b.md', '# B')
      createProjectSkill('.opencode/skill/skill-c/SKILL.md', '# C')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(3)
      expect(skills.map((s) => s.name)).toEqual(['skill-a', 'skill-b', 'skill-c'])
    })

    test('marks skills with same name but different content as conflicts', async () => {
      createProjectSkill('.claude/skills/dupe/SKILL.md', '# Claude version')
      createProjectSkill('.cursor/rules/dupe.md', '# Cursor version')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(2)
      expect(skills.every((s) => s.name === 'dupe')).toBe(true)
      expect(skills.every((s) => s.hasConflict)).toBe(true)
      expect(skills.every((s) => s.conflictCount === 2)).toBe(true)
    })

    test('marks skills with same name and same content as non-conflict', async () => {
      createProjectSkill('.claude/skills/dupe/SKILL.md', '# Same content')
      createProjectSkill('.cursor/rules/dupe.md', '# Same content')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(2)
      expect(skills.every((s) => s.name === 'dupe')).toBe(true)
      expect(skills.every((s) => s.hasConflict)).toBe(false)
      expect(skills.every((s) => s.conflictCount === 0)).toBe(true)
    })

    test('marks unique skills as non-conflict', async () => {
      createProjectSkill('.claude/skills/unique/SKILL.md', '# Unique skill')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(1)
      expect(skills[0]!.hasConflict).toBe(false)
      expect(skills[0]!.conflictCount).toBe(0)
    })

    test('returns skills sorted by name', async () => {
      createProjectSkill('.claude/skills/zebra/SKILL.md', '# Z')
      createProjectSkill('.claude/skills/alpha/SKILL.md', '# A')
      createProjectSkill('.claude/skills/middle/SKILL.md', '# M')

      const skills = await scanProjectSkills(projectDir)

      expect(skills.map((s) => s.name)).toEqual(['alpha', 'middle', 'zebra'])
    })

    test('skips files with invalid skill names', async () => {
      createProjectSkill('.claude/skills/valid-name/SKILL.md', '# Valid')
      createProjectSkill('.claude/skills/-invalid/SKILL.md', '# Invalid')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(1)
      expect(skills[0]!.name).toBe('valid-name')
    })
  })


  describe('status detection', () => {
    const statusCases: Array<{
      label: string
      name: string
      projectContent: string
      libraryContent: string | null
      expected: ScanSkillStatus
    }> = [
      {
        label: 'marks skills not in library as "detached"',
        name: 'brand-new',
        projectContent: '# New skill',
        libraryContent: null,
        expected: 'detached',
      },
      {
        label: 'marks skills with identical content as "synced"',
        name: 'synced',
        projectContent: '# Same content',
        libraryContent: '# Same content',
        expected: 'synced',
      },
      {
        label: 'marks skills with different content as "ahead"',
        name: 'changed',
        projectContent: '# Version 2',
        libraryContent: '# Version 1',
        expected: 'ahead',
      },
    ]

    for (const { label, name, projectContent, libraryContent, expected } of statusCases) {
      test(label, async () => {
        createProjectSkill(`.claude/skills/${name}/SKILL.md`, projectContent)
        if (libraryContent !== null) {
          await addSkillToLibrary(name, libraryContent)
        }

        const skills = await scanProjectSkills(projectDir)

        expect(skills[0]!.status).toBe(expected)
      })
    }
  })


  describe('content loading', () => {
    test('includes file content in result', async () => {
      const content = '# My Skill\n\nWith detailed instructions.'
      createProjectSkill('.claude/skills/detailed/SKILL.md', content)

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.content).toBe(content)
    })

    test('includes absolute path in result', async () => {
      createProjectSkill('.claude/skills/pathed/SKILL.md', '# Test')

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.path).toContain(projectDir)
      expect(skills[0]!.path).toContain('.claude/skills/pathed/SKILL.md')
    })

    test('includes project name in result', async () => {
      createProjectSkill('.claude/skills/test-skill/SKILL.md', '# Test')

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.project).toBe('project')
    })
  })


  describe('diff calculation', () => {
    test('calculates additions correctly', async () => {
      await addSkillToLibrary('diff-test', '# Original')
      createProjectSkill('.claude/skills/diff-test/SKILL.md', '# Original\nLine 2\nLine 3')

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.diff).not.toBeNull()
      expect(skills[0]!.diff!.additions).toBe(2)
      expect(skills[0]!.diff!.deletions).toBe(0)
    })

    test('calculates deletions correctly', async () => {
      await addSkillToLibrary('diff-test', '# Original\nLine 2\nLine 3')
      createProjectSkill('.claude/skills/diff-test/SKILL.md', '# Original')

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.diff).not.toBeNull()
      expect(skills[0]!.diff!.additions).toBe(0)
      expect(skills[0]!.diff!.deletions).toBe(2)
    })

    test('calculates mixed changes correctly', async () => {
      await addSkillToLibrary('diff-test', '# Original\nOld line')
      createProjectSkill('.claude/skills/diff-test/SKILL.md', '# Original\nNew line\nExtra line')

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.diff).not.toBeNull()
      expect(skills[0]!.diff!.additions).toBe(2) // 'New line' and 'Extra line'
      expect(skills[0]!.diff!.deletions).toBe(1) // 'Old line'
    })

    test('returns null diff for new skills', async () => {
      createProjectSkill('.claude/skills/brand-new/SKILL.md', '# New skill')

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.diff).toBeNull()
    })

    test('returns null diff for synced skills', async () => {
      const content = '# Same'
      await addSkillToLibrary('synced', content)
      createProjectSkill('.claude/skills/synced/SKILL.md', content)

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.diff).toBeNull()
    })
  })


  describe('conflict scenarios', () => {
    test('multiple synced skills have no conflict', async () => {
      const content = '# Same content'
      await addSkillToLibrary('shared', content)
      createProjectSkill('.claude/skills/shared/SKILL.md', content)
      createProjectSkill('.cursor/rules/shared.md', content)

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(2)
      expect(skills.every((s) => s.status === 'synced')).toBe(true)
      expect(skills.every((s) => !s.hasConflict)).toBe(true)
    })

    test('multiple changed skills with same changes have no conflict', async () => {
      await addSkillToLibrary('shared', '# V1')
      createProjectSkill('.claude/skills/shared/SKILL.md', '# V2')
      createProjectSkill('.cursor/rules/shared.md', '# V2')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(2)
      expect(skills.every((s) => s.status === 'ahead')).toBe(true)
      expect(skills.every((s) => !s.hasConflict)).toBe(true)
    })

    test('multiple changed skills with different changes have conflict', async () => {
      await addSkillToLibrary('shared', '# V1')
      createProjectSkill('.claude/skills/shared/SKILL.md', '# V2-claude')
      createProjectSkill('.cursor/rules/shared.md', '# V2-cursor')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(2)
      expect(skills.every((s) => s.status === 'ahead')).toBe(true)
      expect(skills.every((s) => s.hasConflict)).toBe(true)
      expect(skills.every((s) => s.conflictCount === 2)).toBe(true)
    })

    test('mix of synced and changed shows conflict only for changed', async () => {
      const libraryContent = '# Library version'
      await addSkillToLibrary('shared', libraryContent)
      createProjectSkill('.claude/skills/shared/SKILL.md', libraryContent) // synced
      createProjectSkill('.cursor/rules/shared.md', '# Different version') // changed (ahead)

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(2)
      const synced = skills.find((s) => s.status === 'synced')
      const ahead = skills.find((s) => s.status === 'ahead')
      expect(synced!.hasConflict).toBe(false)
      expect(ahead!.hasConflict).toBe(false) // Only 1 ahead item, no conflict
    })

    test('three versions shows conflictCount of 3', async () => {
      createProjectSkill('.claude/skills/multi/SKILL.md', '# Version A')
      createProjectSkill('.cursor/rules/multi.md', '# Version B')
      createProjectSkill('.opencode/skill/multi/SKILL.md', '# Version C')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(3)
      expect(skills.every((s) => s.hasConflict)).toBe(true)
      expect(skills.every((s) => s.conflictCount === 3)).toBe(true)
    })
  })
})
