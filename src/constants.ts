export const TOOLS = {
  'claude-code': {
    name: 'Claude Code',
    skillPath: (name: string) => `.claude/skills/${name}/SKILL.md`,
    needsDirectory: true,
  },
  codex: {
    name: 'Codex',
    skillPath: (name: string) => `.codex/skills/${name}/SKILL.md`,
    needsDirectory: true,
  },
  cursor: {
    name: 'Cursor',
    skillPath: (name: string) => `.cursor/rules/${name}.md`,
    needsDirectory: false,
  },
  opencode: {
    name: 'OpenCode',
    skillPath: (name: string) => `.opencode/skill/${name}/SKILL.md`,
    needsDirectory: true,
  },
} as const

export type ToolId = keyof typeof TOOLS

export const SUPPORTED_TOOLS = Object.keys(TOOLS) as ToolId[]

export const DEFAULT_LIBRARY_PATH = '~/.skillbook'
export const SKILLBOOK_DIR = '.skillbook'
export const SKILLS_DIR = 'skills'
export const SKILL_FILE = 'SKILL.md'
