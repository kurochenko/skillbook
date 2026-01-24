import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs'
import { join, dirname, resolve, basename } from 'path'
import {
  getProjectSkillsDir,
  getProjectSkillPath,
  addSkillToConfig,
  removeSkillFromConfig,
  ensureSkillbookDir,
} from './config.js'
import {
  syncSkillToHarnesses,
  removeSkillFromAllHarnesses,
  detectHarnesses,
} from './harness.js'
import {
  getSkillContent,
  listSkills as listLibrarySkills,
  addSkillToLibrary,
  calculateDiff,
  type DiffStats,
} from './library.js'
import { SKILL_FILE, TOOLS, type ToolId } from '../constants.js'

export type SkillSyncStatus = 'synced' | 'ahead' | 'behind' | 'diverged'

export type InstalledSkill = {
  name: string
  status: SkillSyncStatus
  diff: DiffStats | null
  content: string
}

export type UntrackedSkill = {
  name: string
  path: string
  content: string
}

export type AvailableSkill = {
  name: string
}

/**
 * Detect if we're in a project context.
 * Returns project root if found, null otherwise.
 *
 * A project is detected by presence of:
 * - .git folder
 * - .skillbook folder
 * - Any harness folder (.claude, .cursor, .opencode)
 */
export const detectProjectContext = (startPath: string = process.cwd()): string | null => {
  let current = resolve(startPath)
  const root = '/'

  while (current !== root) {
    // Check for project indicators
    if (
      existsSync(join(current, '.git')) ||
      existsSync(join(current, '.skillbook')) ||
      existsSync(join(current, '.claude')) ||
      existsSync(join(current, '.cursor')) ||
      existsSync(join(current, '.opencode'))
    ) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

/**
 * Read skill content from project's .skillbook/skills/ directory
 */
export const getProjectSkillContent = (projectPath: string, skillName: string): string | null => {
  const skillPath = getProjectSkillPath(projectPath, skillName)

  if (!existsSync(skillPath)) {
    return null
  }

  try {
    return readFileSync(skillPath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Determine sync status between project skill and library skill
 */
const getSkillSyncStatus = (
  projectContent: string,
  libraryContent: string | null,
): { status: SkillSyncStatus; diff: DiffStats | null } => {
  if (libraryContent === null) {
    // Skill not in library - this shouldn't happen for installed skills
    // but treat as "ahead" (local has changes library doesn't have)
    return { status: 'ahead', diff: null }
  }

  if (projectContent === libraryContent) {
    return { status: 'synced', diff: null }
  }

  // Content differs - for now, we can't tell direction without timestamps
  // So we'll call it "ahead" (assuming local changes are intentional)
  // In future, could use git history or modification times
  const diff = calculateDiff(libraryContent, projectContent)
  return { status: 'ahead', diff }
}

/**
 * Get the base directory and skill pattern for each harness type
 */
const getHarnessSkillsDir = (projectPath: string, harnessId: ToolId): string | null => {
  switch (harnessId) {
    case 'claude-code':
      return join(projectPath, '.claude', 'skills')
    case 'opencode':
      return join(projectPath, '.opencode', 'skill')
    case 'cursor':
      return join(projectPath, '.cursor', 'rules')
    default:
      return null
  }
}

/**
 * Scan a harness directory for skills
 */
const scanHarnessForSkills = (
  projectPath: string,
  harnessId: ToolId,
): { name: string; content: string; path: string }[] => {
  const skillsDir = getHarnessSkillsDir(projectPath, harnessId)
  if (!skillsDir || !existsSync(skillsDir)) return []

  const tool = TOOLS[harnessId]
  const results: { name: string; content: string; path: string }[] = []

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true })

    if (tool.needsDirectory) {
      // Directory-based harness (claude-code, opencode)
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillPath = join(skillsDir, entry.name, SKILL_FILE)
        if (!existsSync(skillPath)) continue

        const content = readFileSync(skillPath, 'utf-8')
        results.push({ name: entry.name, content, path: skillPath })
      }
    } else {
      // Flat file harness (cursor)
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue

        const skillPath = join(skillsDir, entry.name)
        const name = basename(entry.name, '.md')
        const content = readFileSync(skillPath, 'utf-8')
        results.push({ name, content, path: skillPath })
      }
    }
  } catch {
    // ignore errors
  }

  return results
}

/**
 * Get all installed skills.
 * Checks both .skillbook/skills/ AND harness folders (like .claude/skills/)
 * A skill is "installed" if it exists locally AND is in the library.
 */
