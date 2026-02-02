import { existsSync, readFileSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { calculateDiff } from '@/lib/library'
import { getLibraryLockContext, getProjectLockContext, type LockContext } from '@/lib/lock-context'
import { getSkillFilePath } from '@/lib/skill-fs'
import { fail } from '@/commands/utils'

type DiffScope = 'library' | 'project'

const resolveScopeContext = (scope: DiffScope, projectPath: string): LockContext =>
  scope === 'library' ? getLibraryLockContext() : getProjectLockContext(projectPath)

export default defineCommand({
  meta: {
    name: 'diff',
    description: 'Show diff stats between library and project skill content',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id to diff',
      required: true,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
    from: {
      type: 'string',
      description: 'Source scope (library or project)',
      default: 'library',
    },
    to: {
      type: 'string',
      description: 'Target scope (library or project)',
      default: 'project',
    },
    json: {
      type: 'boolean',
      description: 'Output machine-readable JSON',
      default: false,
    },
  },
  run: async ({ args }) => {
    const projectPath = args.project ?? process.cwd()
    const skill = args.skill
    const from = args.from as DiffScope
    const to = args.to as DiffScope

    if (!['library', 'project'].includes(from) || !['library', 'project'].includes(to)) {
      fail('Invalid --from/--to. Use library or project.')
    }

    const fromContext = resolveScopeContext(from, projectPath)
    const toContext = resolveScopeContext(to, projectPath)
    const fromFile = getSkillFilePath(fromContext.skillsPath, skill)
    const toFile = getSkillFilePath(toContext.skillsPath, skill)

    if (!existsSync(fromFile)) {
      fail(`Skill not found in ${from}: ${skill}`)
    }
    if (!existsSync(toFile)) {
      fail(`Skill not found in ${to}: ${skill}`)
    }

    const fromContent = readFileSync(fromFile, 'utf-8')
    const toContent = readFileSync(toFile, 'utf-8')
    const diff = calculateDiff(fromContent, toContent)

    if (args.json) {
      process.stdout.write(
        JSON.stringify({ id: skill, from, to, additions: diff.additions, deletions: diff.deletions }),
      )
      return
    }

    p.log.info(`${pc.bold(skill)} ${pc.dim(`[${from} → ${to}]`)}`)
    p.log.info(pc.dim(`+${diff.additions} -${diff.deletions}`))
  },
})
