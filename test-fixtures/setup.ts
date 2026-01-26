import { mkdirSync, rmSync, symlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { runGit, initGitRepo } from '../src/test-utils/git'
import { createFile } from './utils'

export const FIXTURES_ROOT = dirname(import.meta.path)
export const LIBRARY_PATH = join(FIXTURES_ROOT, 'library')
export const PROJECT_PATH = join(FIXTURES_ROOT, 'project')
export const SKILLBOOK_PATH = join(PROJECT_PATH, '.skillbook')

const SKILL_CONTENT = {
  'skill-in-lib': '# Skill In Library\n\nThis skill is in the library and installed.',
  'skill-available': '# Available Skill\n\nThis skill is in library but not installed.',
  'skill-detached': '# Detached Skill\n\nThis skill matches library but is a real file.',
  'skill-local': '# Local Skill\n\nThis skill is only local, not in library.',
  'skill-conflict': '# Conflict Skill - PROJECT VERSION\n\nThis differs from library.',
  'skill-conflict-lib': '# Conflict Skill - LIBRARY VERSION\n\nOriginal library content.',
  'skill-unanimous-conflict-lib': '# Unanimous Conflict - LIBRARY VERSION\n\nThis is the library version.',
  'skill-unanimous-conflict-local': '# Unanimous Conflict - LOCAL VERSION\n\nThis is the local version that differs.',
}

export const cleanupFixtures = () => {
  if (existsSync(LIBRARY_PATH)) {
    rmSync(LIBRARY_PATH, { recursive: true, force: true })
  }
  if (existsSync(PROJECT_PATH)) {
    rmSync(PROJECT_PATH, { recursive: true, force: true })
  }
}

const setupLibrary = () => {
  mkdirSync(LIBRARY_PATH, { recursive: true })
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
  createFile(
    join(LIBRARY_PATH, 'skills', 'skill-unanimous-conflict', 'SKILL.md'),
    SKILL_CONTENT['skill-unanimous-conflict-lib'],
  )
  initGitRepo(LIBRARY_PATH)
}

const setupSkillbook = () => {
  runGit(PROJECT_PATH, 'clone', '--filter=blob:none', '--sparse', '--no-checkout', LIBRARY_PATH, '.skillbook')
  runGit(SKILLBOOK_PATH, 'sparse-checkout', 'init', '--cone')
  runGit(SKILLBOOK_PATH, 'sparse-checkout', 'set', '--no-cone', '/*', '!/skills', 'skills/skill-in-lib')
  runGit(SKILLBOOK_PATH, 'checkout')
}

const setupProject = () => {
  mkdirSync(PROJECT_PATH, { recursive: true })
  setupSkillbook()

  createFile(
    join(SKILLBOOK_PATH, 'config.json'),
    JSON.stringify({ harnesses: ['claude-code'] }, null, 2),
  )

  mkdirSync(join(PROJECT_PATH, '.claude', 'skills'), { recursive: true })
  symlinkSync(
    join('..', '..', '.skillbook', 'skills', 'skill-in-lib'),
    join(PROJECT_PATH, '.claude', 'skills', 'skill-in-lib'),
  )
  createFile(
    join(PROJECT_PATH, '.claude', 'skills', 'skill-detached', 'SKILL.md'),
    SKILL_CONTENT['skill-detached'],
  )
  createFile(
    join(PROJECT_PATH, '.claude', 'skills', 'skill-local', 'SKILL.md'),
    SKILL_CONTENT['skill-local'],
  )

  createFile(
    join(PROJECT_PATH, '.opencode', 'skill', 'skill-in-lib', 'SKILL.md'),
    SKILL_CONTENT['skill-conflict'],
  )

  createFile(
    join(PROJECT_PATH, '.claude', 'skills', 'skill-unanimous-conflict', 'SKILL.md'),
    SKILL_CONTENT['skill-unanimous-conflict-local'],
  )
  createFile(
    join(PROJECT_PATH, '.opencode', 'skill', 'skill-unanimous-conflict', 'SKILL.md'),
    SKILL_CONTENT['skill-unanimous-conflict-local'],
  )

  initGitRepo(PROJECT_PATH)
}

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

if (import.meta.main) {
  setupFixtures(false)
}
