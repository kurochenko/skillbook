import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import {
  addSkillToLibrary,
  scanProjectSkills,
  type ScannedSkill,
} from '../lib/library.ts'

const formatStatus = (skill: ScannedSkill): string => {
  switch (skill.status) {
    case 'detached':
      return pc.dim('[detached]')
    case 'synced':
      return pc.green('[synced]')
    case 'ahead': {
      const diff = skill.diff
      if (diff) {
        const parts = []
        if (diff.additions > 0) parts.push(`+${diff.additions}`)
        if (diff.deletions > 0) parts.push(`-${diff.deletions}`)
        return pc.yellow(`[ahead ${parts.join('/')}]`)
      }
      return pc.yellow('[ahead]')
    }
  }
}

const formatConflict = (skill: ScannedSkill): string => {
  if (!skill.hasConflict) return ''
  return pc.red(` ⚠ 1 of ${skill.conflictCount} variants`)
}

/**
 * Find skills where user selected multiple versions with DIFFERENT content.
 */
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
      const uniqueContents = new Set(skills.map((s) => s.content))
      if (uniqueContents.size > 1) {
        conflicts.set(name, skills)
      }
    }
  }
  return conflicts
}

export default defineCommand({
  meta: {
    name: 'scan',
    description: 'Scan for skills and add them to your library',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Directory to scan (defaults to current directory)',
      required: false,
    },
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Overwrite existing skills without asking',
      default: false,
    },
  },
  run: async ({ args }) => {
    const { path: basePath = '.', force } = args

    p.intro(pc.cyan('Scan for skills'))

    const skills = await scanProjectSkills(basePath)

    if (skills.length === 0) {
      p.log.warn('No skills found')
      p.log.info(pc.dim('Looked in: .claude/skills/, .cursor/rules/, .opencode/skill/'))
      p.outro(pc.dim('Nothing to add'))
      process.exit(0)
    }

    // Group skills by project for display
    const byProject = new Map<string, ScannedSkill[]>()
    for (const skill of skills) {
      const projectSkills = byProject.get(skill.project) ?? []
      projectSkills.push(skill)
      byProject.set(skill.project, projectSkills)
    }

    const sortedProjects = Array.from(byProject.keys()).sort()
    const projectCount = sortedProjects.length

    // Show legend
    const detachedCount = skills.filter((s) => s.status === 'detached').length
    const syncedCount = skills.filter((s) => s.status === 'synced').length
    const aheadCount = skills.filter((s) => s.status === 'ahead').length

    const legend = []
    if (detachedCount > 0) legend.push(`${pc.dim('[detached]')} not synced to library`)
    if (syncedCount > 0) legend.push(`${pc.green('[synced]')} in library, matches`)
    if (aheadCount > 0) legend.push(`${pc.yellow('[ahead]')} in library, local has changes`)
    p.log.message(legend.join('  '))

    const hasConflicts = skills.some((s) => s.hasConflict)
    if (hasConflicts) {
      p.log.warn(pc.yellow('Some skills have multiple variants. Select only one per name.'))
    }

    // Build grouped options
    const groupedOptions: Record<string, { value: ScannedSkill; label: string }[]> = {}

    for (const project of sortedProjects) {
      const projectSkills = byProject.get(project)!.sort((a, b) => a.name.localeCompare(b.name))

      groupedOptions[`${project} ${pc.dim(`(${projectSkills.length})`)}`] = projectSkills.map((skill) => ({
        value: skill,
        label: `${formatStatus(skill)} ${skill.name}${formatConflict(skill)}`,
      }))
    }

    // Pre-select detached skills without conflicts
    const initialValues = skills.filter((s) => s.status === 'detached' && !s.hasConflict)

    let selected: ScannedSkill[]

    while (true) {
      const result = await p.groupMultiselect({
        message: `Select skills to add to library (${skills.length} in ${projectCount} projects):`,
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

      for (const [name, conflicting] of conflicts) {
        const projects = conflicting.map((s) => s.project).join(', ')
        p.log.error(pc.red(`Cannot add multiple versions of '${name}' from: ${projects}`))
      }
      p.log.info(pc.dim('Please select only one version per skill name.'))
    }

    const results = { added: 0, updated: 0, skipped: 0, failed: 0 }

    for (const skill of selected) {
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
  },
})
