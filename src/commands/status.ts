import { defineCommand } from 'citty'
import pc from 'picocolors'
import * as p from '@clack/prompts'

import { computeSkillHash } from '@/lib/skill-hash'
import { readLockFile } from '@/lib/lockfile'
import { resolveLockStatus, type LockStatus } from '@/lib/lock-status'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir, listSkillIds } from '@/lib/skill-fs'

type StatusSkill = {
  id: string
  status: LockStatus
  projectHash: string
  project: { version?: number; hash?: string } | null
  library: { version?: number; hash?: string } | null
}

type StatusSummary = {
  total: number
  synced: number
  ahead: number
  behind: number
  diverged: number
  localOnly: number
}

type StatusOutput = {
  project: {
    path: string
    root: string
    skillsPath: string
    lockFile: string
  }
  library: {
    path: string
    skillsPath: string
    lockFile: string
  }
  summary: StatusSummary
  skills: StatusSkill[]
}

const createSummary = (): StatusSummary => ({
  total: 0,
  synced: 0,
  ahead: 0,
  behind: 0,
  diverged: 0,
  localOnly: 0,
})

const updateSummary = (summary: StatusSummary, status: LockStatus): StatusSummary => {
  const next = { ...summary, total: summary.total + 1 }
  if (status === 'synced') return { ...next, synced: next.synced + 1 }
  if (status === 'ahead') return { ...next, ahead: next.ahead + 1 }
  if (status === 'behind') return { ...next, behind: next.behind + 1 }
  if (status === 'diverged') return { ...next, diverged: next.diverged + 1 }
  if (status === 'local-only') return { ...next, localOnly: next.localOnly + 1 }
  return next
}

export default defineCommand({
  meta: {
    name: 'status',
    description: 'Show lock-based status for project skills in .skillbook',
  },
  args: {
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
    json: {
      type: 'boolean',
      description: 'Output machine-readable JSON',
      default: false,
    },
  },
  run: async ({ args }) => {
    const projectPath = args.project ?? process.cwd()
    const projectContext = getProjectLockContext(projectPath)
    const libraryContext = getLibraryLockContext()

    const libraryLock = readLockFile(libraryContext.lockFilePath)
    const projectLock = readLockFile(projectContext.lockFilePath)

    const skillNames = listSkillIds(projectContext.skillsPath)
    const skills: StatusSkill[] = []
    let summary = createSummary()

    for (const skillId of skillNames) {
      const skillDir = getSkillDir(projectContext.skillsPath, skillId)
      const projectHash = await computeSkillHash(skillDir)
      const projectEntry = projectLock.skills[skillId] ?? null
      const libraryEntry = libraryLock.skills[skillId] ?? null
      const status = resolveLockStatus({ projectHash, projectEntry, libraryEntry })

      skills.push({
        id: skillId,
        status,
        projectHash,
        project: projectEntry
          ? { version: projectEntry.version, hash: projectEntry.hash }
          : null,
        library: libraryEntry
          ? { version: libraryEntry.version, hash: libraryEntry.hash }
          : null,
      })

      summary = updateSummary(summary, status)
    }

    const output: StatusOutput = {
      project: {
        path: projectPath,
        root: projectContext.root,
        skillsPath: projectContext.skillsPath,
        lockFile: projectContext.lockFilePath,
      },
      library: {
        path: libraryContext.root,
        skillsPath: libraryContext.skillsPath,
        lockFile: libraryContext.lockFilePath,
      },
      summary,
      skills,
    }

    if (args.json) {
      process.stdout.write(JSON.stringify(output))
      return
    }

    if (skills.length === 0) {
      p.log.info(pc.dim('No skills installed in project'))
      return
    }
    p.log.info(
      pc.dim(
        `Skills: ${summary.total} (synced ${summary.synced}, ahead ${summary.ahead}, behind ${summary.behind}, diverged ${summary.diverged}, local-only ${summary.localOnly})`,
      ),
    )

    const statusColor = (status: LockStatus): ((value: string) => string) => {
      if (status === 'synced') return pc.green
      if (status === 'ahead') return pc.yellow
      if (status === 'behind') return pc.cyan
      if (status === 'diverged') return pc.red
      if (status === 'local-only') return pc.magenta
      return pc.dim
    }

    const headerSkill = 'Skill'
    const headerStatus = 'Status'
    const skillWidth = Math.max(
      headerSkill.length,
      ...skills.map((skill) => skill.id.length),
    )

    const pad = (value: string, width: number) => value.padEnd(width)

    console.log(`${pc.bold(pad(headerSkill, skillWidth))}  ${pc.bold(headerStatus)}`)
    for (const skill of skills) {
      const colorize = statusColor(skill.status)
      console.log(`${pad(skill.id, skillWidth)}  ${colorize(`[${skill.status}]`)}`)
    }
  },
})
