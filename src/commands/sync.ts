import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { plural, readLockFileOrFail } from '@/commands/utils'
import { ensureHarnessModeAfterSync } from '@/commands/harness'
import { SUPPORTED_TOOLS, type ToolId } from '@/constants'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getHarnessStatus, syncHarnessSkills } from '@/lib/lock-harness'
import { enabledHarnesses } from '@/lib/harness'
import { resolveLockStatus, type LockStatus } from '@/lib/lock-status'
import { getHarnessMode, type HarnessMode } from '@/lib/lockfile'
import { pullSkill } from '@/lib/lock-operations'
import { computeSkillHash } from '@/lib/skill-hash'
import { getSkillDir, listSkillIds } from '@/lib/skill-fs'

type SkillAction =
  | 'none'
  | 'pulled'
  | 'would-pull'
  | 'ahead'
  | 'diverged'
  | 'local-only'
  | 'error'

type SyncSkill = {
  id: string
  status: LockStatus
  action: SkillAction
  error?: string
}

type SyncHarness = {
  id: ToolId
  synced: number
  drifted: number
  conflicts: number
  removedStale: number
  mode: HarnessMode
}

type SyncOutput = {
  ok: boolean
  skills: SyncSkill[]
  harnesses: SyncHarness[]
}

const printSkillLine = (skill: SyncSkill) => {
  if (skill.action === 'pulled') {
    p.log.success(`Pulled ${pc.bold(skill.id)}`)
    return
  }

  if (skill.action === 'would-pull') {
    p.log.info(pc.dim(`Would pull ${skill.id}`))
    return
  }

  if (skill.action === 'ahead') {
    p.log.warn(pc.yellow(`${skill.id}: ahead (push when ready)`))
    return
  }

  if (skill.action === 'diverged') {
    p.log.warn(
      pc.red(
        `${skill.id}: diverged (run 'skillbook resolve ${skill.id} --strategy library|project')`,
      ),
    )
    return
  }

  if (skill.action === 'local-only') {
    p.log.info(pc.magenta(`${skill.id}: local-only (run 'skillbook push ${skill.id}' to publish)`))
    return
  }

  if (skill.action === 'error') {
    p.log.warn(pc.red(`${skill.id}: ${skill.error ?? 'sync failed'}`))
  }
}

const printHarnessLine = (harness: SyncHarness, dryRun: boolean) => {
  const prefix = dryRun ? `${harness.id} current` : `${harness.id}`
  p.log.info(
    pc.dim(
      `${prefix}: synced ${harness.synced}, drifted ${harness.drifted}, conflicts ${harness.conflicts}, removed ${harness.removedStale} stale (${harness.mode})`,
    ),
  )
}