export const getInstalledSkills = (projectPath: string): InstalledSkill[] => {
  const skills = new Map<string, InstalledSkill>()

  // First, check .skillbook/skills/ (managed by skillbook)
  const skillsDir = getProjectSkillsDir(projectPath)
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillPath = join(skillsDir, entry.name, SKILL_FILE)
        if (!existsSync(skillPath)) continue

        const content = readFileSync(skillPath, 'utf-8')
        const libraryContent = getSkillContent(entry.name)
        const { status, diff } = getSkillSyncStatus(content, libraryContent)

        skills.set(entry.name, { name: entry.name, status, diff, content })
      }
    } catch {
      // ignore errors
    }
  }

  // Then, check all harness folders for skills that are in the library
  const harnesses = detectHarnesses(projectPath)
  for (const harnessId of harnesses) {
    const harnessSkills = scanHarnessForSkills(projectPath, harnessId)

    for (const { name, content } of harnessSkills) {
      if (skills.has(name)) continue // already found

      const libraryContent = getSkillContent(name)
      // Only count as "installed" if it's in the library
      if (libraryContent === null) continue

      const { status, diff } = getSkillSyncStatus(content, libraryContent)
      skills.set(name, { name, status, diff, content })
    }
  }

  return Array.from(skills.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get skills that exist in harness folders but are NOT in the library.
 * These are "untracked" - local skills that haven't been pushed to the library yet.
 */
export const getUntrackedSkills = (projectPath: string): UntrackedSkill[] => {
  const untracked: UntrackedSkill[] = []

  // Check all harness folders for skills NOT in the library
  const harnesses = detectHarnesses(projectPath)

  for (const harnessId of harnesses) {
    const harnessSkills = scanHarnessForSkills(projectPath, harnessId)

    for (const { name, content, path } of harnessSkills) {
      const libraryContent = getSkillContent(name)

      // Only "untracked" if NOT in library
      if (libraryContent !== null) continue

      untracked.push({ name, path, content })
    }
  }

  // Dedupe by name
  const seen = new Set<string>()
  return untracked.filter((s) => {
    if (seen.has(s.name)) return false
    seen.add(s.name)
    return true
  })
}

/**
 * Get skills available in library but not installed in project
 */
export const getAvailableSkills = (projectPath: string): AvailableSkill[] => {
  const librarySkills = listLibrarySkills()
  const installedNames = new Set(getInstalledSkills(projectPath).map((s) => s.name))

  return librarySkills
    .filter((name) => !installedNames.has(name))
    .map((name) => ({ name }))
}

/**
 * Install a skill from library to project
 * 1. Copy to .skillbook/skills/
 * 2. Sync to enabled harnesses
 * 3. Update config
 */
export const installSkill = (projectPath: string, skillName: string): boolean => {
  const libraryContent = getSkillContent(skillName)

  if (libraryContent === null) {
    return false // Skill not in library
  }

  // Ensure .skillbook directory exists
  ensureSkillbookDir(projectPath)

  // Copy to .skillbook/skills/
  const skillDir = dirname(getProjectSkillPath(projectPath, skillName))
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true })
  }
  writeFileSync(getProjectSkillPath(projectPath, skillName), libraryContent, 'utf-8')

  // Sync to enabled harnesses
  syncSkillToHarnesses(projectPath, skillName, libraryContent)

  // Update config
  addSkillToConfig(projectPath, skillName)

  return true
}

/**
 * Uninstall a skill from project
 * 1. Remove from .skillbook/skills/
 * 2. Remove from all harnesses
 * 3. Update config
 */
export const uninstallSkill = (projectPath: string, skillName: string): boolean => {
  const skillDir = dirname(getProjectSkillPath(projectPath, skillName))

  // Remove from .skillbook/skills/
  if (existsSync(skillDir)) {
    rmSync(skillDir, { recursive: true, force: true })
  }

  // Remove from all harnesses
  removeSkillFromAllHarnesses(projectPath, skillName)

  // Update config
  removeSkillFromConfig(projectPath, skillName)

  return true
}

/**
 * Push a skill from project to library
 * Used for untracked skills or updated installed skills
 */
export const pushSkillToLibrary = async (
  projectPath: string,
  skillName: string,
): Promise<boolean> => {
  // First check .skillbook/skills/
  let content = getProjectSkillContent(projectPath, skillName)

  // If not in .skillbook/skills/, check harness folders
  if (content === null) {
    const claudeSkillPath = join(projectPath, '.claude', 'skills', skillName, SKILL_FILE)
    if (existsSync(claudeSkillPath)) {
      content = readFileSync(claudeSkillPath, 'utf-8')
    }
  }

  if (content === null) {
    return false
  }

  const result = await addSkillToLibrary(skillName, content)
  return result.success
}

/**
 * Sync a skill from library to project (pull)
 */
export const syncSkillFromLibrary = (projectPath: string, skillName: string): boolean => {
  const libraryContent = getSkillContent(skillName)

  if (libraryContent === null) {
    return false
  }

  // Ensure skill is in .skillbook/skills/
  ensureSkillbookDir(projectPath)
  const skillDir = dirname(getProjectSkillPath(projectPath, skillName))
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true })
  }
  writeFileSync(getProjectSkillPath(projectPath, skillName), libraryContent, 'utf-8')

  // Sync to harnesses
  syncSkillToHarnesses(projectPath, skillName, libraryContent)

  return true
}

/**
 * Check if a path looks like a project (has any project indicators)
 */
export const isProject = (path: string): boolean => {
  return (
    existsSync(join(path, '.git')) ||
    existsSync(join(path, '.skillbook')) ||
    existsSync(join(path, '.claude')) ||
    existsSync(join(path, '.cursor')) ||
    existsSync(join(path, '.opencode'))
  )
}
