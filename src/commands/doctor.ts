import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { getLockFilePath, getLockLibraryPath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

const checkPaths = (label: string, rootPath: string) => {
  const lockFile = getLockFilePath(rootPath)
  const skillsPath = getLockSkillsPath(rootPath)
  const errors: string[] = []

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
    return { ok: false }
  }

  p.log.success(`${label} OK`)
  return { ok: true }
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
    for (const check of checks) {
      const result = checkPaths(check.label, check.path)
      if (!result.ok) ok = false
    }

    if (!ok) {
      process.exit(1)
    }
  },
})
