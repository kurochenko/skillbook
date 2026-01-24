import { defineCommand } from 'citty'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { extractSkillName, validateSkillName } from '../lib/skills.ts'
import {
  addSkillToLibrary,
  skillExists,
  getSkillContent,
  scanProjectSkills,
  type ScannedSkill,
} from '../lib/library.ts'

const formatStatus = (status: ScannedSkill['status']): string => {
  switch (status) {
    case 'new':
      return pc.green('[new]')
    case 'synced':
      return pc.dim('[synced]')
    case 'changed':
      return pc.yellow('[changed]')
  }
}

const formatDuplicate = (hasDuplicates: boolean): string => {
  return hasDuplicates ? pc.red(' ⚠ duplicate') : ''
}

const findDuplicateConflicts = (selected: ScannedSkill[]): Map<string, ScannedSkill[]> => {
  const byName = new Map<string, ScannedSkill[]>()
  for (const skill of selected) {
    const existing = byName.get(skill.name) ?? []
    existing.push(skill)
    byName.set(skill.name, existing)
  }

  const conflicts = new Map<string, ScannedSkill[]>()
  for (const [name, skills] of byName) {
    if (skills.length > 1) {
      conflicts.set(name, skills)
    }
  }
  return conflicts
}

const runBulkAdd = async (force: boolean, basePath: string) => {
  const skills = await scanProjectSkills(basePath)

  if (skills.length === 0) {
    p.log.warn('No skills found')
    p.log.info(pc.dim('Looked in: .claude/skills/, .cursor/rules/, .opencode/skill/'))
    process.exit(0)
  }

  // Group skills by project for display
  const byProject = new Map<string, ScannedSkill[]>()
  for (const skill of skills) {
    const projectSkills = byProject.get(skill.project) ?? []
    projectSkills.push(skill)
    byProject.set(skill.project, projectSkills)
  }

  // Sort projects alphabetically
  const sortedProjects = Array.from(byProject.keys()).sort()
  const projectCount = sortedProjects.length

  const hasDuplicates = skills.some((s) => s.hasDuplicates)

  if (hasDuplicates) {
    p.log.warn(pc.yellow('Some skills exist in multiple locations. Select only one per name.'))
  }

  // Build grouped options for clack groupMultiselect
  const groupedOptions: Record<string, { value: ScannedSkill; label: string; hint?: string }[]> = {}

  for (const project of sortedProjects) {
    const projectSkills = byProject.get(project)!.sort((a, b) => a.name.localeCompare(b.name))

    groupedOptions[`${project} ${pc.dim(`(${projectSkills.length})`)}`] = projectSkills.map((skill) => {
      const statusLabel = formatStatus(skill.status)
      const dupeLabel = formatDuplicate(skill.hasDuplicates)

      return {
        value: skill,
        label: `${statusLabel} ${skill.name}${dupeLabel}`,
      }
    })
  }

  // Pre-select new skills that don't have duplicates
  const initialValues = skills.filter((s) => s.status === 'new' && !s.hasDuplicates)

  let selected: ScannedSkill[]

  // Loop until valid selection (no duplicate conflicts)
  while (true) {
    const result = await p.groupMultiselect({
      message: `Select skills to add (${skills.length} found in ${projectCount} projects):`,
      options: groupedOptions,
      initialValues,
    })

    if (p.isCancel(result)) {
      p.outro(pc.dim('Cancelled'))
      process.exit(0)
    }

    selected = result as ScannedSkill[]

    if (selected.length === 0) {
      p.log.info(pc.dim('No skills selected'))
      process.exit(0)
    }

    const conflicts = findDuplicateConflicts(selected)
    if (conflicts.size === 0) break

    // Show conflict error and loop
    for (const [name, conflicting] of conflicts) {
      const projects = conflicting.map((s) => s.project).join(', ')
      p.log.error(pc.red(`Cannot add multiple versions of '${name}' from: ${projects}`))
    }
    p.log.info(pc.dim('Please select only one version per skill name.'))
  }

  const results = { added: 0, updated: 0, skipped: 0, failed: 0 }

  for (const skill of selected as ScannedSkill[]) {
    if (skill.status === 'synced' && !force) {
      results.skipped++
      continue
    }

    const result = await addSkillToLibrary(skill.name, skill.content)

    if (!result.success) {
      p.log.error(pc.red(`Failed to add '${skill.name}': ${result.error}`))
      results.failed++
      continue
    }

    if (result.action === 'added') {
      p.log.success(`Added '${pc.bold(skill.name)}'`)
      results.added++
    } else if (result.action === 'updated') {
      p.log.success(`Updated '${pc.bold(skill.name)}'`)
      results.updated++
    } else {
      results.skipped++
    }
  }

  const summary = []
  if (results.added > 0) summary.push(pc.green(`${results.added} added`))
  if (results.updated > 0) summary.push(pc.yellow(`${results.updated} updated`))
  if (results.skipped > 0) summary.push(pc.dim(`${results.skipped} skipped`))
  if (results.failed > 0) summary.push(pc.red(`${results.failed} failed`))

  p.outro(summary.join(', '))
}

