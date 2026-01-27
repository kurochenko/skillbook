import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync } from 'fs'
import { join, dirname } from 'path'
import { readConfig, setHarnessEnabled } from '@/lib/config'
import { TOOLS, type ToolId, SUPPORTED_TOOLS } from '@/constants'
import { isSkillSymlinked, convertToSymlink } from '@/lib/symlinks'
import { type ActionResult } from '@/lib/action-result'
import { isIgnoredFsError, logError } from '@/lib/logger'

export type HarnessState = 'enabled' | 'detached' | 'partial' | 'available'

export type HarnessInfo = {
  id: ToolId
  name: string
  state: HarnessState
}

const HARNESS_BASE_DIRS: Record<ToolId, string[]> = {
  'claude-code': ['.claude', 'skills'],
  opencode: ['.opencode', 'skill'],
  cursor: ['.cursor', 'rules'],
}

const safeLstat = (path: string) => {
  try {
    return lstatSync(path)
  } catch (error) {
    if (!isIgnoredFsError(error)) {
      logError('Failed to lstat path', error, { path })
    }
    return null
  }
}

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

export const getHarnessBaseDir = (projectPath: string, harnessId: ToolId): string => {
  return join(projectPath, ...HARNESS_BASE_DIRS[harnessId])
}

export const harnessExists = (projectPath: string, harnessId: ToolId): boolean =>
  existsSync(getHarnessBaseDir(projectPath, harnessId))

export const detectHarnesses = (projectPath: string): ToolId[] =>
  SUPPORTED_TOOLS.filter((id) => harnessExists(projectPath, id))

export const getEnabledHarnesses = (projectPath: string): ToolId[] => {
  const config = readConfig(projectPath)

  if (config && config.harnesses.length > 0) {
    return config.harnesses.filter((h): h is ToolId =>
      SUPPORTED_TOOLS.includes(h as ToolId),
    )
  }

  return detectHarnesses(projectPath)
}

export const getHarnessState = (
  projectPath: string,
  harnessId: ToolId,
  installedSkillNames: string[],
): HarnessState => {
  if (!harnessExists(projectPath, harnessId)) return 'available'

  const config = readConfig(projectPath)
  const inConfig = config?.harnesses.includes(harnessId) ?? false

  const skillStatuses = installedSkillNames.map((skillName) => ({
    isSymlinked: isSkillSymlinked(projectPath, harnessId, skillName),
    exists: skillExistsInHarness(projectPath, harnessId, skillName),
  }))

  const presentSkills = skillStatuses.filter((s) => s.exists)
  const allSymlinked = presentSkills.length > 0 && presentSkills.every((s) => s.isSymlinked)
  const noneSymlinked = presentSkills.length > 0 && presentSkills.every((s) => !s.isSymlinked)

  if (inConfig) {
    return allSymlinked || presentSkills.length === 0 ? 'enabled' : 'partial'
  }

  if (noneSymlinked) return 'detached'
  return 'partial'
}

const skillExistsInHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): boolean => {
  const tool = TOOLS[harnessId]
  const skillPath = join(projectPath, tool.skillPath(skillName))
  return existsSync(skillPath)
}

export const getHarnessesInfo = (
  projectPath: string,
  installedSkillNames: string[] = [],
): HarnessInfo[] =>
  SUPPORTED_TOOLS.map((id) => ({
    id,
    name: TOOLS[id].name,
    state: getHarnessState(projectPath, id, installedSkillNames),
  }))

export const enableHarness = (
  projectPath: string,
  harnessId: ToolId,
  installedSkillNames: string[],
  currentlyEnabled: string[],
): ActionResult => {
  try {
    setHarnessEnabled(projectPath, harnessId, true, currentlyEnabled)
    const errors: string[] = []
    for (const skillName of installedSkillNames) {
      const result = convertToSymlink(projectPath, harnessId, skillName)
      if (!result.success) {
        errors.push(result.error)
      }
    }
    if (errors.length > 0) {
      const suffix = errors.length === 1 ? '' : 's'
      return {
        success: false,
        error: `Failed to link ${errors.length} skill${suffix}. First error: ${errors[0]}`,
      }
    }
    return { success: true }
  } catch (error) {
    logError('Failed to enable harness', error, { projectPath, harnessId })
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Failed to enable harness: ${message}` }
  }
}

export const removeHarness = (
  projectPath: string,
  harnessId: ToolId,
  currentlyEnabled: string[],
): ActionResult => {
  try {
    const baseDir = getHarnessBaseDir(projectPath, harnessId)
    setHarnessEnabled(projectPath, harnessId, false, currentlyEnabled)
    if (existsSync(baseDir)) {
      rmSync(baseDir, { recursive: true, force: true })
    }
    return { success: true }
  } catch (error) {
    logError('Failed to remove harness', error, { projectPath, harnessId })
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Failed to remove harness: ${message}` }
  }
}

export const detachHarness = (
  projectPath: string,
  harnessId: ToolId,
  installedSkillNames: string[],
  currentlyEnabled: string[],
): ActionResult => {
  try {
    const errors: string[] = []
    for (const skillName of installedSkillNames) {
      const result = convertSymlinkToRealFile(projectPath, harnessId, skillName)
      if (!result.success) {
        errors.push(result.error)
      }
    }
    setHarnessEnabled(projectPath, harnessId, false, currentlyEnabled)
    if (errors.length > 0) {
      const suffix = errors.length === 1 ? '' : 's'
      return {
        success: false,
        error: `Failed to detach ${errors.length} skill${suffix}. First error: ${errors[0]}`,
      }
    }
    return { success: true }
  } catch (error) {
    logError('Failed to detach harness', error, { projectPath, harnessId })
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Failed to detach harness: ${message}` }
  }
}

const convertSymlinkToRealFile = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): ActionResult => {
  const tool = TOOLS[harnessId]
  const skillPath = join(projectPath, tool.skillPath(skillName))
  const symlinkPath = tool.needsDirectory ? dirname(skillPath) : skillPath

  if (!existsSync(symlinkPath)) return { success: true }

  const stat = safeLstat(symlinkPath)
  if (!stat?.isSymbolicLink()) return { success: true }

  const content = readFileSafe(skillPath)
  if (content === null) {
    logError('Skill content missing while detaching', undefined, {
      projectPath,
      harnessId,
      skillName,
      skillPath,
    })
    return { success: false, error: `Failed to read skill content: ${skillPath}` }
  }

  try {
    if (tool.needsDirectory) {
      rmSync(dirname(skillPath), { force: true })
      mkdirSync(dirname(skillPath), { recursive: true })
      writeFileSync(skillPath, content, 'utf-8')
      return { success: true }
    }

    rmSync(skillPath, { force: true })
    writeFileSync(skillPath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    logError('Failed to convert symlink to file', error, {
      projectPath,
      harnessId,
      skillName,
      skillPath,
    })
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Failed to detach skill: ${message}` }
  }
}
