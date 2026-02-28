import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { runCli } from '@/test-utils/cli'
import { SKILL_FILE } from '@/constants'
import { getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

type FileDiffEntry = {
  file: string
  status: 'added' | 'removed' | 'changed' | 'unchanged'
  additions: number
  deletions: number
}

type DiffOutput = {
  id: string
  from: 'library' | 'project'
  to: 'library' | 'project'
  additions: number
  deletions: number
  identical?: boolean
  files?: FileDiffEntry[]
}

describe('diff command (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-diff-'))
    libraryDir = join(tempDir, '.skillbook')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LOCK_LIBRARY: libraryDir })

  const writeSkill = (root: string, skillId: string, content: string) => {
    const skillDir = join(getLockSkillsPath(root), skillId)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, SKILL_FILE), content, 'utf-8')
  }

  const parseJson = (output: string) => JSON.parse(output) as DiffOutput

  const writeSkillFiles = (root: string, skillId: string, files: Record<string, string>) => {
    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = join(getLockSkillsPath(root), skillId, relativePath)
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, content, 'utf-8')
    }
  }

  test('diff reports additions and deletions between library and project', () => {
    const libraryContent = 'Line 1\nLine 2\n'
    const projectContent = 'Line 1\nLine 3\n'

    writeSkill(libraryDir, 'alpha', libraryContent)
    writeSkill(getProjectLockRoot(projectDir), 'alpha', projectContent)

    const result = runCli(
      ['diff', 'alpha', '--project', projectDir, '--from', 'library', '--to', 'project', '--json'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.id).toBe('alpha')
    expect(data.from).toBe('library')
    expect(data.to).toBe('project')
    expect(data.additions).toBe(1)
    expect(data.deletions).toBe(1)
  })

  test('diff with multi-file skills shows SKILL.md diff by default in JSON', () => {
    const libraryFiles = {
      [SKILL_FILE]: 'Line 1\nLine 2\n',
      'extra.md': '# Extra\n',
    }
    const projectFiles = {
      [SKILL_FILE]: 'Line 1\nLine 3\n',
      'extra.md': '# Extra Modified\n',
    }

    writeSkillFiles(libraryDir, 'multi', libraryFiles)
    writeSkillFiles(getProjectLockRoot(projectDir), 'multi', projectFiles)

    const result = runCli(
      ['diff', 'multi', '--project', projectDir, '--json'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.additions).toBe(1)
    expect(data.deletions).toBe(1)
  })

  test('diff JSON output includes file-level details', () => {
    const libraryFiles = {
      [SKILL_FILE]: '# Skill\n',
      'scripts/deploy.sh': '#!/bin/bash\nold\n',
    }
    const projectFiles = {
      [SKILL_FILE]: '# Skill Updated\n',
      'scripts/deploy.sh': '#!/bin/bash\nnew\n',
    }

    writeSkillFiles(libraryDir, 'detailed', libraryFiles)
    writeSkillFiles(getProjectLockRoot(projectDir), 'detailed', projectFiles)

    const result = runCli(
      ['diff', 'detailed', '--project', projectDir, '--json'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.files).toBeDefined()
    expect(data.files!.length).toBeGreaterThan(0)

    const skillFile = data.files!.find(f => f.file === SKILL_FILE)
    expect(skillFile).toBeDefined()
    expect(skillFile!.status).toBe('changed')
  })

  test('diff with identical multi-file skills shows no changes', () => {
    const files = {
      [SKILL_FILE]: '# Identical\n',
      'extra.md': '# Same\n',
    }

    writeSkillFiles(libraryDir, 'identical', files)
    writeSkillFiles(getProjectLockRoot(projectDir), 'identical', files)

    const result = runCli(
      ['diff', 'identical', '--project', projectDir, '--json'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.identical).toBe(true)
    expect(data.additions).toBe(0)
    expect(data.deletions).toBe(0)
    expect(data.files).toEqual([])
  })

  test('diff detects added auxiliary files', () => {
    const libraryFiles = {
      [SKILL_FILE]: '# Skill\n',
    }
    const projectFiles = {
      [SKILL_FILE]: '# Skill\n',
      'references/API.md': '# API\n',
    }

    writeSkillFiles(libraryDir, 'added-file', libraryFiles)
    writeSkillFiles(getProjectLockRoot(projectDir), 'added-file', projectFiles)

    const result = runCli(
      ['diff', 'added-file', '--project', projectDir, '--json'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.identical).toBe(false)
    const addedFile = data.files!.find(f => f.file === 'references/API.md')
    expect(addedFile).toBeDefined()
    expect(addedFile!.status).toBe('added')
  })

  test('diff detects removed auxiliary files', () => {
    const libraryFiles = {
      [SKILL_FILE]: '# Skill\n',
      'scripts/old.sh': '#!/bin/bash\n',
    }
    const projectFiles = {
      [SKILL_FILE]: '# Skill\n',
    }

    writeSkillFiles(libraryDir, 'removed-file', libraryFiles)
    writeSkillFiles(getProjectLockRoot(projectDir), 'removed-file', projectFiles)

    const result = runCli(
      ['diff', 'removed-file', '--project', projectDir, '--json'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    const removedFile = data.files!.find(f => f.file === 'scripts/old.sh')
    expect(removedFile).toBeDefined()
    expect(removedFile!.status).toBe('removed')
  })

  test('diff handles single-file vs multi-file skill', () => {
    // Library has only SKILL.md, project has SKILL.md + extra
    const libraryFiles = {
      [SKILL_FILE]: '# Library Only\n',
    }
    const projectFiles = {
      [SKILL_FILE]: '# Library Only\n',
      'extra.md': '# Project Extra\n',
    }

    writeSkillFiles(libraryDir, 'mixed', libraryFiles)
    writeSkillFiles(getProjectLockRoot(projectDir), 'mixed', projectFiles)

    const result = runCli(
      ['diff', 'mixed', '--project', projectDir, '--json'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.identical).toBe(false)
    expect(data.additions).toBe(0) // SKILL.md is same
    expect(data.deletions).toBe(0) // SKILL.md is same
    // But files show the difference
    const addedFile = data.files!.find(f => f.file === 'extra.md')
    expect(addedFile).toBeDefined()
    expect(addedFile!.status).toBe('added')
  })
})
