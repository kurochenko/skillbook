/**
 * Integration tests for the main TUI (App.tsx)
 *
 * These tests use a pre-built fixture structure and verify
 * end-to-end behavior including file system changes.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { render } from 'ink-testing-library'
import { lstatSync, readFileSync, rmSync, existsSync } from 'fs'
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

    const output = stripAnsi(lastFrame() ?? '')

    // Check INSTALLED section exists
    expect(output).toContain('INSTALLED')

    // skill-in-lib should show in INSTALLED section
    // It has mixed status (symlink in claude, conflict in opencode) so shows tree view
    expect(output).toContain('skill-in-lib')

    // Check skill-detached shows detached status (real file, matches library)
    // The [detached] badge should appear on the same conceptual row
    expect(output).toContain('[detached] skill-detached')

    // skill-unanimous-conflict should show conflict (unanimous - all harnesses differ)
    expect(output).toContain('[conflict')
    expect(output).toContain('skill-unanimous-conflict')

    // Check LOCAL section with skill-local
    expect(output).toContain('LOCAL')
    const localSection = output.split('LOCAL')[1]?.split('AVAILABLE')[0] ?? ''
    expect(localSection).toContain('skill-local')

    // Check AVAILABLE section with skill-available
    expect(output).toContain('AVAILABLE')
    const availableSection = output.split('AVAILABLE')[1] ?? ''
    expect(availableSection).toContain('skill-available')

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

  test('uninstall skill removes symlink from enabled harness', async () => {
    // skill-in-lib has a symlink in .claude (enabled harness) and real file in .opencode
    // Uninstall removes from all harnesses - symlink is removed, real file removal fails
    // After uninstall, skill still shows because it exists in .opencode
    const claudeSkillPath = join(
      PROJECT_PATH,
      '.claude/skills/skill-in-lib',
    )

    // Verify it starts as a symlink in claude
    expect(isSymlink(claudeSkillPath)).toBe(true)

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

    // Wait for uninstall to complete
    // The symlink in claude should be removed
    // Skill still shows because opencode has a real file (not removed by uninstall)
    await waitFor(() => !isSymlink(claudeSkillPath), 3000)

    // Verify symlink was removed from claude
    expect(isSymlink(claudeSkillPath)).toBe(false)
    expect(pathExists(claudeSkillPath)).toBe(false)

    // Skill still appears in INSTALLED because opencode version exists
    const frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toContain('skill-in-lib')

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

describe('App TUI Harness Tab Integration', () => {
  test('tab key switches to harnesses tab and displays harness states', async () => {
    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for initial render on skills tab
    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    // Verify we're on skills tab
    expect(stripAnsi(lastFrame() ?? '')).toContain('INSTALLED')

    // Press Tab to switch to harnesses tab
    stdin.write('\t')

    // Wait for harnesses tab to render
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('SELECT HARNESSES')
    }, 2000)

    const frame = stripAnsi(lastFrame() ?? '')

    // Verify harnesses tab content
    expect(frame).toContain('SELECT HARNESSES')

    // Claude Code should be enabled (in config)
    expect(frame).toContain('Claude Code')

    // OpenCode should be visible (folder exists)
    expect(frame).toContain('OpenCode')

    // Cursor should be available (no folder)
    expect(frame).toContain('Cursor')

    // Help bar should show harness actions
    expect(frame).toContain('[tab] skills')

    unmount()
  })

  test('enable harness creates folder and symlinks for installed skills', async () => {
    // Cursor harness is available (no .cursor folder exists)
    const cursorDir = join(PROJECT_PATH, '.cursor', 'rules')
    const skillPath = join(cursorDir, 'skill-in-lib.md')

    // Verify cursor folder doesn't exist yet
    expect(pathExists(cursorDir)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for initial render
    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    // Switch to harnesses tab
    stdin.write('\t')

    // Wait for harnesses tab
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('SELECT HARNESSES')
    }, 2000)

    // Navigate to Cursor (it's listed after Claude Code and OpenCode)
    const found = await navigateToRow('Cursor', stdin, lastFrame)
    expect(found).toBe(true)

    // Verify we're at Cursor and it shows as available (space in badge)
    const frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toContain('> [ ] Cursor')

    // Press 'e' to enable
    stdin.write('e')

    // Wait for enable to complete - check for symlink creation
    // Cursor uses flat files so skill-in-lib.md should be created
    await waitFor(() => pathExists(skillPath), 3000)

    // Verify skill file was created (Cursor uses .md files, not directories)
    expect(pathExists(skillPath)).toBe(true)

    // Verify harness state changed to enabled
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('[✓] Cursor')
    }, 2000)

    unmount()
  })

  test('remove harness deletes folder after confirmation', async () => {
    // OpenCode harness exists (folder present with real files, not in config)
    const opencodeDir = join(PROJECT_PATH, '.opencode', 'skill')

    // Verify opencode folder exists
    expect(pathExists(opencodeDir)).toBe(true)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for initial render
    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    // Switch to harnesses tab
    stdin.write('\t')

    // Wait for harnesses tab
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('SELECT HARNESSES')
    }, 2000)

    // Navigate to OpenCode
    const found = await navigateToRow('OpenCode', stdin, lastFrame)
    expect(found).toBe(true)

    // Press 'r' to remove
    stdin.write('r')

    // Wait for confirmation dialog
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('Remove') && frame.includes('[y]es')
    }, 2000)

    // Confirm with 'y'
    stdin.write('y')

    // Wait for removal to complete
    await waitFor(() => !pathExists(opencodeDir), 3000)

    // Verify folder was deleted
    expect(pathExists(opencodeDir)).toBe(false)

    unmount()
  })

  test('detach harness converts symlinks to real files', async () => {
    // Claude Code harness is enabled with symlinks
    const claudeSkillDir = join(PROJECT_PATH, '.claude', 'skills', 'skill-in-lib')
    const claudeSkillFile = join(claudeSkillDir, 'SKILL.md')

    // Verify it starts as a symlink (directory level)
    expect(isSymlink(claudeSkillDir)).toBe(true)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for initial render
    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    // Switch to harnesses tab
    stdin.write('\t')

    // Wait for harnesses tab
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('SELECT HARNESSES')
    }, 2000)

    // Navigate to Claude Code (should be first)
    const found = await navigateToRow('Claude Code', stdin, lastFrame)
    expect(found).toBe(true)

    // Verify it shows as partial [~] (some skills are symlinked, some are real files)
    // This is expected because fixture has skill-in-lib as symlink but skill-detached as real
    expect(stripAnsi(lastFrame() ?? '')).toContain('[~] Claude Code')

    // Press 'd' to detach
    stdin.write('d')

    // Wait for detach to complete - symlink should become real file
    await waitFor(() => {
      return pathExists(claudeSkillFile) && !isSymlink(claudeSkillDir)
    }, 3000)

    // Verify symlink was converted to real file
    expect(isSymlink(claudeSkillDir)).toBe(false)
    expect(pathExists(claudeSkillFile)).toBe(true)

    // Verify content is preserved
    const content = readFile(claudeSkillFile)
    expect(content).toContain('Skill In Library')

    // Verify harness state changed to detached
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('[d] Claude Code')
    }, 2000)

    unmount()
  })
})

describe('App TUI Library Mode', () => {
  test('library mode shows only AVAILABLE skills (no INSTALLED or LOCAL)', async () => {
    // Library mode: inProject=false, projectPath points to library
    // This simulates running `skillbook` from outside a project
    const { lastFrame, unmount } = render(
      <App projectPath={LIBRARY_PATH} inProject={false} />,
    )

    // Wait for render - should show AVAILABLE section
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('AVAILABLE')
    }, 3000)

    const frame = stripAnsi(lastFrame() ?? '')

    // Should show AVAILABLE section with library skills
    expect(frame).toContain('AVAILABLE')
    expect(frame).toContain('skill-available')

    // Should NOT show INSTALLED or LOCAL sections (no project context)
    expect(frame).not.toContain('INSTALLED')
    expect(frame).not.toContain('LOCAL')

    // Should show Library Mode indicator
    expect(frame).toContain('Library Mode')

    unmount()
  })
})

describe('App TUI Lazy Init', () => {
  test('install creates .skillbook sparse checkout when missing', async () => {
    const skillbookPath = join(PROJECT_PATH, '.skillbook')
    const skillbookGitPath = join(skillbookPath, '.git')

    // Remove .skillbook to simulate fresh project
    if (existsSync(skillbookPath)) {
      rmSync(skillbookPath, { recursive: true, force: true })
    }

    // Verify .skillbook doesn't exist
    expect(existsSync(skillbookPath)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    // Wait for render - should still show skills (from harness folders)
    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('AVAILABLE') || frame.includes('INSTALLED')
    }, 3000)

    // Navigate to skill-available (in AVAILABLE section, can be installed)
    const found = await navigateToRow('skill-available', stdin, lastFrame)
    expect(found).toBe(true)

    // Press 'i' to install
    stdin.write('i')

    // Verify the skill directory path
    const skillDir = join(PROJECT_PATH, '.claude', 'skills', 'skill-available')

    // Wait for install to complete - both .skillbook and symlink should be created
    await waitFor(() => {
      return existsSync(skillbookGitPath) && existsSync(skillDir)
    }, 5000)

    // Verify .skillbook was created as a git repo (sparse checkout)
    expect(existsSync(skillbookPath)).toBe(true)
    expect(existsSync(skillbookGitPath)).toBe(true)

    // Verify the skill is now installed (symlink created)
    expect(existsSync(skillDir)).toBe(true)
    expect(isSymlink(skillDir)).toBe(true)

    unmount()
  })
})
