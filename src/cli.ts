#!/usr/bin/env bun
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineCommand, runMain } from 'citty'
import pc from 'picocolors'
import { VERSION, checkForUpdate } from '@/lib/version'
import { initLogger, logWarn } from '@/lib/logger'

const SUBCOMMANDS = ['add', 'init', 'install', 'list', 'pull', 'push', 'scan', 'status', 'upgrade']

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

${pc.cyan('  skillbook init --library')}${pc.dim('                 Init library at ~/.SB (or SKILLBOOK_LOCK_LIBRARY)')}
${pc.cyan('  skillbook init --project --path <path>')}${pc.dim('        Init project .SB folder')}
${pc.cyan('  skillbook status --project <path>')}${pc.dim('              Show lock-based status for project skills')}
${pc.cyan('  skillbook status --project <path> --json')}${pc.dim('        JSON output for automation')}
${pc.cyan('  skillbook install <id> --project <path>')}${pc.dim('      Copy library skill into project')}
${pc.cyan('  skillbook pull <id> --project <path>')}${pc.dim('         Pull library changes into project')}
${pc.cyan('  skillbook push <id> --project <path>')}${pc.dim('         Push project changes into library')}

${pc.bold('LIBRARY CONTENT (CURRENT)')}

${pc.cyan('  skillbook scan [path]')}${pc.dim('              Scan and import skills to library')}
${pc.cyan('  skillbook list')}${pc.dim('                     List skills in your library')}
${pc.cyan('  skillbook add <source>')}${pc.dim('             Add skill from URL or path')}

${pc.bold('LEGACY TUI (SPARSE CHECKOUT + SYMLINKS)')}

${pc.cyan('  skillbook')}${pc.dim('                          Open TUI (legacy)')}
${pc.cyan('  skillbook <path>')}${pc.dim('                   Open TUI for specific path (legacy)')}

${pc.bold('PLANNED (NOT IMPLEMENTED YET)')}

${pc.dim('  resolve, harness sync')}

${pc.bold('OPTIONS')}

${pc.cyan('  --log')}${pc.dim('             Write logs to ~/.SB/logs/skillbook.log')}
${pc.cyan('  --log-stderr')}${pc.dim('      Write logs to stderr')}

${pc.bold('ENV')}

${pc.cyan('  SKILLBOOK_LOCK_LIBRARY')}${pc.dim('   Override lock-based library path (default: ~/.SB)')}
${pc.cyan('  SKILLBOOK_LIBRARY')}${pc.dim('        Override legacy library path (default: ~/.SB)')}

${pc.dim("Tip: alias sb='skillbook' for quick access")}
`

const showHelp = () => out(helpText())

const validatePath = (pathArg: string): string => {
  const resolved = resolve(pathArg)
  if (!existsSync(resolved)) {
    err(pc.red(`Error: Path does not exist: ${resolved}`))
    process.exit(1)
  }
  if (!statSync(resolved).isDirectory()) {
    err(pc.red(`Error: Path is not a directory: ${resolved}`))
    process.exit(1)
  }
  return resolved
}

const openTUI = async (pathArg?: string) => {
  const { runTUI } = await import('@/tui/App')
  const { detectProjectContext } = await import('@/lib/project-scan')

  if (!process.stdin.isTTY) {
    err('Error: skillbook TUI requires an interactive terminal.')
    err('Run a subcommand instead: skillbook --help')
    process.exit(1)
  }

  if (pathArg) {
    void showUpdateBanner()
    runTUI(validatePath(pathArg), true)
    return
  }

  const detected = detectProjectContext()
  if (detected) {
    void showUpdateBanner()
    runTUI(detected, true)
  } else {
    showHelp()
  }
}

const runSubcommand = () => {
  const main = defineCommand({
    meta: {
      name: 'skillbook',
      version: VERSION,
      description: 'Manage AI coding assistant skills across projects',
    },
    subCommands: {
      add: () => import('@/commands/add').then((m) => m.default),
      init: () => import('@/commands/init').then((m) => m.default),
      install: () => import('@/commands/install').then((m) => m.default),
      list: () => import('@/commands/list').then((m) => m.default),
      pull: () => import('@/commands/pull').then((m) => m.default),
      push: () => import('@/commands/push').then((m) => m.default),
      scan: () => import('@/commands/scan').then((m) => m.default),
      status: () => import('@/commands/status').then((m) => m.default),
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
  const isPath = firstArg && !firstArg.startsWith('-') && !isSubcommand

  if (isHelp && !isSubcommand) {
    showHelp()
  } else if (isSubcommand) {
    runSubcommand()
  } else if (isPath) {
    void openTUI(firstArg)
  } else {
    void openTUI()
  }
}

main()
