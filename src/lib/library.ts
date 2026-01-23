import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getLibraryPath, getSkillsPath, getSkillPath } from './paths.ts'
import { gitInit, gitAdd, gitCommit, ensureGitConfig, isGitRepo } from './git.ts'
import { SKILL_FILE, SKILLS_DIR } from '../constants.ts'

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
