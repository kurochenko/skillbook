import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync } from 'fs'
import { join, dirname } from 'path'
import { readConfig, setHarnessEnabled } from '@/lib/config'
import { TOOLS, type ToolId, SUPPORTED_TOOLS } from '@/constants'
import { isSkillSymlinked, convertToSymlink } from '@/lib/symlinks'

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
  } catch {
    return null
  }
}

const readFileSafe = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
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
): void => {
  setHarnessEnabled(projectPath, harnessId, true, currentlyEnabled)
  for (const skillName of installedSkillNames) {
    convertToSymlink(projectPath, harnessId, skillName)
  }
}

export const removeHarness = (
  projectPath: string,
  harnessId: ToolId,
  currentlyEnabled: string[],
): void => {
  const baseDir = getHarnessBaseDir(projectPath, harnessId)
  setHarnessEnabled(projectPath, harnessId, false, currentlyEnabled)
  if (existsSync(baseDir)) {
    rmSync(baseDir, { recursive: true, force: true })
  }
}

export const detachHarness = (
  projectPath: string,
  harnessId: ToolId,
  installedSkillNames: string[],
  currentlyEnabled: string[],
): void => {
  for (const skillName of installedSkillNames) {
    convertSymlinkToRealFile(projectPath, harnessId, skillName)
  }
  setHarnessEnabled(projectPath, harnessId, false, currentlyEnabled)
}

const convertSymlinkToRealFile = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): void => {
  const tool = TOOLS[harnessId]
  const skillPath = join(projectPath, tool.skillPath(skillName))
  const symlinkPath = tool.needsDirectory ? dirname(skillPath) : skillPath

  if (!existsSync(symlinkPath)) return

  const stat = safeLstat(symlinkPath)
  if (!stat?.isSymbolicLink()) return

  const content = readFileSafe(skillPath)
  if (content === null) return

  if (tool.needsDirectory) {
    rmSync(dirname(skillPath), { force: true })
    mkdirSync(dirname(skillPath), { recursive: true })
    writeFileSync(skillPath, content, 'utf-8')
    return
  }

  rmSync(skillPath, { force: true })
  writeFileSync(skillPath, content, 'utf-8')
}
