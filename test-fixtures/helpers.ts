/**
 * Shared test helpers for integration tests
 */

import { existsSync, lstatSync, readFileSync } from 'fs'

/**
 * Helper to wait for a condition with timeout
 */
export const waitFor = async (
  condition: () => boolean,
  timeout = 2000,
  interval = 50,
): Promise<void> => {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition')
    }
    await new Promise((r) => setTimeout(r, interval))
  }
}

/**
 * Helper to strip ANSI escape codes from terminal output
 */
export const stripAnsi = (str: string): string => {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, '')
}

/**
 * Helper to check if a path is a symlink
 */
export const isSymlink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Helper to check if path exists
 */
export const pathExists = (path: string): boolean => {
  return existsSync(path)
}

/**
 * Helper to read file content
 */
export const readFile = (path: string): string => {
  return readFileSync(path, 'utf-8')
}

/**
 * Helper to navigate to a row containing the target text.
 * Scans the frame for the target and moves cursor until it's on that row.
 * Returns true if navigation succeeded, false if target not found.
 */
export const navigateToRow = async (
  targetText: string,
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
  maxMoves = 20,
): Promise<boolean> => {
  for (let moves = 0; moves < maxMoves; moves++) {
    const frame = stripAnsi(lastFrame() ?? '')
    const lines = frame.split('\n')

    // Find the cursor line - cursor is "> " somewhere in the line (inside box)
    // Look for "│ > " or just "> " pattern
    const cursorLineIndex = lines.findIndex(
      (line) => / > /.test(line) || line.trimStart().startsWith('> '),
    )
    if (cursorLineIndex === -1) continue

    const cursorLine = lines[cursorLineIndex] ?? ''

    // Check if cursor is on target
    if (cursorLine.includes(targetText)) {
      return true
    }

    // Find target line
    const targetLineIndex = lines.findIndex((line) => line.includes(targetText))
    if (targetLineIndex === -1) {
      return false // Target not found in frame
    }

    // Move toward target
    if (targetLineIndex > cursorLineIndex) {
      stdin.write('j')
    } else {
      stdin.write('k')
    }

    // Wait for UI to update
    await new Promise((r) => setTimeout(r, 50))
  }

  return false
}
