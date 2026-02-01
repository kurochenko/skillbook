import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { SUPPORTED_TOOLS, TOOLS, type ToolId } from '@/constants'
import { importHarnessSkills, syncHarnessSkills } from '@/lib/lock-harness'

const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

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
          description: 'Copy project .SB skills into a harness folder',
        },
        args: {
          project: {
            type: 'string',
            description: 'Project path (defaults to current directory)',
          },
          id: {
            type: 'string',
            description: 'Harness id (claude-code, cursor, opencode)',
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
            const count = syncHarnessSkills(projectPath, harnessId)
            if (count === 0) {
              p.log.info(pc.dim(`No project skills to sync for ${harnessId}`))
            } else {
              p.log.success(`Synced ${count} skill${count === 1 ? '' : 's'} to ${harnessId}`)
            }
          }
        },
      }),
    import: () =>
      defineCommand({
        meta: {
          name: 'import',
          description: 'Copy harness skills into project .SB skills',
        },
        args: {
          project: {
            type: 'string',
            description: 'Project path (defaults to current directory)',
          },
          id: {
            type: 'string',
            description: 'Harness id (claude-code, cursor, opencode)',
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
            const count = importHarnessSkills(projectPath, harnessId)
            if (count === 0) {
              p.log.info(pc.dim(`No harness skills found for ${harnessId}`))
            } else {
              p.log.success(`Imported ${count} skill${count === 1 ? '' : 's'} from ${harnessId}`)
            }
          }
        },
      }),
  },
})
