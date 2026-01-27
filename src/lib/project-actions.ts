import { readFileSync } from 'fs'
import { join } from 'path'
import { detectHarnesses, getEnabledHarnesses } from '@/lib/harness'
import { getSkillContent, addSkillToLibrary } from '@/lib/library'
import { SKILL_FILE, TOOLS } from '@/constants'
import { type ActionResult } from '@/lib/action-result'
import { isIgnoredFsError, logError } from '@/lib/logger'
import {
  isSkillbookInitialized,
  initSparseCheckout,
  addToSparseCheckout,
  removeFromSparseCheckout,
  getSkillbookSkillsPath,
} from '@/lib/sparse-checkout'
import {
  createSymlinksForSkill,
  removeSymlinksForSkill,
  removeFilesForSkill,
  convertToSymlink,
} from '@/lib/symlinks'

export type SkillActionResult = ActionResult

const readFileSafe = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf-8')
  } catch (error) {
    if (!isIgnoredFsError(error)) {
      logError('Failed to read file', error, { path })
    }
    return null
  }
}

const getProjectSkillContent = (projectPath: string, skillName: string): string | null => {
  const skillPath = join(getSkillbookSkillsPath(projectPath), skillName, SKILL_FILE)
  return readFileSafe(skillPath)
}

const ensureSparseSkill = async (
  projectPath: string,
  skillName: string,
): Promise<SkillActionResult> => {
  if (!isSkillbookInitialized(projectPath)) {
    const initResult = await initSparseCheckout(projectPath)
    if (!initResult.success) {
      return { success: false, error: `Failed to init skillbook: ${initResult.error}` }
    }
  }

  const addResult = await addToSparseCheckout(projectPath, skillName)
  if (!addResult.success) {
    return { success: false, error: `Failed to add to sparse checkout: ${addResult.error}` }
  }

  return { success: true }
}

const findSkillContentInHarnesses = (projectPath: string, skillName: string): string | null => {
  const content = getProjectSkillContent(projectPath, skillName)
  if (content !== null) return content

  for (const harnessId of detectHarnesses(projectPath)) {
    const tool = TOOLS[harnessId]
    const skillPath = join(projectPath, tool.skillPath(skillName))
    const harnessContent = readFileSafe(skillPath)
    if (harnessContent !== null) return harnessContent
  }

  return null
}

export const installSkill = async (
  projectPath: string,
  skillName: string,
): Promise<ActionResult> => {
  const libraryContent = getSkillContent(skillName)
  if (libraryContent === null) {
    return { success: false, error: 'Skill not found in library' }
  }

  const sparseResult = await ensureSparseSkill(projectPath, skillName)
  if (!sparseResult.success) return sparseResult

  const harnesses = getEnabledHarnesses(projectPath)
  const symlinkResult = createSymlinksForSkill(projectPath, harnesses, skillName)
  if (!symlinkResult.success) {
    return { success: false, error: `Failed to create symlinks: ${symlinkResult.error}` }
  }

  return { success: true }
}

export const uninstallSkill = async (
  projectPath: string,
  skillName: string,
): Promise<ActionResult> => {
  const allHarnesses = detectHarnesses(projectPath)
  const removeResult = removeSymlinksForSkill(projectPath, allHarnesses, skillName)
  if (!removeResult.success) {
    return { success: false, error: `Failed to remove symlinks: ${removeResult.error}` }
  }

  if (isSkillbookInitialized(projectPath)) {
    const removeResult = await removeFromSparseCheckout(projectPath, skillName)
    if (!removeResult.success) {
      return { success: false, error: `Failed to remove from sparse checkout: ${removeResult.error}` }
    }
  }

  return { success: true }
}

export const removeSkill = async (
  projectPath: string,
  skillName: string,
): Promise<ActionResult> => {
  const allHarnesses = detectHarnesses(projectPath)
  const filesResult = removeFilesForSkill(projectPath, allHarnesses, skillName)
  if (!filesResult.success) {
    return { success: false, error: filesResult.error }
  }

  if (isSkillbookInitialized(projectPath)) {
    const removeResult = await removeFromSparseCheckout(projectPath, skillName)
    if (!removeResult.success) {
      return { success: false, error: `Failed to remove from sparse checkout: ${removeResult.error}` }
    }
  }

  return { success: true }
}

export const pushSkillToLibrary = async (
  projectPath: string,
  skillName: string,
): Promise<ActionResult> => {
  const content = findSkillContentInHarnesses(projectPath, skillName)
  if (content === null) {
    return { success: false, error: 'Skill content not found in project' }
  }

  const result = await addSkillToLibrary(skillName, content)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true }
}

export const syncSkillFromLibrary = async (
  projectPath: string,
  skillName: string,
): Promise<ActionResult> => {
  const libraryContent = getSkillContent(skillName)
  if (libraryContent === null) {
    return { success: false, error: 'Skill not found in library' }
  }

  const sparseResult = await ensureSparseSkill(projectPath, skillName)
  if (!sparseResult.success) return sparseResult

  const harnesses = detectHarnesses(projectPath)
  for (const harnessId of harnesses) {
    const result = convertToSymlink(projectPath, harnessId, skillName)
    if (!result.success) {
      return { success: false, error: `Failed to sync harness ${harnessId}: ${result.error}` }
    }
  }

  return { success: true }
}
