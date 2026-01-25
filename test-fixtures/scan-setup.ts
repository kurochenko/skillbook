import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { initGitRepo } from '../src/test-utils/git'

export const SCAN_FIXTURES_ROOT = join(dirname(import.meta.path), 'scan')
export const SCAN_LIBRARY_PATH = join(SCAN_FIXTURES_ROOT, 'library')
export const SCAN_PROJECTS_PATH = join(SCAN_FIXTURES_ROOT, 'projects')

export const PROJECT_A_PATH = join(SCAN_PROJECTS_PATH, 'project-a')
export const PROJECT_B_PATH = join(SCAN_PROJECTS_PATH, 'project-b')
export const PROJECT_C_PATH = join(SCAN_PROJECTS_PATH, 'project-c')

const SKILL_CONTENT = {
  'existing-same-lib': '# Existing Same Skill\n\nThis content matches the project version.',
  'existing-differs-lib': '# Existing Differs Skill\n\nLIBRARY VERSION - this differs from project.',
  'local-only': '# Local Only Skill\n\nThis skill is only in the project, not in library.',
  'existing-same-project': '# Existing Same Skill\n\nThis content matches the project version.',
  'existing-differs-project': '# Existing Differs Skill\n\nPROJECT VERSION - this differs from library.',
  'conflict-skill-b': '# Conflict Skill\n\nVersion from project-b.',
  'conflict-skill-c': '# Conflict Skill\n\nVersion from project-c - DIFFERENT.',
}

const createFile = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

export const cleanupScanFixtures = () => {
  if (existsSync(SCAN_FIXTURES_ROOT)) {
    rmSync(SCAN_FIXTURES_ROOT, { recursive: true, force: true })
  }
}

const setupScanLibrary = () => {
  mkdirSync(SCAN_LIBRARY_PATH, { recursive: true })
  createFile(
    join(SCAN_LIBRARY_PATH, 'skills', 'existing-same', 'SKILL.md'),
    SKILL_CONTENT['existing-same-lib'],
  )
  createFile(
    join(SCAN_LIBRARY_PATH, 'skills', 'existing-differs', 'SKILL.md'),
    SKILL_CONTENT['existing-differs-lib'],
  )
  initGitRepo(SCAN_LIBRARY_PATH)
}

const setupProjectA = () => {
  mkdirSync(PROJECT_A_PATH, { recursive: true })
  const skillbookPath = join(PROJECT_A_PATH, '.skillbook')
  mkdirSync(skillbookPath, { recursive: true })
  initGitRepo(skillbookPath)
  writeFileSync(
    join(skillbookPath, 'config.json'),
    JSON.stringify({ harnesses: ['claude-code'] }, null, 2),
  )

  createFile(
    join(PROJECT_A_PATH, '.claude', 'skills', 'local-only', 'SKILL.md'),
    SKILL_CONTENT['local-only'],
  )
  createFile(
    join(PROJECT_A_PATH, '.claude', 'skills', 'existing-same', 'SKILL.md'),
    SKILL_CONTENT['existing-same-project'],
  )

  initGitRepo(PROJECT_A_PATH)
}

const setupProjectB = () => {
  mkdirSync(PROJECT_B_PATH, { recursive: true })
  createFile(
    join(PROJECT_B_PATH, '.claude', 'skills', 'existing-differs', 'SKILL.md'),
    SKILL_CONTENT['existing-differs-project'],
  )
  createFile(
    join(PROJECT_B_PATH, '.claude', 'skills', 'conflict-skill', 'SKILL.md'),
    SKILL_CONTENT['conflict-skill-b'],
  )
  initGitRepo(PROJECT_B_PATH)
}

const setupProjectC = () => {
  mkdirSync(PROJECT_C_PATH, { recursive: true })
  createFile(
    join(PROJECT_C_PATH, '.claude', 'skills', 'conflict-skill', 'SKILL.md'),
    SKILL_CONTENT['conflict-skill-c'],
  )
  initGitRepo(PROJECT_C_PATH)
}

export const setupScanFixtures = () => {
  cleanupScanFixtures()
  mkdirSync(SCAN_PROJECTS_PATH, { recursive: true })
  setupScanLibrary()
  setupProjectA()
  setupProjectB()
  setupProjectC()
}

if (import.meta.main) {
  setupScanFixtures()
}
