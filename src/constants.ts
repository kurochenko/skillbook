// Tool configurations for symlink targets
export const TOOLS = {
  'claude-code': {
    name: 'Claude Code',
    skillPath: (name: string) => `.claude/skills/${name}/SKILL.md`,
    needsDirectory: true,
  },
  cursor: {
    name: 'Cursor',
    skillPath: (name: string) => `.cursor/rules/${name}.md`,
    needsDirectory: false,
  },
  opencode: {
    name: 'OpenCode',
    skillPath: (name: string) => `.opencode/skills/${name}.md`,
    needsDirectory: false,
  },
} as const

export type ToolId = keyof typeof TOOLS

export const SUPPORTED_TOOLS = Object.keys(TOOLS) as ToolId[]

// Default paths
export const DEFAULT_LIBRARY_PATH = '~/.config/skillbook'
export const SKILLS_DIR = 'skills'
export const SKILL_FILE = 'SKILL.md'
