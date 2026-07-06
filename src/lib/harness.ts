import { existsSync } from 'fs'
import { join } from 'path'
import { TOOLS, type ToolId } from '@/constants'

export const getHarnessBaseDir = (projectPath: string, harnessId: ToolId): string =>
  join(projectPath, ...TOOLS[harnessId].baseDir)

export const harnessExists = (projectPath: string, harnessId: ToolId): boolean =>
  existsSync(getHarnessBaseDir(projectPath, harnessId))
