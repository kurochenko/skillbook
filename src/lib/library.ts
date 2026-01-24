import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { fdir } from 'fdir'
import { getLibraryPath, getSkillsPath, getSkillPath } from './paths.ts'
import { gitInit, gitAdd, gitCommit, ensureGitConfig, isGitRepo } from './git.ts'
import { SKILL_FILE, SKILLS_DIR } from '../constants.ts'
import { extractSkillName, validateSkillName } from './skills.ts'

export type LibraryInitResult =
  | { success: true; path: string; created: boolean }
  | { success: false; error: string }

export type AddSkillResult =
  | { success: true; action: 'added' | 'updated' | 'skipped'; commitHash?: string; path: string; warning?: string }
  | { success: false; error: string }

export const ensureLibrary = async (): Promise<LibraryInitResult> => {
  const libraryPath = getLibraryPath()
  const skillsPath = getSkillsPath()
  const created = !existsSync(libraryPath)

  try {
    if (!existsSync(libraryPath)) {
      mkdirSync(libraryPath, { recursive: true })
    }

    if (!existsSync(skillsPath)) {
      mkdirSync(skillsPath, { recursive: true })
    }

    if (!isGitRepo(libraryPath)) {
      const initResult = await gitInit(libraryPath)
      if (!initResult.success) {
        return { success: false, error: `Failed to init git: ${initResult.error}` }
      }

      const configResult = await ensureGitConfig(libraryPath)
      if (!configResult.success) {
        return { success: false, error: `Failed to configure git: ${configResult.error}` }
      }

      const gitignorePath = join(libraryPath, '.gitignore')
      if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, '*.local\n.DS_Store\n')
      }

      await gitAdd(libraryPath, '.')
      await gitCommit(libraryPath, 'Initialize skillbook library')
    }

    return { success: true, path: libraryPath, created }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export const skillExists = (skillName: string): boolean => {
  const skillPath = join(getSkillPath(skillName), SKILL_FILE)
  return existsSync(skillPath)
}

export const getSkillContent = (skillName: string): string | null => {
  const skillPath = join(getSkillPath(skillName), SKILL_FILE)

  if (!existsSync(skillPath)) {
    return null
  }

  try {
    return readFileSync(skillPath, 'utf-8')
  } catch {
    return null
  }
}

