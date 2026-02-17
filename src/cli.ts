#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'
import pc from 'picocolors'
import { SUPPORTED_TOOLS, TOOLS } from '@/constants'
import { VERSION, checkForUpdate } from '@/lib/version'
import { initLogger, logWarn } from '@/lib/logger'

const SUBCOMMANDS = [
  'add',
  'diff',
  'doctor',
  'harness',
  'init',
  'install',
  'list',
  'migrate',
  'pull',
  'push',
  'resolve',
  'scan',
  'show',
  'status',
  'uninstall',
  'upgrade',
]

const out = (s: string) => process.stdout.write(`${s}\n`)
const err = (s: string) => process.stderr.write(`${s}\n`)

const parseLogFlags = (args: string[]) => {
  let logToFile = false
  let logToStderr = false
  const filteredArgs: string[] = []

  for (const arg of args) {
    if (arg === '--log') {
      logToFile = true
      continue
    }

    if (arg === '--log-stderr') {
      logToStderr = true
      continue
    }

    filteredArgs.push(arg)
  }

  return { logToFile, logToStderr, filteredArgs }
}

const showUpdateBanner = async () => {
  try {
    const { updateAvailable, latestVersion } = await checkForUpdate()
    if (updateAvailable && latestVersion) {
      out('')
      out(pc.cyan(`  Update available: ${pc.yellow(VERSION)} -> ${pc.green(latestVersion)}`))
      out(pc.dim(`  Run 'skillbook upgrade' to update`))
      out('')
    }
  } catch (error) {
    logWarn('Failed to check for updates', error)
  }
}

const helpText = () => `
${pc.bold(pc.cyan('skillbook'))}${pc.dim(` v${VERSION}`)}

Manage AI coding assistant skills in one place.
Create skills once, reuse them across all your projects.

${pc.bold('LOCK-BASED WORKFLOW (IMPLEMENTED)')}

${pc.cyan('  skillbook init --library')}${pc.dim('                 Init library at ~/.skillbook (or SKILLBOOK_LOCK_LIBRARY)')}
${pc.cyan('  skillbook init --project --path <path>')}${pc.dim('        Init project .skillbook folder')}
${pc.cyan('  skillbook status [--project <path>]')}${pc.dim('        Show lock-based status for project skills')}
${pc.cyan('  skillbook status [--project <path>] --json')}${pc.dim('  JSON output for automation')}
${pc.cyan('  skillbook list --project <path> --json')}${pc.dim('        List project skills')}
${pc.cyan('  skillbook show <id> --project <path> --json')}${pc.dim('   Show project skill details')}
${pc.cyan('  skillbook diff <id> --project <path> --json')}${pc.dim('   Diff project vs library')}
${pc.cyan('  skillbook install <id> [--skills id1,id2,...] [--project <path>]')}${pc.dim(' Copy library skill into project')}
${pc.cyan('  skillbook pull <id> [--skills id1,id2,...] [--project <path>]')}${pc.dim('    Pull library changes into project')}
${pc.cyan('  skillbook push <id> [--skills id1,id2,...] [--project <path>]')}${pc.dim('    Push project changes into library')}
${pc.cyan('  skillbook resolve <id> --project <path> --strategy <library|project>')}${pc.dim(' Resolve diverged skill')}
${pc.cyan('  skillbook uninstall <id> [--skills id1,id2,...] [--project <path>]')}${pc.dim(' Remove skill from project')}
${pc.cyan('  skillbook doctor --library')}${pc.dim('                 Validate library lock setup')}
${pc.cyan('  skillbook doctor --project <path>')}${pc.dim('          Validate project lock setup')}
${pc.cyan('  skillbook migrate --project <path>')}${pc.dim('             Write lockfile for project .skillbook')}
${pc.cyan('  skillbook migrate --library')}${pc.dim('                    Write lockfile for ~/.skillbook')}
${pc.cyan('  skillbook harness list')}${pc.dim('                                List available harness ids')}
${pc.cyan('  skillbook harness sync [--project <path>] --id <harness>')}${pc.dim('    Link project skills to harness')}
${pc.cyan('  skillbook harness import [--project <path>] --id <harness>')}${pc.dim('  Import harness skills into project')}
${pc.cyan('  skillbook harness enable [--project <path>] --id <harness>')}${pc.dim(' Enable harness in project lock file')}
${pc.cyan('  skillbook harness disable [--project <path>] --id <harness>')}${pc.dim(' Disable harness in project lock file')}

${pc.bold('LIBRARY CONTENT (CURRENT)')}

${pc.cyan('  skillbook scan [path]')}${pc.dim('              Scan and import skills to library')}
${pc.cyan('  skillbook list')}${pc.dim('                     List skills in your library')}
${pc.cyan('  skillbook add <source>')}${pc.dim('             Add skill from URL or path')}

${pc.bold('PLANNED (NOT IMPLEMENTED YET)')}

${pc.dim('  merge strategy for resolve')}

${pc.bold('OPTIONS')}

${pc.cyan('  --log')}${pc.dim('             Write logs to ~/.skillbook/logs/skillbook.log')}
${pc.cyan('  --log-stderr')}${pc.dim('      Write logs to stderr')}

${pc.bold('ENV')}

${pc.cyan('  SKILLBOOK_LOCK_LIBRARY')}${pc.dim('   Override lock-based library path (default: ~/.skillbook)')}
${pc.cyan('  SKILLBOOK_LIBRARY')}${pc.dim('        Override library path (default: ~/.skillbook)')}

${pc.dim('Project-scoped commands default to the current directory when --project is omitted.')}

${pc.bold('HARNESS IDS')}

${SUPPORTED_TOOLS.map((id) => `  ${pc.cyan(id)}${pc.dim(` (${TOOLS[id].name})`)}`).join('\n')}

${pc.dim("Tip: alias sb='skillbook' for quick access")}
`

