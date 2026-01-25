import { existsSync, lstatSync, readFileSync } from 'fs'
import { KEYS } from '@/tui/constants'

const DOWN_KEY = KEYS.DOWN[0] ?? 'j'
const UP_KEY = KEYS.UP[0] ?? 'k'

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

export const stripAnsi = (str: string): string => {
  return str.replace(/\u001b\[[0-9;]*m/g, '')
}

export const isSymlink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

export const pathExists = (path: string): boolean => {
  return existsSync(path)
}

export const readFile = (path: string): string => {
  return readFileSync(path, 'utf-8')
}

export const navigateToRow = async (
  targetText: string,
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
  maxMoves = 20,
): Promise<boolean> => {
  for (let moves = 0; moves < maxMoves; moves++) {
    const frame = stripAnsi(lastFrame() ?? '')
    const lines = frame.split('\n')

    const cursorLineIndex = lines.findIndex(
      (line) => / > /.test(line) || line.trimStart().startsWith('> '),
    )
    if (cursorLineIndex === -1) continue

    const cursorLine = lines[cursorLineIndex] ?? ''
    if (cursorLine.includes(targetText)) return true

    const targetLineIndex = lines.findIndex((line) => line.includes(targetText))
    if (targetLineIndex === -1) return false

    if (targetLineIndex > cursorLineIndex) {
      stdin.write(DOWN_KEY)
    } else {
      stdin.write(UP_KEY)
    }

    await new Promise((r) => setTimeout(r, 50))
  }

  return false
}
