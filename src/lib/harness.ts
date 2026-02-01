import { existsSync } from 'fs'
import { join } from 'path'
import { type ToolId } from '@/constants'

const HARNESS_BASE_DIRS: Record<ToolId, string[]> = {
  'claude-code': ['.claude', 'skills'],
  opencode: ['.opencode', 'skill'],
  cursor: ['.cursor', 'rules'],
}

export const getHarnessBaseDir = (projectPath: string, harnessId: ToolId): string =>
  join(projectPath, ...HARNESS_BASE_DIRS[harnessId])

export const harnessExists = (projectPath: string, harnessId: ToolId): boolean =>
  existsSync(getHarnessBaseDir(projectPath, harnessId))