const showHelp = () => out(helpText())

const runSubcommand = () => {
  const main = defineCommand({
    meta: {
      name: 'skillbook',
      version: VERSION,
      description: 'Manage AI coding assistant skills across projects',
    },
    subCommands: {
      add: () => import('@/commands/add').then((m) => m.default),
      diff: () => import('@/commands/diff').then((m) => m.default),
      doctor: () => import('@/commands/doctor').then((m) => m.default),
      harness: () => import('@/commands/harness').then((m) => m.default),
      init: () => import('@/commands/init').then((m) => m.default),
      install: () => import('@/commands/install').then((m) => m.default),
      list: () => import('@/commands/list').then((m) => m.default),
      migrate: () => import('@/commands/migrate').then((m) => m.default),
      pull: () => import('@/commands/pull').then((m) => m.default),
      push: () => import('@/commands/push').then((m) => m.default),
      resolve: () => import('@/commands/resolve').then((m) => m.default),
      scan: () => import('@/commands/scan').then((m) => m.default),
      show: () => import('@/commands/show').then((m) => m.default),
      status: () => import('@/commands/status').then((m) => m.default),
      uninstall: () => import('@/commands/uninstall').then((m) => m.default),
      upgrade: () => import('@/commands/upgrade').then((m) => m.default),
    },
  })
  runMain(main)
}

const main = () => {
  const parsed = parseLogFlags(process.argv.slice(2))
  initLogger({ logToFile: parsed.logToFile, logToStderr: parsed.logToStderr })

  const args = parsed.filteredArgs
  process.argv = [process.argv[0], process.argv[1], ...args]
  const firstArg = args[0]

  if (args.includes('--version') || args.includes('-v')) {
    out(VERSION)
    return
  }

  const isHelp = args.includes('--help') || args.includes('-h')
  const isSubcommand = firstArg && SUBCOMMANDS.includes(firstArg)

  if (isHelp && !isSubcommand) {
    showHelp()
  } else if (isSubcommand) {
    runSubcommand()
  } else {
    if (firstArg) {
      err(pc.red(`Unknown command: ${firstArg}`))
      showHelp()
      process.exit(1)
    }
    showHelp()
  }
}

main()
