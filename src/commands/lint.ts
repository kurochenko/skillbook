import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { fail, plural } from '@/commands/utils'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { lintSkills, type LintFinding } from '@/lib/lint'
import { validateExistingSkillName } from '@/lib/skills'

type RawArgs = Record<string, unknown>

const collectIds = (args: RawArgs): string[] => {
  const ids: string[] = []
  const positional = args.id
  const rest = args._

  if (typeof positional === 'string' && positional.trim()) {
    ids.push(positional.trim())
  }

  if (Array.isArray(rest)) {
    for (const value of rest) {
      if (typeof value === 'string' && value.trim()) ids.push(value.trim())
    }
  }

  return [...new Set(ids)]
}

const validateIds = (ids: string[], json: boolean): void => {
  for (const id of ids) {
    const validation = validateExistingSkillName(id)
    if (!validation.valid) {
      fail(`Invalid skill name "${id}": ${validation.error}`, 1, { json })
    }
  }
}

const formatFinding = (finding: LintFinding): string =>
  `${finding.level === 'error' ? pc.red('error') : pc.yellow('warning')} ${pc.dim(finding.rule)} ${finding.detail}`

export default defineCommand({
  meta: {
    name: 'lint',
    description: 'Lint skills against Agent Skills spec conventions',
  },
  args: {
    id: {
      type: 'positional',
      description: 'Optional skill id to lint',
      required: false,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
    library: {
      type: 'boolean',
      description: 'Lint library skills instead of project skills',
      default: false,
    },
    json: {
      type: 'boolean',
      description: 'Output machine-readable JSON',
      default: false,
    },
  },
  run: async ({ args }) => {
    const rawArgs = args as RawArgs
    const isJson = args.json
    const ids = collectIds(rawArgs)
    validateIds(ids, isJson)

    const context = args.library
      ? getLibraryLockContext()
      : getProjectLockContext(args.project ?? process.cwd())

    const result = lintSkills(context.skillsPath, { ids })

    if (isJson) {
      process.stdout.write(JSON.stringify(result))
      if (!result.ok) process.exit(1)
      return
    }

    if (result.findings.length === 0) {
      p.log.success(pc.green(`lint clean: ${plural(result.skills, 'skill')}`))
      return
    }

    const findingsBySkill = new Map<string, LintFinding[]>()
    for (const finding of result.findings) {
      const existing = findingsBySkill.get(finding.skill) ?? []
      existing.push(finding)
      findingsBySkill.set(finding.skill, existing)
    }

    for (const [skill, findings] of findingsBySkill.entries()) {
      console.log(pc.bold(`\n${skill}`))
      for (const finding of findings) {
        console.log(`  ${formatFinding(finding)}`)
      }
    }

    const errorCount = result.findings.filter((finding) => finding.level === 'error').length
    const warningCount = result.findings.length - errorCount
    p.log.info(
      pc.dim(
        `Summary: ${plural(errorCount, 'error')}, ${plural(warningCount, 'warning')} across ${plural(result.skills, 'skill')}.`,
      ),
    )

    if (!result.ok) process.exit(1)
  },
})
