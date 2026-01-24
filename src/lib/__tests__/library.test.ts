import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scanProjectSkills, addSkillToLibrary } from '../library.ts'

describe('scanProjectSkills', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string
  let originalEnv: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-scan-test-'))
    libraryDir = join(tempDir, 'library')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })

    originalEnv = process.env.SKILLBOOK_LIBRARY
    process.env.SKILLBOOK_LIBRARY = libraryDir
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    if (originalEnv !== undefined) {
      process.env.SKILLBOOK_LIBRARY = originalEnv
    } else {
      delete process.env.SKILLBOOK_LIBRARY
    }
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

    test('finds .claude/skills/*/SKILL.md', async () => {
      createProjectSkill('.claude/skills/typescript/SKILL.md', '# TS')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(1)
      expect(skills[0]!.name).toBe('typescript')
    })

    test('finds .cursor/rules/*.md', async () => {
      createProjectSkill('.cursor/rules/react.md', '# React')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(1)
      expect(skills[0]!.name).toBe('react')
    })

    test('finds .opencode/skill/*/SKILL.md', async () => {
      createProjectSkill('.opencode/skill/python/SKILL.md', '# Python')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(1)
      expect(skills[0]!.name).toBe('python')
    })

    test('finds skills from multiple locations', async () => {
      createProjectSkill('.claude/skills/skill-a/SKILL.md', '# A')
      createProjectSkill('.cursor/rules/skill-b.md', '# B')
      createProjectSkill('.opencode/skill/skill-c/SKILL.md', '# C')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(3)
      expect(skills.map((s) => s.name)).toEqual(['skill-a', 'skill-b', 'skill-c'])
    })

    test('returns all skills with same name and marks them as duplicates', async () => {
      createProjectSkill('.claude/skills/dupe/SKILL.md', '# Claude version')
      createProjectSkill('.cursor/rules/dupe.md', '# Cursor version')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(2)
      expect(skills.every((s) => s.name === 'dupe')).toBe(true)
      expect(skills.every((s) => s.hasDuplicates)).toBe(true)
    })

    test('marks non-duplicate skills with hasDuplicates: false', async () => {
      createProjectSkill('.claude/skills/unique/SKILL.md', '# Unique skill')

      const skills = await scanProjectSkills(projectDir)

      expect(skills).toHaveLength(1)
      expect(skills[0]!.hasDuplicates).toBe(false)
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
    test('marks skills not in library as "new"', async () => {
      createProjectSkill('.claude/skills/brand-new/SKILL.md', '# New skill')

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.status).toBe('new')
    })

    test('marks skills with identical content as "synced"', async () => {
      const content = '# Same content'
      createProjectSkill('.claude/skills/synced/SKILL.md', content)
      await addSkillToLibrary('synced', content)

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.status).toBe('synced')
    })

    test('marks skills with different content as "changed"', async () => {
      createProjectSkill('.claude/skills/changed/SKILL.md', '# Version 2')
      await addSkillToLibrary('changed', '# Version 1')

      const skills = await scanProjectSkills(projectDir)

      expect(skills[0]!.status).toBe('changed')
    })
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
})
