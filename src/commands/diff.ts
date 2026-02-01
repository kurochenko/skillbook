import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { SKILL_FILE } from '@/constants'
import { calculateDiff } from '@/lib/library'
import { getLockLibraryPath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

type DiffScope = 'library' | 'project'

const resolveScopeRoot = (scope: DiffScope, projectPath: string) =>
  scope === 'library' ? getLockLibraryPath() : getProjectLockRoot(projectPath)

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

    const fromRoot = resolveScopeRoot(from, projectPath)
    const toRoot = resolveScopeRoot(to, projectPath)
    const fromFile = join(getLockSkillsPath(fromRoot), skill, SKILL_FILE)
    const toFile = join(getLockSkillsPath(toRoot), skill, SKILL_FILE)

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
