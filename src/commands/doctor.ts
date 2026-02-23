import { existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { SUPPORTED_TOOLS, type ToolId } from '@/constants'
import { getHarnessStatus } from '@/lib/lock-harness'
import { getLibraryLockContext, getProjectLockContext, type LockContext } from '@/lib/lock-context'
import { getHarnessMode, readLockFile } from '@/lib/lockfile'

const checkGitStatus = (rootPath: string) => {
  const gitDir = join(rootPath, '.git')
  if (!existsSync(gitDir)) {
    return { ok: true, dirty: false, warning: 'Library is not a git repository.' }
  }

  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: rootPath,
    encoding: 'utf-8',
  })

  if (result.status !== 0) {
    return { ok: false, dirty: false, error: result.stderr || 'Failed to run git status.' }
  }

  const dirty = result.stdout.trim().length > 0
  return { ok: true, dirty }
}

const getProjectHarnessWarnings = (projectPath: string, context: LockContext): string[] => {
  const lock = readLockFile(context.lockFilePath)
  const enabledHarnesses = (lock.harnesses ?? [])
    .filter((h): h is ToolId => SUPPORTED_TOOLS.includes(h as ToolId))

  const warnings: string[] = []

  for (const harnessId of enabledHarnesses) {
    const mode = getHarnessMode(lock, harnessId)
    const status = getHarnessStatus(projectPath, harnessId, mode)
    if (status.total === 0) continue

    if (status.drifted > 0) {
      warnings.push(
        `Harness '${harnessId}' (${mode}) has ${status.drifted} drifted skill${status.drifted === 1 ? '' : 's'}.`,
      )
    }

    if (status.conflicts > 0) {
      warnings.push(
        `Harness '${harnessId}' (${mode}) has ${status.conflicts} conflicting path${status.conflicts === 1 ? '' : 's'}.`,
      )
    }

    if (status.missing > 0) {
      warnings.push(
        `Harness '${harnessId}' (${mode}) is missing ${status.missing} skill entr${status.missing === 1 ? 'y' : 'ies'}.`,
      )
    }
  }

  return warnings
}

const checkPaths = (
  label: string,
  context: LockContext,
  checkGit: boolean,
  projectPath?: string,
) => {
  const lockFile = context.lockFilePath
  const skillsPath = context.skillsPath
  const errors: string[] = []
  const warnings: string[] = []

  if (!existsSync(lockFile)) {
    errors.push(`Missing lock file: ${lockFile}`)
  }

  if (!existsSync(skillsPath)) {
    errors.push(`Missing skills directory: ${skillsPath}`)
  }

  if (errors.length > 0) {
    p.log.error(pc.red(`${label} issues:`))
    for (const error of errors) {
      p.log.error(pc.red(`- ${error}`))
    }
    return { ok: false, dirty: false }
  }

  if (checkGit) {
    const gitStatus = checkGitStatus(context.root)
    if (!gitStatus.ok) {
      p.log.error(pc.red(`- ${gitStatus.error}`))
      return { ok: false, dirty: false }
    }
    if (gitStatus.warning) {
      warnings.push(gitStatus.warning)
    }
    if (gitStatus.dirty) {
      warnings.push('Library has uncommitted changes.')
    }
  }

  if (projectPath) {
    warnings.push(...getProjectHarnessWarnings(projectPath, context))
  }

  p.log.success(`${label} OK`)
  for (const warning of warnings) {
    p.log.warn(pc.yellow(`- ${warning}`))
  }
  return { ok: true, dirty: warnings.some((warning) => warning.includes('uncommitted')) }
}

export default defineCommand({
  meta: {
    name: 'doctor',
    description: 'Validate lock-based setup for library or project',
  },
  args: {
    library: {
      type: 'boolean',
      description: 'Check lock-based library',
      default: false,
    },
    project: {
      type: 'string',
      description: 'Check lock-based project at path',
    },
  },
  run: async ({ args }) => {
    const checks: Array<{ label: string; context: LockContext; projectPath?: string }> = []

    if (args.library) {
      checks.push({ label: 'Library', context: getLibraryLockContext() })
    }

    if (args.project) {
      checks.push({ label: 'Project', context: getProjectLockContext(args.project), projectPath: args.project })
    }

    if (checks.length === 0) {
      checks.push({ label: 'Library', context: getLibraryLockContext() })
    }

    let ok = true
    let dirty = false
    for (const check of checks) {
      const result = checkPaths(
        check.label,
        check.context,
        check.label === 'Library',
        check.projectPath,
      )
      if (!result.ok) ok = false
      if (result.dirty) dirty = true
    }

    if (!ok) {
      process.exit(1)
    }

    if (dirty) {
      process.exit(2)
    }
  },
})
