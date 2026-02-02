import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { SUPPORTED_TOOLS, TOOLS, type ToolId } from '@/constants'
import { existsSync, rmSync } from 'fs'
import { importHarnessSkills, syncHarnessSkills, removeHarnessSymlinks } from '@/lib/lock-harness'
import { getHarnessBaseDir } from '@/lib/harness'
import { getLockFilePath, getProjectLockRoot } from '@/lib/lock-paths'
import { createEmptyLockFile, readLockFile, writeLockFile } from '@/lib/lockfile'
import { fail } from '@/commands/utils'

const parseHarness = (value: string | undefined, allowAll = false): ToolId[] => {
  if (allowAll && value === 'all') return SUPPORTED_TOOLS

  if (!value) {
    fail(`Missing --id. Available harness ids: ${SUPPORTED_TOOLS.join(', ')}`)
  }

  if (!SUPPORTED_TOOLS.includes(value as ToolId)) {
    fail(`Unknown harness '${value}'. Available: ${SUPPORTED_TOOLS.join(', ')}`)
  }

  return [value as ToolId]
}

const resolveHarnessArg = (args: { id?: string; harness?: string }) =>
  args.id ?? args.harness

const updateLockHarnesses = (
  projectPath: string,
  harnessId: ToolId,
  enabled: boolean,
): string[] => {
  const lockPath = getLockFilePath(getProjectLockRoot(projectPath))
  const lock = existsSync(lockPath) ? readLockFile(lockPath) : createEmptyLockFile()
  const harnesses = new Set(lock.harnesses ?? [])

  if (enabled) {
    harnesses.add(harnessId)
  } else {
    harnesses.delete(harnessId)
  }

  const nextHarnesses = [...harnesses].sort()
  writeLockFile(lockPath, { ...lock, harnesses: nextHarnesses })
  return nextHarnesses
}

export default defineCommand({
  meta: {
    name: 'harness',
    description: 'Lock-based harness sync/import commands',
  },
  subCommands: {
    list: () =>
      defineCommand({
        meta: {
          name: 'list',
          description: 'List available harness ids',
        },
        run: () => {
          for (const id of SUPPORTED_TOOLS) {
            console.log(`${id} - ${TOOLS[id].name}`)
          }
        },
      }),
    sync: () =>
      defineCommand({
        meta: {
          name: 'sync',
          description: 'Link project .skillbook skills into a harness folder',
        },
        args: {
          project: {
            type: 'string',
            description: 'Project path (defaults to current directory)',
          },
          id: {
            type: 'string',
            description: 'Harness id (claude-code, codex, cursor, opencode)',
          },
          harness: {
            type: 'string',
            description: 'Alias for --id (deprecated)',
          },
        },
        run: ({ args }) => {
          const projectPath = args.project ?? process.cwd()
          const harnesses = parseHarness(resolveHarnessArg(args))

          for (const harnessId of harnesses) {
            const result = syncHarnessSkills(projectPath, harnessId)
            if (result.total === 0) {
              p.log.info(pc.dim(`No project skills to sync for ${harnessId}`))
            } else {
              p.log.success(`Linked ${result.linked} skill${result.linked === 1 ? '' : 's'} to ${harnessId}`)
              if (result.conflicts > 0) {
                p.log.warn(
                  pc.yellow(
                    `${result.conflicts} skill${result.conflicts === 1 ? '' : 's'} could not be linked (existing non-symlink).`,
                  ),
                )
              }
            }
          }
        },
      }),
    import: () =>
      defineCommand({
        meta: {
          name: 'import',
          description: 'Import harness skills into project .skillbook skills',
        },
        args: {
          project: {
            type: 'string',
            description: 'Project path (defaults to current directory)',
          },
          id: {
            type: 'string',
            description: 'Harness id (claude-code, codex, cursor, opencode)',
          },
          harness: {
            type: 'string',
            description: 'Alias for --id (deprecated)',
          },
        },
        run: ({ args }) => {
          const projectPath = args.project ?? process.cwd()
          const harnesses = parseHarness(resolveHarnessArg(args))

          for (const harnessId of harnesses) {
            const result = importHarnessSkills(projectPath, harnessId)
            if (result.total === 0) {
              p.log.info(pc.dim(`No harness skills found for ${harnessId}`))
            } else {
              p.log.success(`Imported ${result.imported} skill${result.imported === 1 ? '' : 's'} from ${harnessId}`)
              if (result.linked > 0) {
                p.log.info(pc.dim(`Linked ${result.linked} skill${result.linked === 1 ? '' : 's'} to ${harnessId}`))
              }
            }
          }
        },
      }),
    enable: () =>
      defineCommand({
        meta: {
          name: 'enable',
          description: 'Enable a harness (stores in project lock file)',
        },
        args: {
          project: {
            type: 'string',
            description: 'Project path (defaults to current directory)',
          },
          id: {
            type: 'string',
            description: 'Harness id (claude-code, codex, cursor, opencode)',
          },
          harness: {
            type: 'string',
            description: 'Alias for --id (deprecated)',
          },
        },
        run: ({ args }) => {
          const projectPath = args.project ?? process.cwd()
          const harnessId = parseHarness(resolveHarnessArg(args))[0]

          const nextHarnesses = updateLockHarnesses(projectPath, harnessId, true)
          const result = syncHarnessSkills(projectPath, harnessId)

          p.log.success(`Enabled harness '${harnessId}'`)
          if (result.total > 0) {
            p.log.info(pc.dim(`Linked ${result.linked} skill${result.linked === 1 ? '' : 's'}`))
            if (result.conflicts > 0) {
              p.log.warn(
                pc.yellow(
                  `${result.conflicts} skill${result.conflicts === 1 ? '' : 's'} could not be linked (existing non-symlink).`,
                ),
              )
            }
          }
          p.log.info(pc.dim(`Enabled: ${nextHarnesses.join(', ') || 'none'}`))
        },
      }),
    disable: () =>
      defineCommand({
        meta: {
          name: 'disable',
          description: 'Disable a harness (stores in project lock file)',
        },
        args: {
          project: {
            type: 'string',
            description: 'Project path (defaults to current directory)',
          },
          id: {
            type: 'string',
            description: 'Harness id (claude-code, codex, cursor, opencode)',
          },
          harness: {
            type: 'string',
            description: 'Alias for --id (deprecated)',
          },
          remove: {
            type: 'boolean',
            description: 'Remove harness folder from project',
            default: false,
          },
        },
        run: ({ args }) => {
          const projectPath = args.project ?? process.cwd()
          const harnessId = parseHarness(resolveHarnessArg(args))[0]

          const nextHarnesses = updateLockHarnesses(projectPath, harnessId, false)
          const removed = removeHarnessSymlinks(projectPath, harnessId)

          if (args.remove) {
            const baseDir = getHarnessBaseDir(projectPath, harnessId)
            if (existsSync(baseDir)) {
              rmSync(baseDir, { recursive: true, force: true })
            }
          }

          p.log.success(`Disabled harness '${harnessId}'`)
          if (removed > 0) {
            p.log.info(pc.dim(`Removed ${removed} symlink${removed === 1 ? '' : 's'}`))
          }
          p.log.info(pc.dim(`Enabled: ${nextHarnesses.join(', ') || 'none'}`))
        },
      }),
  },
})
