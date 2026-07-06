import { existsSync } from 'fs'
import { join } from 'path'
import { SUPPORTED_TOOLS, TOOLS, type ToolId } from '@/constants'

export const getHarnessBaseDir = (projectPath: string, harnessId: ToolId): string =>
  join(projectPath, ...TOOLS[harnessId].baseDir)

export const harnessExists = (projectPath: string, harnessId: ToolId): boolean =>
  existsSync(getHarnessBaseDir(projectPath, harnessId))

export const enabledHarnesses = (harnesses: string[] | undefined): ToolId[] =>
  (harnesses ?? []).filter((id): id is ToolId => SUPPORTED_TOOLS.includes(id as ToolId))