export const listSkills = (): string[] => {
  const skillsPath = getSkillsPath()

  if (!existsSync(skillsPath)) {
    return []
  }

  try {
    const entries = readdirSync(skillsPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(join(skillsPath, entry.name, SKILL_FILE)))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

export const addSkillToLibrary = async (
  skillName: string,
  content: string,
): Promise<AddSkillResult> => {
  const libraryPath = getLibraryPath()
  const skillDir = getSkillPath(skillName)
  const skillFilePath = join(skillDir, SKILL_FILE)
  const relativeSkillPath = `${SKILLS_DIR}/${skillName}/${SKILL_FILE}`

  const libraryResult = await ensureLibrary()
  if (!libraryResult.success) {
    return { success: false, error: libraryResult.error }
  }

  const existingContent = getSkillContent(skillName)
  const isUpdate = existingContent !== null

  if (existingContent !== null && existingContent === content) {
    return {
      success: true,
      action: 'skipped',
      path: skillFilePath,
    }
  }

  try {
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true })
    }

    writeFileSync(skillFilePath, content, 'utf-8')

    const addResult = await gitAdd(libraryPath, relativeSkillPath)
    if (!addResult.success) {
      return { success: false, error: `Failed to stage file: ${addResult.error}` }
    }

    const commitMessage = isUpdate ? `Update skill: ${skillName}` : `Add skill: ${skillName}`
    const commitResult = await gitCommit(libraryPath, commitMessage)

    if (!commitResult.success) {
      return {
        success: true,
        action: isUpdate ? 'updated' : 'added',
        path: skillFilePath,
        warning: `Skill saved but git commit failed: ${commitResult.error}`,
      }
    }

    return {
      success: true,
      action: isUpdate ? 'updated' : 'added',
      commitHash: commitResult.commitHash,
      path: skillFilePath,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export type SkillStatus = 'untracked' | 'synced' | 'ahead'

export type DiffStats = {
  additions: number
  deletions: number
}

export type ScannedSkill = {
  name: string
  path: string
  content: string
  status: SkillStatus
  diff: DiffStats | null  // null for 'untracked' and 'synced', populated for 'ahead'
  hasConflict: boolean    // true only if multiple locations have DIFFERENT content
  conflictCount: number   // number of different versions (0, 2, 3, etc.)
  project: string
}

/**
 * Calculate line-based diff between two strings.
 * Returns additions (lines in `current` not in `base`) and deletions (lines in `base` not in `current`).
 */
export const calculateDiff = (base: string, current: string): DiffStats => {
  const baseLines = base.split('\n')
  const currentLines = current.split('\n')
  
  // Simple line-based diff: count lines added and removed
  // This is a simplified approach - not a full diff algorithm
  const baseSet = new Set(baseLines)
  const currentSet = new Set(currentLines)
  
  let additions = 0
  let deletions = 0
  
  for (const line of currentLines) {
    if (!baseSet.has(line)) additions++
  }
  
  for (const line of baseLines) {
    if (!currentSet.has(line)) deletions++
  }
  
  return { additions, deletions }
}

// Directories to skip during traversal - only truly bulky ones with deep nesting
// fdir's exclude() prunes BEFORE entering, so this is very fast
const IGNORED_DIRS_SET = new Set([
  'node_modules', // npm packages - can have thousands of nested dirs
  'vendor',       // PHP/Ruby dependencies
  '__pycache__',  // Python cache
  '.venv',        // Python virtual env
  'venv',         // Python virtual env
  '.cache',       // Various caches
  '.turbo',       // Turborepo cache
  'target',       // Rust build output
  'Pods',         // iOS CocoaPods
])

// Check if a path is a skill file we're looking for
const isSkillFile = (path: string): boolean => {
  return (path.includes('/.claude/skills/') && path.endsWith('/SKILL.md')) ||
         (path.includes('/.cursor/rules/') && path.endsWith('.md')) ||
         (path.includes('/.opencode/skill/') && path.endsWith('/SKILL.md'))
}

// Extract project name from skill file path
const extractProjectFromPath = (filePath: string): string => {
  // Find the parent directory before .claude/.cursor/.opencode
  const patterns = ['/.claude/skills/', '/.cursor/rules/', '/.opencode/skill/']
  for (const pattern of patterns) {
    const idx = filePath.indexOf(pattern)
    if (idx !== -1) {
      const projectPath = filePath.slice(0, idx)
      return projectPath.split('/').pop() ?? projectPath
    }
  }
  return 'unknown'
}

type PartialSkill = {
  name: string
  path: string
  content: string
  status: SkillStatus
  diff: DiffStats | null
  project: string
}

export type ScanOptions = {
  onSkillFound?: (skill: PartialSkill) => void
}

/**
 * Single-phase skill scanning using fdir.
 * Lightning fast - scans entire directory tree in one pass.
 */
export const scanProjectSkills = async (
  basePath: string = '.',
  options: ScanOptions = {},
): Promise<ScannedSkill[]> => {
  const { onSkillFound } = options
  const absolutePath = resolve(basePath)

  // Single fdir pass to find all skill files
  const skillFiles = await new fdir()
    .withFullPaths()
    .exclude((dirName) => IGNORED_DIRS_SET.has(dirName))
    .filter((path) => isSkillFile(path))
    .crawl(absolutePath)
    .withPromise()

  // Process each skill file
  const skills: PartialSkill[] = []
  const skillsByName = new Map<string, PartialSkill[]>()

  for (const file of skillFiles) {
    const name = extractSkillName(file)
    if (!name) continue

    const validation = validateSkillName(name)
    if (!validation.valid) continue

    const content = await Bun.file(file).text()
    const libraryContent = getSkillContent(name)
    const project = extractProjectFromPath(file)

    let status: SkillStatus
    let diff: DiffStats | null = null

    if (libraryContent === null) {
      status = 'untracked'
    } else if (libraryContent === content) {
      status = 'synced'
    } else {
      status = 'ahead'
      diff = calculateDiff(libraryContent, content)
    }

    const skill: PartialSkill = { name, path: file, content, status, diff, project }
    skills.push(skill)

    // Group by name for conflict detection
    const existing = skillsByName.get(name) ?? []
    existing.push(skill)
    skillsByName.set(name, existing)

    onSkillFound?.(skill)
  }

  // Determine conflicts: only if multiple locations have DIFFERENT content
  // Note: synced items all have same content (they match library), so no conflict possible
  const getConflictInfo = (name: string): { hasConflict: boolean; conflictCount: number } => {
    const instances = skillsByName.get(name) ?? []
    if (instances.length <= 1) {
      return { hasConflict: false, conflictCount: 0 }
    }

    // If all are synced, no conflict (all identical to library, thus to each other)
    if (instances.every((s) => s.status === 'synced')) {
      return { hasConflict: false, conflictCount: 0 }
    }

    // Count unique content versions
    const uniqueContents = new Set(instances.map((s) => s.content))
    const conflictCount = uniqueContents.size

    // Conflict exists if there are multiple different versions
    return {
      hasConflict: conflictCount > 1,
      conflictCount: conflictCount > 1 ? conflictCount : 0,
    }
  }

  // Add conflict info and sort
  return skills
    .map((skill) => {
      const { hasConflict, conflictCount } = getConflictInfo(skill.name)
      return { ...skill, hasConflict, conflictCount }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
