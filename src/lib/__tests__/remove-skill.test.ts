import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync, lstatSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { removeFilesForSkill } from '@/lib/symlinks'
import { removeSkill } from '@/lib/project-actions'

describe('removeFilesForSkill', () => {
  let tempDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-remove-test-'))
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const createDetachedSkill = (name: string, content: string) => {
    const skillDir = join(projectDir, '.opencode', 'skill', name)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), content)
    return skillDir
  }

  const createDetachedCursorSkill = (name: string, content: string) => {
    const rulesDir = join(projectDir, '.cursor', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    const skillPath = join(rulesDir, `${name}.md`)
    writeFileSync(skillPath, content)
    return skillPath
  }

  const createSymlinkedSkill = (name: string) => {
    const skillbookDir = join(projectDir, '.SB', 'skills', name)
    mkdirSync(skillbookDir, { recursive: true })
    writeFileSync(join(skillbookDir, 'SKILL.md'), '# Test')

    const harnessDir = join(projectDir, '.opencode', 'skill')
    mkdirSync(harnessDir, { recursive: true })
    symlinkSync(join('..', '..', '.SB', 'skills', name), join(harnessDir, name))
    return join(harnessDir, name)
  }

  test('removes detached skill directory (opencode harness)', () => {
    const skillDir = createDetachedSkill('test-skill', '# Test')
    expect(existsSync(skillDir)).toBe(true)

    const result = removeFilesForSkill(projectDir, ['opencode'], 'test-skill')

    expect(result.success).toBe(true)
    expect(existsSync(skillDir)).toBe(false)
  })

  test('removes detached skill file (cursor harness)', () => {
    const skillPath = createDetachedCursorSkill('test-skill', '# Test')
    expect(existsSync(skillPath)).toBe(true)

    const result = removeFilesForSkill(projectDir, ['cursor'], 'test-skill')

    expect(result.success).toBe(true)
    expect(existsSync(skillPath)).toBe(false)
  })

  test('removes from multiple harnesses', () => {
    const opencodeDir = createDetachedSkill('test-skill', '# Test')
    const cursorPath = createDetachedCursorSkill('test-skill', '# Test')

    expect(existsSync(opencodeDir)).toBe(true)
    expect(existsSync(cursorPath)).toBe(true)

    const result = removeFilesForSkill(projectDir, ['opencode', 'cursor'], 'test-skill')

    expect(result.success).toBe(true)
    expect(existsSync(opencodeDir)).toBe(false)
    expect(existsSync(cursorPath)).toBe(false)
  })

  test('fails when path is a symlink', () => {
    const symlinkPath = createSymlinkedSkill('test-skill')
    expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true)

    const result = removeFilesForSkill(projectDir, ['opencode'], 'test-skill')

    expect(result.success).toBe(false)
    expect(result.error).toContain('symlink')
    expect(existsSync(symlinkPath)).toBe(true)
  })

  test('succeeds when skill does not exist', () => {
    const result = removeFilesForSkill(projectDir, ['opencode'], 'nonexistent')

    expect(result.success).toBe(true)
  })
})

describe('removeSkill', () => {
  let tempDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-remove-skill-test-'))
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const createDetachedSkill = (name: string, content: string) => {
    const harnessDir = join(projectDir, '.opencode', 'skill', name)
    mkdirSync(harnessDir, { recursive: true })
    writeFileSync(join(harnessDir, 'SKILL.md'), content)
    return harnessDir
  }

  test('removes harness files when skillbook is not initialized', async () => {
    const harnessDir = createDetachedSkill('test-skill', '# Test')
    expect(existsSync(harnessDir)).toBe(true)

    const result = await removeSkill(projectDir, 'test-skill')

    expect(result.success).toBe(true)
    expect(existsSync(harnessDir)).toBe(false)
  })

  test('removes from multiple harnesses', async () => {
    const opencodeDir = join(projectDir, '.opencode', 'skill', 'test-skill')
    mkdirSync(opencodeDir, { recursive: true })
    writeFileSync(join(opencodeDir, 'SKILL.md'), '# Test')

    const cursorPath = join(projectDir, '.cursor', 'rules', 'test-skill.md')
    mkdirSync(join(projectDir, '.cursor', 'rules'), { recursive: true })
    writeFileSync(cursorPath, '# Test')

    expect(existsSync(opencodeDir)).toBe(true)
    expect(existsSync(cursorPath)).toBe(true)

    const result = await removeSkill(projectDir, 'test-skill')

    expect(result.success).toBe(true)
    expect(existsSync(opencodeDir)).toBe(false)
    expect(existsSync(cursorPath)).toBe(false)
  })
})
