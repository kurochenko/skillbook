/**
 * Test Fixtures Setup Script
 *
 * Creates a reproducible project structure for integration testing.
 * Run with: bun run test-fixtures/setup.ts
 *
 * Structure created:
 * - library/: Mock skillbook library (git repo)
 * - project/: Mock project with various skill states (git repo)
 */

import { mkdirSync, rmSync, writeFileSync, symlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { spawnSync } from 'child_process'

// Paths
export const FIXTURES_ROOT = dirname(import.meta.path)
export const LIBRARY_PATH = join(FIXTURES_ROOT, 'library')
export const PROJECT_PATH = join(FIXTURES_ROOT, 'project')
export const SKILLBOOK_PATH = join(PROJECT_PATH, '.skillbook')

// Skill content
const SKILL_CONTENT = {
  'skill-in-lib': '# Skill In Library\n\nThis skill is in the library and installed.',
  'skill-available': '# Available Skill\n\nThis skill is in library but not installed.',
  'skill-detached': '# Detached Skill\n\nThis skill matches library but is a real file.',
  'skill-local': '# Local Skill\n\nThis skill is only local, not in library.',
  'skill-conflict': '# Conflict Skill - PROJECT VERSION\n\nThis differs from library.',
  'skill-conflict-lib': '# Conflict Skill - LIBRARY VERSION\n\nOriginal library content.',
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
 * Create a symlink with parent directories
 */
const createSymlink = (target: string, linkPath: string) => {
  mkdirSync(dirname(linkPath), { recursive: true })
  symlinkSync(target, linkPath)
}

/**
 * Clean up existing fixtures
 */
export const cleanupFixtures = () => {
  if (existsSync(LIBRARY_PATH)) {
    rmSync(LIBRARY_PATH, { recursive: true, force: true })
  }
  if (existsSync(PROJECT_PATH)) {
    rmSync(PROJECT_PATH, { recursive: true, force: true })
  }
}

/**
 * Set up the library
 */
const setupLibrary = () => {
  mkdirSync(LIBRARY_PATH, { recursive: true })

  // Create skills in library
  createFile(
    join(LIBRARY_PATH, 'skills', 'skill-in-lib', 'SKILL.md'),
    SKILL_CONTENT['skill-in-lib'],
  )
  createFile(
    join(LIBRARY_PATH, 'skills', 'skill-available', 'SKILL.md'),
    SKILL_CONTENT['skill-available'],
  )
  createFile(
    join(LIBRARY_PATH, 'skills', 'skill-detached', 'SKILL.md'),
    SKILL_CONTENT['skill-detached'],
  )
  createFile(
    join(LIBRARY_PATH, 'skills', 'skill-conflict', 'SKILL.md'),
    SKILL_CONTENT['skill-conflict-lib'],
  )

  // Initialize as git repo
  initGitRepo(LIBRARY_PATH)
}

/**
 * Set up the .skillbook sparse checkout in project
 * This simulates `git clone --sparse` of the library
 */
const setupSkillbook = () => {
  // Clone the library into .skillbook
  git(PROJECT_PATH, 'clone', '--no-checkout', LIBRARY_PATH, '.skillbook')

  // Enable sparse checkout
  git(SKILLBOOK_PATH, 'sparse-checkout', 'init', '--cone')

  // Add skill-in-lib to sparse checkout (the only installed skill)
  git(SKILLBOOK_PATH, 'sparse-checkout', 'set', 'skills/skill-in-lib')

  // Checkout the files
  git(SKILLBOOK_PATH, 'checkout')
}

/**
 * Set up the project with various skill states
 */
const setupProject = () => {
  mkdirSync(PROJECT_PATH, { recursive: true })

  // Set up .skillbook first
  setupSkillbook()

  // Create config
  createFile(
    join(SKILLBOOK_PATH, 'config.json'),
    JSON.stringify({ harnesses: ['claude-code'] }, null, 2),
  )

  // .claude/skills/ - main harness (enabled)
  // skill-in-lib: symlink to .skillbook (status: ok)
  createSymlink(
    join('..', '..', '.skillbook', 'skills', 'skill-in-lib', 'SKILL.md'),
    join(PROJECT_PATH, '.claude', 'skills', 'skill-in-lib', 'SKILL.md'),
  )

  // skill-detached: real file matching library (status: detached)
  createFile(
    join(PROJECT_PATH, '.claude', 'skills', 'skill-detached', 'SKILL.md'),
    SKILL_CONTENT['skill-detached'],
  )

  // skill-local: real file not in library (section: LOCAL)
  createFile(
    join(PROJECT_PATH, '.claude', 'skills', 'skill-local', 'SKILL.md'),
    SKILL_CONTENT['skill-local'],
  )

  // .opencode/skill/ - secondary harness (not in config, has content)
  // skill-in-lib: real file that differs from library (status: conflict)
  createFile(
    join(PROJECT_PATH, '.opencode', 'skill', 'skill-in-lib', 'SKILL.md'),
    SKILL_CONTENT['skill-conflict'],
  )

  // Initialize project as git repo
  initGitRepo(PROJECT_PATH)
}

/**
 * Main setup function
 */
export const setupFixtures = (quiet = true) => {
  if (!quiet) {
    console.log('Setting up test fixtures...')
  }

  cleanupFixtures()
  setupLibrary()
  setupProject()

  if (!quiet) {
    console.log('Test fixtures ready!')
    console.log(`  Library: ${LIBRARY_PATH}`)
    console.log(`  Project: ${PROJECT_PATH}`)
  }
}

// Run if executed directly (with output)
if (import.meta.main) {
  setupFixtures(false)
}
