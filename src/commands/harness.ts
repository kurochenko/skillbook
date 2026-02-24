import { existsSync, rmSync } from 'fs'

import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { fail } from '@/commands/utils'
import { SUPPORTED_TOOLS, TOOLS, type ToolId } from '@/constants'
import { getHarnessBaseDir } from '@/lib/harness'
import {
  getHarnessStatus,
  importHarnessSkills,
  removeHarnessSkills,
  syncHarnessSkills,
} from '@/lib/lock-harness'
import { getLockFilePath, getProjectLockRoot } from '@/lib/lock-paths'
import {
  createEmptyLockFile,
  type HarnessMode,
  type LockFile,
  getHarnessMode,
  readLockFile,
  setHarnessMode,
  writeLockFile,
} from '@/lib/lockfile'

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

const parseMode = (value: string | undefined): HarnessMode | undefined => {
  if (!value) return undefined
  if (value === 'symlink' || value === 'copy') return value
  fail(`Unknown harness mode '${value}'. Use symlink or copy.`)
}

const resolveHarnessArg = (args: { id?: string; harness?: string }) =>
  args.id ?? args.harness

const getProjectLock = (projectPath: string): { lockPath: string; lock: LockFile } => {
  const lockPath = getLockFilePath(getProjectLockRoot(projectPath))
  const lock = existsSync(lockPath) ? readLockFile(lockPath) : createEmptyLockFile()
  return { lockPath, lock }
}

const persistLock = (lockPath: string, lock: LockFile): void => {
  writeLockFile(lockPath, lock)
}

const removeHarnessMode = (lock: LockFile, harnessId: ToolId): LockFile => {
  if (!lock.harnessModes?.[harnessId]) return lock

  const { [harnessId]: _removed, ...restModes } = lock.harnessModes
  return {
    ...lock,
    harnessModes: restModes,
  }
}

const updateLockHarnesses = (
  projectPath: string,
  harnessId: ToolId,
  enabled: boolean,
  mode?: HarnessMode,
): { lockPath: string; lock: LockFile; nextHarnesses: string[] } => {
  const { lockPath, lock } = getProjectLock(projectPath)
  const harnesses = new Set(lock.harnesses ?? [])

  let nextLock = lock
  if (enabled) {
    harnesses.add(harnessId)
    if (mode) {
      nextLock = setHarnessMode(nextLock, harnessId, mode)
    }
  } else {
    harnesses.delete(harnessId)
    nextLock = removeHarnessMode(nextLock, harnessId)
  }

  const nextHarnesses = [...harnesses].sort()
  nextLock = {
    ...nextLock,
    harnesses: nextHarnesses,
  }

  persistLock(lockPath, nextLock)
  return { lockPath, lock: nextLock, nextHarnesses }
}

