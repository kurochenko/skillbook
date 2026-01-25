#!/usr/bin/env bun
import { runTUI } from '@/tui/App'
import { detectProjectContext } from '@/lib/project'

// Check if we're in an interactive terminal
if (!process.stdin.isTTY) {
  console.error('Error: skillbook TUI requires an interactive terminal.')
  console.error('Run this command directly in your terminal, not piped.')
  process.exit(1)
}

const projectPath = detectProjectContext() ?? process.cwd()
const inProject = projectPath !== process.cwd() || detectProjectContext() !== null

runTUI(projectPath, inProject)
