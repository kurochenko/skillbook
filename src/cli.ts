#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'

// Check if we should launch TUI (no subcommand provided)
const args = process.argv.slice(2)
const hasSubcommand = args.length > 0 && !args[0]?.startsWith('-')
const isHelpOrVersion = args.includes('--help') || args.includes('-h') || args.includes('--version')

if (!hasSubcommand && !isHelpOrVersion) {
  // Launch TUI directly
  const { runTUI } = await import('./tui/App.js')
  const { detectProjectContext } = await import('./lib/project.js')

  if (!process.stdin.isTTY) {
    console.error('Error: skillbook TUI requires an interactive terminal.')
    console.error('Run a subcommand instead: skillbook --help')
    process.exit(1)
  }

  const projectPath = detectProjectContext() ?? process.cwd()
  const inProject = detectProjectContext() !== null

  runTUI(projectPath, inProject)
} else {
  // Run citty CLI
  const main = defineCommand({
    meta: {
      name: 'skillbook',
      version: '0.1.0',
      description: 'Manage AI coding assistant skills across projects',
    },
    subCommands: {
      add: () => import('./commands/add.ts').then((m) => m.default),
      list: () => import('./commands/list.ts').then((m) => m.default),
      scan: () => import('./commands/scan.ts').then((m) => m.default),
    },
  })

  runMain(main)
}
