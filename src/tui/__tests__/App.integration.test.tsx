/**
 * Integration tests for the main TUI (App.tsx)
 *
 * These tests use a pre-built fixture structure and verify
 * end-to-end behavior including file system changes.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { render } from 'ink-testing-library'
import { lstatSync, readFileSync } from 'fs'
import { join } from 'path'
import App from '../App'
import {
  setupFixtures,
  cleanupFixtures,
  LIBRARY_PATH,
  PROJECT_PATH,
} from '../../../test-fixtures/setup'

// Store original env
let originalLibraryEnv: string | undefined

beforeAll(() => {
  // Override library path for all tests
  originalLibraryEnv = process.env.SKILLBOOK_LIBRARY
  process.env.SKILLBOOK_LIBRARY = LIBRARY_PATH
})

beforeEach(() => {
  // Reset fixtures before each test (tests modify state)
  setupFixtures()
})

afterAll(() => {
  // Cleanup
  cleanupFixtures()

  // Restore env
  if (originalLibraryEnv !== undefined) {
    process.env.SKILLBOOK_LIBRARY = originalLibraryEnv
  } else {
    delete process.env.SKILLBOOK_LIBRARY
  }
})

/**
 * Helper to wait for a condition with timeout
 */
const waitFor = async (
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
const stripAnsi = (str: string): string => {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, '')
}

/**
 * Helper to check if a path is a symlink
 */
const isSymlink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Helper to read file content
 */
const readFile = (path: string): string => {
  return readFileSync(path, 'utf-8')
}

/**
 * Helper to check if path exists
 */