const ensureHarnessModeAfterSync = (
  lockPath: string,
  lock: LockFile,
  harnessId: ToolId,
  mode: HarnessMode,
): LockFile => {
  const nextLock = setHarnessMode(lock, harnessId, mode)
  persistLock(lockPath, nextLock)
  return nextLock
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
    status: () =>
      defineCommand({
        meta: {
          name: 'status',
          description: 'Show harness sync/drift state against project skills',
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
          json: {
            type: 'boolean',
            description: 'Output machine-readable JSON',
            default: false,
          },
        },
        run: ({ args }) => {
          const projectPath = args.project ?? process.cwd()
          const harnessId = parseHarness(resolveHarnessArg(args))[0]
          const { lock } = getProjectLock(projectPath)
          const mode = getHarnessMode(lock, harnessId)
          const result = getHarnessStatus(projectPath, harnessId, mode)

          if (args.json) {
            process.stdout.write(JSON.stringify(result))
            return
          }

          p.log.info(`${pc.bold(harnessId)} ${pc.dim(`(mode: ${mode})`)}`)
          p.log.info(
            pc.dim(
              `skills ${result.total}, synced ${result.synced}, drifted ${result.drifted}, missing ${result.missing}, conflicts ${result.conflicts}`,
            ),
          )

          if (result.total === 0) {
            p.log.info(pc.dim('No project skills found'))
            return
          }

          for (const row of result.skills) {
            const label = row.status === 'harness-synced'
              ? pc.green('[harness-synced]')
              : row.status === 'harness-drifted'
                ? pc.yellow('[harness-drifted]')
                : row.status === 'conflict'
                  ? pc.red('[conflict]')
                  : pc.dim('[missing]')

            console.log(`${row.id} ${label}`)
          }
        },
      }),
    sync: () =>
      defineCommand({
        meta: {
          name: 'sync',
          description: 'Sync project .skillbook skills into a harness folder',
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
          mode: {
            type: 'string',
            description: 'Harness sync mode override (symlink|copy)',
          },
          force: {
            type: 'boolean',
            description: 'Overwrite drifted/conflicting copied harness files',
            default: false,
          },
          json: {
            type: 'boolean',
            description: 'Output machine-readable JSON',
            default: false,
          },
        },
        run: ({ args }) => {
          const projectPath = args.project ?? process.cwd()
          const harnesses = parseHarness(resolveHarnessArg(args), true)
          const modeOverride = parseMode(args.mode)

          for (const harnessId of harnesses) {
            const { lockPath, lock } = getProjectLock(projectPath)
            const configuredMode = getHarnessMode(lock, harnessId)
            const mode = modeOverride ?? configuredMode

            const result = syncHarnessSkills(projectPath, harnessId, {
              mode,
              force: args.force,
              allowModeFallback: true,
            })

            let nextLock = lock
            if (result.mode !== configuredMode) {
              nextLock = ensureHarnessModeAfterSync(lockPath, nextLock, harnessId, result.mode)
            }

            if (args.json) {
              process.stdout.write(JSON.stringify({ harnessId, ...result }))
              continue
            }

            if (result.total === 0) {
              p.log.info(pc.dim(`No project skills to sync for ${harnessId}`))
              continue
            }

            p.log.success(`Synced ${result.synced} skill${result.synced === 1 ? '' : 's'} to ${harnessId} (${result.mode})`)

            if (result.fallbackToCopy) {
              p.log.warn(pc.yellow(`Symlinks are not supported for ${harnessId}; switched to copy mode.`))
            }

            if (result.drifted > 0) {
              p.log.warn(
                pc.yellow(
                  `${result.drifted} drifted skill${result.drifted === 1 ? '' : 's'} skipped. Use --force to overwrite with project canonical copies.`,
                ),
              )
            }

            if (result.conflicts > 0) {
              p.log.warn(
                pc.yellow(
                  `${result.conflicts} conflicting path${result.conflicts === 1 ? '' : 's'} skipped.`,
                ),
              )
            }

            if (!nextLock.harnesses?.includes(harnessId)) {
              p.log.info(pc.dim(`Hint: run 'skillbook harness enable --id ${harnessId} --mode ${result.mode}' to persist this mode`))
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
          mode: {
            type: 'string',
            description: 'Harness mode override (symlink|copy)',
          },
        },
        run: ({ args }) => {
          const projectPath = args.project ?? process.cwd()
          const harnesses = parseHarness(resolveHarnessArg(args), true)
          const modeOverride = parseMode(args.mode)

          for (const harnessId of harnesses) {
            const { lockPath, lock } = getProjectLock(projectPath)
            const configuredMode = getHarnessMode(lock, harnessId)
            const mode = modeOverride ?? configuredMode
            const result = importHarnessSkills(projectPath, harnessId, {
              mode,
              allowModeFallback: true,
            })

            if (result.mode !== configuredMode) {
              ensureHarnessModeAfterSync(lockPath, lock, harnessId, result.mode)
            }

            if (result.total === 0) {
              p.log.info(pc.dim(`No harness skills found for ${harnessId}`))
              continue
            }

            p.log.success(`Imported ${result.imported} skill${result.imported === 1 ? '' : 's'} from ${harnessId}`)
            p.log.info(pc.dim(`Synced ${result.synced} skill${result.synced === 1 ? '' : 's'} to ${harnessId} (${result.mode})`))

            if (result.fallbackToCopy) {
              p.log.warn(pc.yellow(`Symlinks are not supported for ${harnessId}; switched to copy mode.`))
            }

            if (result.drifted > 0) {
              p.log.warn(pc.yellow(`${result.drifted} drifted skill${result.drifted === 1 ? '' : 's'} could not be synced.`))
            }

            if (result.conflicts > 0) {
              p.log.warn(pc.yellow(`${result.conflicts} conflicting path${result.conflicts === 1 ? '' : 's'} could not be synced.`))
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
          mode: {
            type: 'string',
            description: 'Harness mode (symlink|copy)',
            default: 'symlink',
          },
          force: {
            type: 'boolean',
            description: 'Overwrite drifted/conflicting copied harness files',
            default: false,
          },
        },
        run: ({ args }) => {
          const projectPath = args.project ?? process.cwd()
          const harnessId = parseHarness(resolveHarnessArg(args))[0]
          const requestedMode = parseMode(args.mode) ?? 'symlink'

          const { lockPath, lock, nextHarnesses } = updateLockHarnesses(
            projectPath,
            harnessId,
            true,
            requestedMode,
          )

          const result = syncHarnessSkills(projectPath, harnessId, {
            mode: requestedMode,
            force: args.force,
            allowModeFallback: true,
          })

          let nextLock = lock
          if (result.mode !== requestedMode) {
            nextLock = ensureHarnessModeAfterSync(lockPath, nextLock, harnessId, result.mode)
          }

          p.log.success(`Enabled harness '${harnessId}' ${pc.dim(`(${result.mode})`)}`)

          if (result.total > 0) {
            p.log.info(pc.dim(`Synced ${result.synced} skill${result.synced === 1 ? '' : 's'}`))

            if (result.fallbackToCopy) {
              p.log.warn(pc.yellow('Symlink mode is unsupported in this environment. Switched to copy mode.'))
            }

            if (result.drifted > 0) {
              p.log.warn(
                pc.yellow(
                  `${result.drifted} drifted skill${result.drifted === 1 ? '' : 's'} skipped. Re-run with --force to overwrite.`,
                ),
              )
            }

            if (result.conflicts > 0) {
              p.log.warn(
                pc.yellow(`${result.conflicts} conflicting path${result.conflicts === 1 ? '' : 's'} skipped.`),
              )
            }
          }

          p.log.info(pc.dim(`Enabled: ${nextHarnesses.join(', ') || 'none'}`))
          p.log.info(pc.dim(`Mode: ${getHarnessMode(nextLock, harnessId)}`))
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

          const { lock } = getProjectLock(projectPath)
          const currentMode = getHarnessMode(lock, harnessId)
          const { nextHarnesses } = updateLockHarnesses(projectPath, harnessId, false)
          const removed = removeHarnessSkills(projectPath, harnessId, currentMode)

          if (args.remove) {
            const baseDir = getHarnessBaseDir(projectPath, harnessId)
            if (existsSync(baseDir)) {
              rmSync(baseDir, { recursive: true, force: true })
            }
          }

          p.log.success(`Disabled harness '${harnessId}'`)
          if (removed > 0) {
            p.log.info(pc.dim(`Removed ${removed} harness entr${removed === 1 ? 'y' : 'ies'}`))
          }
          p.log.info(pc.dim(`Enabled: ${nextHarnesses.join(', ') || 'none'}`))
        },
      }),
  },
})
