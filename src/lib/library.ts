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

export type SkillStatus = 'new' | 'synced' | 'changed'

export type ScannedSkill = {
  name: string
  path: string
  content: string
  status: SkillStatus
  hasDuplicates: boolean
  project: string
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

export type ScanOptions = {
  onSkillFound?: (skill: Omit<ScannedSkill, 'hasDuplicates'>) => void
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
  const skills: Omit<ScannedSkill, 'hasDuplicates'>[] = []
  const nameCount = new Map<string, number>()

  for (const file of skillFiles) {
    const name = extractSkillName(file)
    if (!name) continue

    const validation = validateSkillName(name)
    if (!validation.valid) continue

    const content = await Bun.file(file).text()
    const libraryContent = getSkillContent(name)
    const project = extractProjectFromPath(file)

    let status: SkillStatus
    if (libraryContent === null) {
      status = 'new'
    } else if (libraryContent === content) {
      status = 'synced'
    } else {
      status = 'changed'
    }

    const skill = { name, path: file, content, status, project }
    skills.push(skill)
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1)

    onSkillFound?.(skill)
  }

  // Mark duplicates and sort
  return skills
    .map((skill) => ({ ...skill, hasDuplicates: (nameCount.get(skill.name) ?? 0) > 1 }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
