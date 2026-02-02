import { existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { getLockFilePath, getLockLibraryPath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

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

const checkPaths = (label: string, rootPath: string, checkGit: boolean) => {
  const lockFile = getLockFilePath(rootPath)
  const skillsPath = getLockSkillsPath(rootPath)
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
    const gitStatus = checkGitStatus(rootPath)
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
    const checks: { label: string; path: string }[] = []

    if (args.library) {
      checks.push({ label: 'Library', path: getLockLibraryPath() })
    }

    if (args.project) {
      checks.push({ label: 'Project', path: getProjectLockRoot(args.project) })
    }

    if (checks.length === 0) {
      checks.push({ label: 'Library', path: getLockLibraryPath() })
    }

    let ok = true
    let dirty = false
    for (const check of checks) {
      const result = checkPaths(check.label, check.path, check.label === 'Library')
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