export default defineCommand({
  meta: {
    name: 'sync',
    description: 'Pull behind skills and sync enabled harnesses for a project',
  },
  args: {
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite drifted harness copies',
      default: false,
    },
    dryRun: {
      type: 'boolean',
      description: 'Show what would change without writing',
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
    const projectContext = getProjectLockContext(projectPath)
    const libraryContext = getLibraryLockContext()

    const libraryLock = readLockFileOrFail(libraryContext.lockFilePath)
    const initialProjectLock = readLockFileOrFail(projectContext.lockFilePath)
    const skillIds = listSkillIds(projectContext.skillsPath)

    const skills: SyncSkill[] = []
    let skillConflictCount = 0

    for (const skillId of skillIds) {
      const skillDir = getSkillDir(projectContext.skillsPath, skillId)
      const projectHash = await computeSkillHash(skillDir)
      const projectEntry = initialProjectLock.skills[skillId] ?? null
      const libraryEntry = libraryLock.skills[skillId] ?? null
      const status = resolveLockStatus({ projectHash, projectEntry, libraryEntry })

      if (status === 'behind') {
        if (args.dryRun) {
          skills.push({ id: skillId, status, action: 'would-pull' })
          continue
        }

        const result = await pullSkill(skillId, projectPath)
        if (result.success) {
          skills.push({ id: skillId, status, action: result.alreadyUpToDate ? 'none' : 'pulled' })
          skillConflictCount += result.conflicts ?? 0
        } else {
          skills.push({ id: skillId, status, action: 'error', error: result.error })
        }
        continue
      }

      if (status === 'ahead') {
        skills.push({ id: skillId, status, action: 'ahead' })
        continue
      }

      if (status === 'diverged') {
        skills.push({ id: skillId, status, action: 'diverged' })
        continue
      }

      if (status === 'local-only') {
        skills.push({ id: skillId, status, action: 'local-only' })
        continue
      }

      skills.push({ id: skillId, status, action: 'none' })
    }

    const latestProjectLock = readLockFileOrFail(projectContext.lockFilePath)
    const harnesses: SyncHarness[] = []
    let dryRunMissingHarnessEntries = 0

    for (const harnessId of enabledHarnesses(latestProjectLock.harnesses)) {
      const configuredMode = getHarnessMode(latestProjectLock, harnessId)

      if (args.dryRun) {
        const result = getHarnessStatus(projectPath, harnessId, configuredMode)
        dryRunMissingHarnessEntries += result.missing
        harnesses.push({
          id: harnessId,
          synced: result.synced,
          drifted: result.drifted,
          conflicts: result.conflicts,
          removedStale: result.stale,
          mode: result.mode,
        })
        continue
      }

      const result = syncHarnessSkills(projectPath, harnessId, {
        mode: configuredMode,
        force: args.force,
        allowModeFallback: true,
      })

      if (result.mode !== configuredMode) {
        const currentLock = readLockFileOrFail(projectContext.lockFilePath)
        ensureHarnessModeAfterSync(projectContext.lockFilePath, currentLock, harnessId, result.mode)
      }

      harnesses.push({
        id: harnessId,
        synced: result.synced,
        drifted: result.drifted,
        conflicts: result.conflicts,
        removedStale: result.removedStale,
        mode: result.mode,
      })
    }

    const hasDiverged = skills.some((skill) => skill.status === 'diverged')
    const hasErrors = skills.some((skill) => skill.action === 'error')
    const harnessConflictCount = harnesses.reduce((sum, harness) => sum + harness.conflicts, 0)
    const ok = !hasDiverged && !hasErrors && skillConflictCount === 0 && harnessConflictCount === 0
    const output: SyncOutput = { ok, skills, harnesses }

    if (args.json) {
      process.stdout.write(JSON.stringify(output))
      if (!ok) process.exit(2)
      return
    }

    const attentionSkills = skills.filter((skill) => skill.action !== 'none')
    const harnessesNeedingAttention = harnesses.filter(
      (harness) => harness.drifted > 0 || harness.conflicts > 0 || harness.removedStale > 0,
    )

    if (attentionSkills.length === 0 && harnessesNeedingAttention.length === 0 && dryRunMissingHarnessEntries === 0) {
      p.log.success(`All ${plural(skillIds.length, 'skill')} synced, ${plural(harnesses.length, 'harness', 'harnesses')} up to date.`)
    } else {
      for (const skill of attentionSkills) printSkillLine(skill)
      for (const harness of harnesses) printHarnessLine(harness, args.dryRun)

      const pulled = skills.filter((skill) => skill.action === 'pulled').length
      const wouldPull = skills.filter((skill) => skill.action === 'would-pull').length
      const ahead = skills.filter((skill) => skill.status === 'ahead').length
      const diverged = skills.filter((skill) => skill.status === 'diverged').length
      const localOnly = skills.filter((skill) => skill.status === 'local-only').length
      const drifted = harnesses.reduce((sum, harness) => sum + harness.drifted, 0)
      const conflicts = skillConflictCount + harnessConflictCount
      const removedStale = harnesses.reduce((sum, harness) => sum + harness.removedStale, 0)
      const missing = args.dryRun ? `, ${dryRunMissingHarnessEntries} missing` : ''

      p.log.info(
        pc.dim(
          `Summary: ${pulled} pulled, ${wouldPull} would pull, ${ahead} ahead, ${diverged} diverged, ${localOnly} local-only, ${drifted} drifted, ${conflicts} conflicts, ${removedStale} stale removed${missing}.`,
        ),
      )
    }

    if (!ok) process.exit(2)
  },
})
