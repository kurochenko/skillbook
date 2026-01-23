import type { ToolId } from './constants.ts'

export type SkillInfo = {
  name: string
  path: string
  description?: string
}

export type InstallOptions = {
  tools: ToolId[]
  skills: string[]
  force?: boolean
}

export type AddOptions = {
  force?: boolean
}
