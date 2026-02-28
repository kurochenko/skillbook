import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { calculateDiff, type DiffStats } from '@/lib/library'
import { getLibraryLockContext, getProjectLockContext, type LockContext } from '@/lib/lock-context'
import { getSkillDir, getSkillFilePath, collectFiles } from '@/lib/skill-fs'
import { computeSkillHash } from '@/lib/skill-hash'
import { SKILL_FILE } from '@/constants'
import { fail } from '@/commands/utils'

type DiffScope = 'library' | 'project'

type FileDiffEntry = {
  file: string
  status: 'added' | 'removed' | 'changed' | 'unchanged'
  additions: number
  deletions: number
}

type DiffJsonOutput = {
  id: string
  from: DiffScope
  to: DiffScope
  additions: number
  deletions: number
  identical: boolean
  files: FileDiffEntry[]
}

const STATUS_LABELS: Record<string, string> = {
  added: pc.green('added'),
  removed: pc.red('removed'),
  changed: pc.yellow('changed'),
}

const resolveScopeContext = (scope: DiffScope, projectPath: string): LockContext =>
  scope === 'library' ? getLibraryLockContext() : getProjectLockContext(projectPath)

const getRelativePaths = (dir: string): string[] =>
  collectFiles(dir).map((f) => f.relativePath)

const computeFileDiffs = (
  fromDir: string,
  toDir: string,
): FileDiffEntry[] => {
  const fromFiles = new Set(getRelativePaths(fromDir))
  const toFiles = new Set(getRelativePaths(toDir))
  const allFiles = new Set([...fromFiles, ...toFiles])
  const entries: FileDiffEntry[] = []

  for (const file of [...allFiles].sort()) {
    const inFrom = fromFiles.has(file)
    const inTo = toFiles.has(file)

    if (inFrom && !inTo) {
      const content = readFileSync(join(fromDir, file), 'utf-8')
      const lines = content.split('\n').filter(l => l.length > 0).length
      entries.push({ file, status: 'removed', additions: 0, deletions: lines })
      continue
    }

    if (!inFrom && inTo) {
      const content = readFileSync(join(toDir, file), 'utf-8')
      const lines = content.split('\n').filter(l => l.length > 0).length
      entries.push({ file, status: 'added', additions: lines, deletions: 0 })
      continue
    }

    const fromContent = readFileSync(join(fromDir, file), 'utf-8')
    const toContent = readFileSync(join(toDir, file), 'utf-8')
    const diff = calculateDiff(fromContent, toContent)

    if (diff.additions === 0 && diff.deletions === 0) {
      entries.push({ file, status: 'unchanged', additions: 0, deletions: 0 })
      continue
    }

    entries.push({ file, status: 'changed', ...diff })
  }

  return entries
}

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
    files: {
      type: 'boolean',
      description: 'Show full file manifest diff',
      default: false,
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
    const showFiles = args.files

    if (!['library', 'project'].includes(from) || !['library', 'project'].includes(to)) {
      fail('Invalid --from/--to. Use library or project.')
    }

    const fromContext = resolveScopeContext(from, projectPath)
    const toContext = resolveScopeContext(to, projectPath)
    const fromDir = getSkillDir(fromContext.skillsPath, skill)
    const toDir = getSkillDir(toContext.skillsPath, skill)
    const fromFile = getSkillFilePath(fromContext.skillsPath, skill)
    const toFile = getSkillFilePath(toContext.skillsPath, skill)

    if (!existsSync(fromFile)) {
      fail(`Skill not found in ${from}: ${skill}`)
    }
    if (!existsSync(toFile)) {
      fail(`Skill not found in ${to}: ${skill}`)
    }

    const fromHash = await computeSkillHash(fromDir)
    const toHash = await computeSkillHash(toDir)

    const fromContent = readFileSync(fromFile, 'utf-8')
    const toContent = readFileSync(toFile, 'utf-8')
    const skillDiff = calculateDiff(fromContent, toContent)

    const fileDiffs = fromHash !== toHash
      ? computeFileDiffs(fromDir, toDir)
      : []

    if (args.json) {
      const output: DiffJsonOutput = {
        id: skill,
        from,
        to,
        additions: skillDiff.additions,
        deletions: skillDiff.deletions,
        identical: fromHash === toHash,
        files: fileDiffs,
      }
      process.stdout.write(JSON.stringify(output))
      return
    }

    p.log.info(`${pc.bold(skill)} ${pc.dim(`[${from} → ${to}]`)}`)

    if (fromHash === toHash) {
      p.log.info(pc.green('No changes (directories identical)'))
      return
    }

    p.log.info(`${SKILL_FILE}: ${pc.green(`+${skillDiff.additions}`)} ${pc.red(`-${skillDiff.deletions}`)}`)

    if (showFiles && fileDiffs.length > 0) {
      p.log.info('')
      p.log.info(pc.bold('Files:'))
      for (const entry of fileDiffs) {
        if (entry.status === 'unchanged') continue

        const label = STATUS_LABELS[entry.status] ?? entry.status
        const stats = entry.status === 'changed'
          ? ` ${pc.green(`+${entry.additions}`)} ${pc.red(`-${entry.deletions}`)}`
          : ''
        p.log.info(`  ${entry.file} [${label}]${stats}`)
      }
    }
  },
})
