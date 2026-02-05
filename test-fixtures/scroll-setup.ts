import { mkdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { initGitRepo } from '../src/test-utils/git'
import { createFile } from './utils'

export const SCROLL_FIXTURES_ROOT = join(dirname(import.meta.path), 'scroll')
export const SCROLL_LIBRARY_PATH = join(SCROLL_FIXTURES_ROOT, 'library')
export const SCROLL_PROJECTS_PATH = join(SCROLL_FIXTURES_ROOT, 'projects')

const PROJECTS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo',
  'foxtrot', 'golf', 'hotel',
]

const SKILLS_PER_PROJECT = ['auth', 'testing', 'linting', 'deploy']

export const TOTAL_ROWS = PROJECTS.length + PROJECTS.length * SKILLS_PER_PROJECT.length
// 8 projects + 32 skills = 40 rows

export const cleanupScrollFixtures = () => {
  if (existsSync(SCROLL_FIXTURES_ROOT)) {
    rmSync(SCROLL_FIXTURES_ROOT, { recursive: true, force: true })
  }
}

export const setupScrollFixtures = () => {
  cleanupScrollFixtures()
  mkdirSync(SCROLL_PROJECTS_PATH, { recursive: true })

  // Set up library with a few skills
  mkdirSync(SCROLL_LIBRARY_PATH, { recursive: true })
  createFile(
    join(SCROLL_LIBRARY_PATH, 'skills', 'auth', 'SKILL.md'),
    '# Auth Skill\n\nAuthentication patterns.',
  )
  initGitRepo(SCROLL_LIBRARY_PATH)

  // Set up projects
  for (const project of PROJECTS) {
    const projectPath = join(SCROLL_PROJECTS_PATH, project)
    mkdirSync(projectPath, { recursive: true })

    for (const skill of SKILLS_PER_PROJECT) {
      createFile(
        join(projectPath, '.claude', 'skills', skill, 'SKILL.md'),
        `# ${skill} Skill\n\nSkill from ${project}.`,
      )
    }

    initGitRepo(projectPath)
  }
}
