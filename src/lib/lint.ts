import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { SKILL_FILE } from '@/constants'
import { listSkillIds } from '@/lib/skill-fs'
import { validateSkillName } from '@/lib/skills'

export type LintLevel = 'error' | 'warning'

export type LintRule =
  | 'name-spec'
  | 'frontmatter'
  | 'name-mismatch'
  | 'description-length'
  | 'body-length'
  | 'unknown-frontmatter'
  | 'unknown-skill'

export type LintFinding = {
  skill: string
  level: LintLevel
  rule: LintRule
  detail: string
}

export type LintResult = {
  ok: boolean
  findings: LintFinding[]
  skills: number
}

export type ParsedFrontmatter = {
  fields: Record<string, string>
  body: string
  error?: string
}

export type LintSkillsOptions = {
  ids?: string[]
}

const KNOWN_FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
  'disallowed-tools',
])

const lineCount = (content: string): number => {
  if (content.length === 0) return 0
  const lines = content.split(/\r\n|\r|\n/)
  // a trailing newline produces a phantom empty last element, not a real line
  if (lines[lines.length - 1] === '') lines.pop()
  return lines.length
}

export const parseSkillFrontmatter = (content: string): ParsedFrontmatter => {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')

  if (lines[0] !== '---') {
    return {
      fields: {},
      body: normalized,
      error: `${SKILL_FILE} must start with YAML frontmatter containing non-empty name and description fields`,
    }
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---')
  if (closingIndex === -1) {
    return {
      fields: {},
      body: '',
      error: `${SKILL_FILE} frontmatter must close with ---`,
    }
  }

  const fields: Record<string, string> = {}
  for (const line of lines.slice(1, closingIndex)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^([^:]+):\s*(.*)$/)
    if (!match) continue

    const key = match[1].trim()
    const rawValue = match[2].trim()
    const value = rawValue.replace(/^['"]|['"]$/g, '')
    fields[key] = value
  }

  return {
    fields,
    body: lines.slice(closingIndex + 1).join('\n'),
  }
}

const lintSkillContent = (skill: string, content: string): LintFinding[] => {
  const findings: LintFinding[] = []
  const nameValidation = validateSkillName(skill)

  if (!nameValidation.valid) {
    findings.push({
      skill,
      level: 'error',
      rule: 'name-spec',
      detail: `Skill name '${skill}' is not Agent Skills spec-compliant: ${nameValidation.error}. Rename the skill directory to fix this.`,
    })
  }

  const parsed = parseSkillFrontmatter(content)
  if (parsed.error) {
    findings.push({
      skill,
      level: 'error',
      rule: 'frontmatter',
      detail: parsed.error,
    })
  }

  const name = parsed.fields.name?.trim()
  const description = parsed.fields.description?.trim()

  if (!parsed.error && (!name || !description)) {
    findings.push({
      skill,
      level: 'error',
      rule: 'frontmatter',
      detail: `${SKILL_FILE} frontmatter must contain non-empty name and description fields`,
    })
  }

  if (name && name !== skill) {
    findings.push({
      skill,
      level: 'error',
      rule: 'name-mismatch',
      detail: `Frontmatter name '${name}' must match directory name '${skill}'`,
    })
  }

  if (description && description.length > 1024) {
    findings.push({
      skill,
      level: 'error',
      rule: 'description-length',
      detail: `Frontmatter description is ${description.length} characters; maximum is 1024`,
    })
  }

  const lines = lineCount(content)
  if (lines > 500) {
    findings.push({
      skill,
      level: 'warning',
      rule: 'body-length',
      detail: `${SKILL_FILE} is ${lines} lines; Agent Skills recommends staying under 500 lines with progressive disclosure`,
    })
  }

  for (const key of Object.keys(parsed.fields).sort()) {
    if (KNOWN_FRONTMATTER_KEYS.has(key)) continue
    findings.push({
      skill,
      level: 'warning',
      rule: 'unknown-frontmatter',
      detail: `Unknown frontmatter key '${key}' may be tool-specific`,
    })
  }

  return findings
}

export const lintSkills = (skillsPath: string, options: LintSkillsOptions = {}): LintResult => {
  const availableIds = listSkillIds(skillsPath)
  const requestedIds = options.ids?.length ? [...new Set(options.ids)] : null
  const ids = requestedIds
    ? availableIds.filter((id) => requestedIds.includes(id))
    : availableIds
  const findings: LintFinding[] = []

  for (const id of requestedIds ?? []) {
    if (availableIds.includes(id)) continue
    findings.push({
      skill: id,
      level: 'error',
      rule: 'unknown-skill',
      detail: `Skill '${id}' not found in ${skillsPath}`,
    })
  }

  for (const skill of ids) {
    const skillFile = join(skillsPath, skill, SKILL_FILE)
    if (!existsSync(skillFile)) continue

    const content = readFileSync(skillFile, 'utf-8')
    findings.push(...lintSkillContent(skill, content))
  }

  return {
    ok: !findings.some((finding) => finding.level === 'error'),
    findings,
    skills: ids.length,
  }
}
