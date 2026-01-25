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
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('[✓] skill-detached')
    }, 5000)

    // Give async operations time to complete
    await new Promise((r) => setTimeout(r, 500))

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
    expect(() => readFile(librarySkillPath)).toThrow()

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for render
    await waitFor(() => (lastFrame() ?? '').includes('LOCAL'))

    // Navigate to LOCAL section and skill-local
    // Structure:
    // INSTALLED: skill-detached (0), skill-in-lib (1)
    // LOCAL: skill-local (2), Claude Code harness (3)
    stdin.write('j') // skill-in-lib (1)
    stdin.write('j') // skill-local (2)

    await new Promise((r) => setTimeout(r, 100))

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
    expect(() => lstatSync(skillDirPath)).toThrow()

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for render
    await waitFor(() => (lastFrame() ?? '').includes('AVAILABLE'))

    // Navigate to AVAILABLE section
    // Structure:
    // INSTALLED: skill-detached (0), skill-in-lib (1)
    // LOCAL: skill-local (2), Claude Code harness (3)
    // AVAILABLE: skill-available (4), skill-conflict (5)
    for (let i = 0; i < 4; i++) {
      stdin.write('j')
      await new Promise((r) => setTimeout(r, 30))
    }

    // Verify we're at skill-available
    await new Promise((r) => setTimeout(r, 100))
    expect(stripAnsi(lastFrame() ?? '')).toContain('> skill-available')

    // Press 'i' to install
    stdin.write('i')

    // Wait for install to complete
    await waitFor(() => {
      try {
        lstatSync(skillDirPath)
        return true
      } catch {
        return false
      }
    }, 3000)

    // Verify symlink was created at directory level
    expect(isSymlink(skillDirPath)).toBe(true)

    unmount()
  })
})
