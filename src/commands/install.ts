import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { SUPPORTED_TOOLS, type ToolId } from '@/constants'
import { linkSkillToHarness } from '@/lib/lock-harness'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { getAllSkillArgs } from '@/commands/utils'

const installSkill = (
  skill: string,
  projectPath: string,
): { success: boolean; error?: string; conflicts?: number } => {
  const projectContext = getProjectLockContext(projectPath)
  const libraryContext = getLibraryLockContext()
  const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
  const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

  if (!existsSync(librarySkillDir)) {
    return { success: false, error: `Skill not found in library: ${skill}` }
  }

  if (existsSync(projectSkillDir)) {
    return { success: false, error: `Skill already exists in project: ${skill}` }
  }

  const libraryLock = readLockFile(libraryContext.lockFilePath)
  const entry = libraryLock.skills[skill]

  if (!entry) {
    return { success: false, error: `No lock entry found for skill in library: ${skill}` }
  }

  copySkillDir(librarySkillDir, projectSkillDir)

  const projectLock = readLockFile(projectContext.lockFilePath)
  const updated = setLockEntry(projectLock, skill, {
    version: entry.version,
    hash: entry.hash,
    updatedAt: entry.updatedAt,
  })
  writeLockFile(projectContext.lockFilePath, updated)

  const harnesses = (updated.harnesses ?? [])
    .filter((h): h is ToolId => SUPPORTED_TOOLS.includes(h as ToolId))

  let conflicts = 0
  for (const harnessId of harnesses) {
    const result = linkSkillToHarness(projectPath, harnessId, skill)
    if (result.conflict) conflicts += 1
  }

  return { success: true, conflicts }
}

export default defineCommand({
  meta: {
    name: 'install',
    description: 'Install a skill from the lock-based library into a project',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id to install',
      required: true,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
  },
  run: async ({ args }) => {
    const { skill: firstSkill, project } = args
    const projectPath = project ?? process.cwd()

    const skills = getAllSkillArgs('install', firstSkill)
    const results: Array<{ skill: string; success: boolean; error?: string; conflicts?: number }> =
      []

    for (const skill of skills) {
      const result = installSkill(skill, projectPath)
      results.push({ skill, ...result })

      if (result.success) {
        process.stdout.write(pc.green('✔ ') + `Installed skill '${pc.bold(skill)}'\n`)
        if (result.conflicts && result.conflicts > 0) {
          process.stdout.write(
            pc.yellow(
              `  ${result.conflicts} harness link${result.conflicts === 1 ? '' : 's'} skipped (existing non-symlink).\n`,
            ),
          )
        }
      } else {
        process.stdout.write(pc.red('✗ ') + `${result.error}\n`)
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    process.stdout.write(
      pc.dim(
        `${successCount} installed${failCount > 0 ? `, ${failCount} failed` : ''}`,
      ) + '\n',
    )

    if (failCount > 0) {
      process.exit(1)
    }
  },
})
