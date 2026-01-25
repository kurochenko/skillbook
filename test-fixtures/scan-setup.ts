/**
 * Test Fixtures Setup for ScanApp Integration Tests
 *
 * Creates a multi-project structure for testing the scan TUI.
 * Run with: bun run test-fixtures/scan-setup.ts
 *
 * Structure created:
 * - library/: Mock skillbook library
 * - projects/: Parent directory containing multiple projects
 *   - project-a/: Managed project with .skillbook
 *   - project-b/: Unmanaged project
 *   - project-c/: Project with conflict variant
 */

import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { spawnSync } from 'child_process'

// Paths
export const SCAN_FIXTURES_ROOT = join(dirname(import.meta.path), 'scan')
export const SCAN_LIBRARY_PATH = join(SCAN_FIXTURES_ROOT, 'library')
export const SCAN_PROJECTS_PATH = join(SCAN_FIXTURES_ROOT, 'projects')

// Project paths
export const PROJECT_A_PATH = join(SCAN_PROJECTS_PATH, 'project-a')
export const PROJECT_B_PATH = join(SCAN_PROJECTS_PATH, 'project-b')
export const PROJECT_C_PATH = join(SCAN_PROJECTS_PATH, 'project-c')

// Skill content
const SKILL_CONTENT = {
  // Library versions
  'existing-same-lib': '# Existing Same Skill\n\nThis content matches the project version.',
  'existing-differs-lib': '# Existing Differs Skill\n\nLIBRARY VERSION - this differs from project.',

  // Project versions
  'local-only': '# Local Only Skill\n\nThis skill is only in the project, not in library.',
  'existing-same-project': '# Existing Same Skill\n\nThis content matches the project version.',
  'existing-differs-project': '# Existing Differs Skill\n\nPROJECT VERSION - this differs from library.',
  'conflict-skill-b': '# Conflict Skill\n\nVersion from project-b.',
  'conflict-skill-c': '# Conflict Skill\n\nVersion from project-c - DIFFERENT.',
}

/**
 * Run git command in a directory
 */
const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (result.status !== 0) {
    console.error(`Git command failed: git ${args.join(' ')}`)
    console.error(result.stderr)
  }
  return result
}

/**
 * Initialize a git repo with initial commit
 */
const initGitRepo = (path: string) => {
  git(path, 'init')
  git(path, 'config', 'user.email', 'test@test.com')
  git(path, 'config', 'user.name', 'Test User')
  writeFileSync(join(path, '.gitkeep'), '')
  git(path, 'add', '.')
  git(path, 'commit', '-m', 'Initial commit')
}

/**
 * Create a file with parent directories
 */
const createFile = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/**
 * Clean up existing scan fixtures
 */
export const cleanupScanFixtures = () => {
  if (existsSync(SCAN_FIXTURES_ROOT)) {
    rmSync(SCAN_FIXTURES_ROOT, { recursive: true, force: true })
  }
}

/**
 * Set up the library with some existing skills
 */
const setupScanLibrary = () => {
  mkdirSync(SCAN_LIBRARY_PATH, { recursive: true })

  // Create skills in library
  createFile(
    join(SCAN_LIBRARY_PATH, 'skills', 'existing-same', 'SKILL.md'),
    SKILL_CONTENT['existing-same-lib'],
  )
  createFile(
    join(SCAN_LIBRARY_PATH, 'skills', 'existing-differs', 'SKILL.md'),
    SKILL_CONTENT['existing-differs-lib'],
  )

  // Initialize as git repo
  initGitRepo(SCAN_LIBRARY_PATH)
}

/**
 * Set up project-a (managed with .skillbook)
 */
const setupProjectA = () => {
  mkdirSync(PROJECT_A_PATH, { recursive: true })

  // Create .skillbook directory as a git repo to mark as managed
  // isSkillbookInitialized checks for .skillbook/.git
  const skillbookPath = join(PROJECT_A_PATH, '.skillbook')
  mkdirSync(skillbookPath, { recursive: true })
  initGitRepo(skillbookPath)
  writeFileSync(
    join(skillbookPath, 'config.json'),
    JSON.stringify({ harnesses: ['claude-code'] }, null, 2),
  )

  // Create skills in .claude/skills/
  // local-only: not in library → [local]
  createFile(
    join(PROJECT_A_PATH, '.claude', 'skills', 'local-only', 'SKILL.md'),
    SKILL_CONTENT['local-only'],
  )

  // existing-same: matches library → [matches]
  createFile(
    join(PROJECT_A_PATH, '.claude', 'skills', 'existing-same', 'SKILL.md'),
    SKILL_CONTENT['existing-same-project'],
  )

  // Initialize as git repo
  initGitRepo(PROJECT_A_PATH)
}

/**
 * Set up project-b (unmanaged, no .skillbook)
 */
const setupProjectB = () => {
  mkdirSync(PROJECT_B_PATH, { recursive: true })

  // Create skills in .cursor/rules/ (flat file format)
  // existing-differs: differs from library → [differs]
  createFile(
    join(PROJECT_B_PATH, '.cursor', 'rules', 'existing-differs.md'),
    SKILL_CONTENT['existing-differs-project'],
  )

  // conflict-skill: same name as project-c but different content → variant warning
  createFile(
    join(PROJECT_B_PATH, '.cursor', 'rules', 'conflict-skill.md'),
    SKILL_CONTENT['conflict-skill-b'],
  )

  // Initialize as git repo
  initGitRepo(PROJECT_B_PATH)
}

/**
 * Set up project-c (conflict variant scenario)
 */
const setupProjectC = () => {
  mkdirSync(PROJECT_C_PATH, { recursive: true })

  // Create skill in .opencode/skill/ (directory format)
  // conflict-skill: same name as project-b but different content → variant warning
  createFile(
    join(PROJECT_C_PATH, '.opencode', 'skill', 'conflict-skill', 'SKILL.md'),
    SKILL_CONTENT['conflict-skill-c'],
  )

  // Initialize as git repo
  initGitRepo(PROJECT_C_PATH)
}

/**
 * Main setup function for scan fixtures
 */
export const setupScanFixtures = (quiet = true) => {
  if (!quiet) {
    console.log('Setting up scan test fixtures...')
  }

  cleanupScanFixtures()
  setupScanLibrary()
  setupProjectA()
  setupProjectB()
  setupProjectC()

  if (!quiet) {
    console.log('Scan test fixtures ready!')
    console.log(`  Library: ${SCAN_LIBRARY_PATH}`)
    console.log(`  Projects: ${SCAN_PROJECTS_PATH}`)
    console.log(`    - project-a (managed)`)
    console.log(`    - project-b (unmanaged)`)
    console.log(`    - project-c (conflict)`)
  }
}

// Run if executed directly (with output)
if (import.meta.main) {
  setupScanFixtures(false)
}