const pathExists = (path: string): boolean => {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * Helper to navigate to a row containing the target text.
 * Scans the frame for the target and moves cursor until it's on that row.
 * Returns true if navigation succeeded, false if target not found.
 */
const navigateToRow = async (
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
    const cursorLineIndex = lines.findIndex(line => / > /.test(line) || line.trimStart().startsWith('> '))
    if (cursorLineIndex === -1) continue
    
    const cursorLine = lines[cursorLineIndex] ?? ''
    
    // Check if cursor is on target
    if (cursorLine.includes(targetText)) {
      return true
    }
    
    // Find target line
    const targetLineIndex = lines.findIndex(line => line.includes(targetText))
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

describe('App TUI Integration', () => {
  test('displays correct initial state with all skill statuses', async () => {
    const { lastFrame, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for initial render
    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    const output = lastFrame() ?? ''

    // Check INSTALLED section exists with skills
    expect(output).toContain('INSTALLED')
    expect(output).toContain('skill-in-lib')

    // skill-in-lib shows as conflict (opencode has different content but isn't in enabled harnesses)
    expect(output).toContain('[conflict')

    // Check skill-detached shows detached status (real file, matches library)
    expect(output).toContain('skill-detached')
    expect(output).toContain('[detached]')

    // Check LOCAL section with skill-local
    expect(output).toContain('LOCAL')
    expect(output).toContain('skill-local')

    // Check AVAILABLE section with skill-available
    expect(output).toContain('AVAILABLE')
    expect(output).toContain('skill-available')

    unmount()
  })

  test('sync detached skill converts real file to symlink', async () => {
    // For directory-based harnesses (Claude Code), the symlink is at the directory level
    // not the file level. So we check .claude/skills/skill-detached/ not SKILL.md
    const skillDirPath = join(
      PROJECT_PATH,
      '.claude/skills/skill-detached',
    )

    // Verify it starts as a real directory (not symlink)
    expect(isSymlink(skillDirPath)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for render
    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    // skill-detached is already selected (first row in INSTALLED)
    // Just verify it's selected (strip ANSI codes for reliable matching)
    const frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toContain('> [detached] skill-detached')

    // Press 's' to sync
    stdin.write('s')

    // Wait for sync to complete (status should change from [detached] to [✓])
    // AND verify the symlink was created (filesystem check)
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('[✓] skill-detached') && isSymlink(skillDirPath)
    }, 5000)

    // Verify directory became a symlink
    expect(isSymlink(skillDirPath)).toBe(true)

    unmount()
  })

  test('push local skill adds it to library', async () => {
    const librarySkillPath = join(
      LIBRARY_PATH,
      'skills/skill-local/SKILL.md',
    )

    // Verify skill-local doesn't exist in library yet
    expect(pathExists(librarySkillPath)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for render
    await waitFor(() => (lastFrame() ?? '').includes('LOCAL'))

    // Navigate to skill-local using helper (order-independent)
    const found = await navigateToRow('skill-local', stdin, lastFrame)
    expect(found).toBe(true)

    // Verify we're at skill-local
    expect(stripAnsi(lastFrame() ?? '')).toContain('> skill-local')

    // Press 'p' to push to library
    stdin.write('p')

    // Wait for push to complete
    await waitFor(() => {
      try {
        readFile(librarySkillPath)
        return true
      } catch {
        return false
      }
    }, 3000)

    // Verify skill was added to library
    const libraryContent = readFile(librarySkillPath)
    expect(libraryContent).toContain('Local Skill')

    unmount()
  })

  test('install available skill creates symlinks', async () => {
    // For directory-based harnesses (Claude Code), the symlink is at the directory level
    const skillDirPath = join(
      PROJECT_PATH,
      '.claude/skills/skill-available',
    )

    // Verify skill-available doesn't exist in project yet
    expect(pathExists(skillDirPath)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for render
    await waitFor(() => (lastFrame() ?? '').includes('AVAILABLE'))

    // Navigate to skill-available using helper (order-independent)
    const found = await navigateToRow('skill-available', stdin, lastFrame)
    expect(found).toBe(true)

    // Verify we're at skill-available
    expect(stripAnsi(lastFrame() ?? '')).toContain('> skill-available')

    // Press 'i' to install
    stdin.write('i')

    // Wait for install to complete (check filesystem)
    await waitFor(() => pathExists(skillDirPath), 3000)

    // Verify symlink was created at directory level
    expect(isSymlink(skillDirPath)).toBe(true)

    unmount()
  })

  test('uninstall skill removes it from project', async () => {
    // skill-in-lib has a symlink in .claude (will be removed)
    const skillDirPath = join(
      PROJECT_PATH,
      '.claude/skills/skill-in-lib',
    )

    // Verify it starts as a symlink
    expect(isSymlink(skillDirPath)).toBe(true)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for render
    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    // Navigate to skill-in-lib using helper (order-independent)
    const found = await navigateToRow('skill-in-lib', stdin, lastFrame)
    expect(found).toBe(true)

    // Verify we're at skill-in-lib
    expect(stripAnsi(lastFrame() ?? '')).toContain('> skill-in-lib')

    // Press 'u' to uninstall
    stdin.write('u')

    // Wait for uninstall to complete - skill should move to AVAILABLE
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      // skill-in-lib should no longer be in INSTALLED section
      // It should appear in AVAILABLE section now
      return !frame.includes('[detached] skill-in-lib') && 
             !frame.includes('[conflict] skill-in-lib') &&
             !frame.includes('[✓] skill-in-lib')
    }, 3000)

    // Verify symlink was removed
    expect(isSymlink(skillDirPath)).toBe(false)

    unmount()
  })

  test('sync conflict overwrites local with library version', async () => {
    // skill-unanimous-conflict has conflict status (unanimous) - local differs from library
    const skillPath = join(
      PROJECT_PATH,
      '.claude/skills/skill-unanimous-conflict/SKILL.md',
    )

    // Verify it starts with local content
    expect(readFile(skillPath)).toContain('LOCAL VERSION')

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for render
    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    // Navigate to skill-unanimous-conflict using helper (order-independent)
    const found = await navigateToRow('skill-unanimous-conflict', stdin, lastFrame)
    expect(found).toBe(true)

    // Verify we're at skill-unanimous-conflict with conflict status
    expect(stripAnsi(lastFrame() ?? '')).toContain('> [conflict')
    expect(stripAnsi(lastFrame() ?? '')).toContain('skill-unanimous-conflict')

    // Press 's' to sync - this should show confirmation since it's destructive
    stdin.write('s')

    // Wait for confirmation dialog
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('Sync') && frame.includes('overwrite')
    }, 2000)

    // Confirm with 'y'
    stdin.write('y')

    // Wait for sync to complete (status should change to [✓])
    // AND verify content matches library (filesystem check)
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      const hasNewStatus = frame.includes('[✓] skill-unanimous-conflict')
      const hasLibraryContent = readFile(skillPath).includes('LIBRARY VERSION')
      return hasNewStatus && hasLibraryContent
    }, 5000)

    // Verify content now matches library version
    expect(readFile(skillPath)).toContain('LIBRARY VERSION')

    unmount()
  })

  test('push conflict updates library with local version', async () => {
    // skill-unanimous-conflict has conflict status - we'll push local to library
    const libraryPath = join(
      LIBRARY_PATH,
      'skills/skill-unanimous-conflict/SKILL.md',
    )

    // Verify library starts with library content
    expect(readFile(libraryPath)).toContain('LIBRARY VERSION')

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for render
    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    // Navigate to skill-unanimous-conflict using helper (order-independent)
    const found = await navigateToRow('skill-unanimous-conflict', stdin, lastFrame)
    expect(found).toBe(true)

    // Verify we're at skill-unanimous-conflict
    expect(stripAnsi(lastFrame() ?? '')).toContain('> [conflict')

    // Press 'p' to push local to library
    stdin.write('p')

    // Wait for push to complete - status should change (library now matches local)
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      // After push, skill should show as ok or detached (local matches library now)
      return frame.includes('[✓] skill-unanimous-conflict') || 
             frame.includes('[detached] skill-unanimous-conflict')
    }, 5000)

    // Verify library now has local content
    expect(readFile(libraryPath)).toContain('LOCAL VERSION')

    unmount()
  })
})
