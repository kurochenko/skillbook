#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'
import pc from 'picocolors'
import { VERSION, checkForUpdate } from '@/lib/version'

const args = process.argv.slice(2)
const hasSubcommand = args.length > 0 && !args[0]?.startsWith('-')
const isHelpOrVersion = args.includes('--help') || args.includes('-h') || args.includes('--version')

async function showUpdateBannerIfNeeded(): Promise<void> {
  try {
    const { updateAvailable, latestVersion } = await checkForUpdate()
    if (updateAvailable && latestVersion) {
      console.log()
      console.log(pc.cyan(`  Update available: ${pc.yellow(VERSION)} -> ${pc.green(latestVersion)}`))
      console.log(pc.dim(`  Run 'skillbook upgrade' to update`))
      console.log()
    }
  } catch {
    return
  }
}

if (!hasSubcommand && !isHelpOrVersion) {
  const { runTUI } = await import('@/tui/App')
  const { detectProjectContext } = await import('@/lib/project-scan')

  if (!process.stdin.isTTY) {
    console.error('Error: skillbook TUI requires an interactive terminal.')
    console.error('Run a subcommand instead: skillbook --help')
    process.exit(1)
  }

  showUpdateBannerIfNeeded()

  const detectedPath = detectProjectContext()
  const projectPath = detectedPath ?? process.cwd()
  const inProject = detectedPath !== null

  runTUI(projectPath, inProject)
} else {
  const main = defineCommand({
    meta: {
      name: 'skillbook',
      version: VERSION,
      description: 'Manage AI coding assistant skills across projects',
    },
    subCommands: {
      add: () => import('@/commands/add').then((m) => m.default),
      list: () => import('@/commands/list').then((m) => m.default),
      scan: () => import('@/commands/scan').then((m) => m.default),
      upgrade: () => import('@/commands/upgrade').then((m) => m.default),
    },
  })

  runMain(main)
}
