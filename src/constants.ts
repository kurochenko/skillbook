export const DEFAULT_LIBRARY_PATH = '~/.skillbook'
export const SKILLBOOK_DIR = '.skillbook'
export const SKILLS_DIR = 'skills'
export const SKILL_FILE = 'SKILL.md'

export const LOCK_BASE_DIR = '.skillbook'
export const LOCK_SKILLS_DIR = 'skills'
export const LOCK_FILE = 'skillbook.lock.json'
export const LOCK_LIBRARY_ENV = 'SKILLBOOK_LOCK_LIBRARY'

type ToolPathConfig = {
  name: string
  baseDir: readonly string[]
  needsDirectory: boolean
  fileSuffix?: string
}

const getSkillPathFromToolConfig = (tool: ToolPathConfig, name: string): string => {
  const basePath = tool.baseDir.join('/')
  if (tool.needsDirectory) return `${basePath}/${name}/${SKILL_FILE}`
  return `${basePath}/${name}${tool.fileSuffix ?? ''}`
}

const defineTool = <const T extends ToolPathConfig>(tool: T): T & { skillPath: (name: string) => string } => ({
  ...tool,
  skillPath: (name: string) => getSkillPathFromToolConfig(tool, name),
})

export const TOOLS = {
  'claude-code': defineTool({
    name: 'Claude Code',
    baseDir: ['.claude', 'skills'],
    needsDirectory: true,
  }),
  codex: defineTool({
    name: 'Codex',
    baseDir: ['.agents', 'skills'],
    needsDirectory: true,
  }),
  cursor: defineTool({
    name: 'Cursor',
    baseDir: ['.cursor', 'skills'],
    needsDirectory: true,
  }),
  opencode: defineTool({
    name: 'OpenCode',
    baseDir: ['.opencode', 'skill'],
    needsDirectory: true,
  }),
  pi: defineTool({
    name: 'Pi',
    baseDir: ['.pi', 'skills'],
    needsDirectory: true,
  }),
} as const

export type ToolId = keyof typeof TOOLS

export const SUPPORTED_TOOLS = Object.keys(TOOLS) as ToolId[]