const runSingleAdd = async (inputPath: string, providedName: string | undefined, force: boolean) => {
  const filePath = resolve(inputPath)

  if (!existsSync(filePath)) {
    p.log.error(pc.red(`File not found: ${inputPath}`))
    process.exit(1)
  }

  if (!filePath.endsWith('.md')) {
    p.log.error(pc.red('Skill file must be a .md file'))
    process.exit(1)
  }

  let skillName: string

  if (providedName) {
    const validation = validateSkillName(providedName)
    if (!validation.valid) {
      p.log.error(pc.red(`Invalid skill name: ${validation.error}`))
      process.exit(1)
    }
    skillName = validation.name
  } else {
    const extracted = extractSkillName(filePath)
    if (!extracted) {
      p.log.error(pc.red('Cannot determine skill name from path'))
      p.log.info(pc.dim('Use --name <name> to specify the skill name'))
      p.log.info(pc.dim('Example: skillbook add ./my-skill.md --name my-skill'))
      process.exit(1)
    }

    const validation = validateSkillName(extracted)
    if (!validation.valid) {
      p.log.error(pc.red(`Extracted name '${extracted}' is invalid: ${validation.error}`))
      p.log.info(pc.dim('Use --name <name> to specify a valid skill name'))
      process.exit(1)
    }
    skillName = validation.name
  }

  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    p.log.error(pc.red(`Failed to read file: ${message}`))
    process.exit(1)
  }

  if (skillExists(skillName)) {
    const existingContent = getSkillContent(skillName)

    if (existingContent === content) {
      p.log.info(pc.cyan(`Skill '${skillName}' already up to date, skipped`))
      return
    }

    if (!force) {
      const shouldOverwrite = await p.confirm({
        message: `Skill '${skillName}' already exists. Overwrite?`,
        initialValue: false,
      })

      if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
        p.log.info(pc.dim('Cancelled'))
        process.exit(0)
      }
    }
  }

  const result = await addSkillToLibrary(skillName, content)

  if (!result.success) {
    p.log.error(pc.red(`Failed to add skill: ${result.error}`))
    process.exit(1)
  }

  // Note: 'skipped' won't happen here - we already handle identical content above
  const actionVerb = result.action === 'added' ? 'Added' : 'Updated'
  const commitInfo = result.commitHash ? pc.dim(` (commit: ${result.commitHash})`) : ''

  p.log.success(`${actionVerb} skill '${pc.bold(skillName)}'${commitInfo}`)
  p.log.info(pc.dim(`Path: ${result.path}`))

  if (result.warning) {
    p.log.warn(pc.yellow(result.warning))
  }
}

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a skill to the library',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Path to the skill file',
      required: false,
    },
    name: {
      type: 'string',
      alias: 'n',
      description: 'Skill name (optional, inferred from path if not provided)',
    },
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Overwrite existing skill without asking',
      default: false,
    },
    bulk: {
      type: 'boolean',
      alias: 'b',
      description: 'Scan project and bulk add skills',
      default: false,
    },
    dir: {
      type: 'string',
      alias: 'd',
      description: 'Directory to scan (used with --bulk, defaults to current directory)',
    },
  },
  run: async ({ args }) => {
    const { path: inputPath, name: providedName, force, bulk, dir } = args

    if (bulk) {
      await runBulkAdd(force, dir ?? '.')
      return
    }

    if (!inputPath) {
      p.log.error(pc.red('Path is required when not using --bulk'))
      p.log.info(pc.dim('Usage: skillbook add <path> or skillbook add --bulk'))
      process.exit(1)
    }

    await runSingleAdd(inputPath, providedName, force)
  },
})
