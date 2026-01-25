/**
 * Integration tests for ScanApp TUI (skillbook scan)
 *
 * Tests the scan interface for discovering skills across projects
 * and adding them to the library.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { render } from 'ink-testing-library'
import { join } from 'path'
import ScanApp from '../ScanApp'
import {
  setupScanFixtures,
  cleanupScanFixtures,
  SCAN_LIBRARY_PATH,
  SCAN_PROJECTS_PATH,
} from '../../../test-fixtures/scan-setup'
import {
  waitFor,
  stripAnsi,
  pathExists,
  readFile,
  navigateToRow,
} from '../../../test-fixtures/helpers'

// Store original env
let originalLibraryEnv: string | undefined

beforeAll(() => {
  // Override library path for all tests
  originalLibraryEnv = process.env.SKILLBOOK_LIBRARY
  process.env.SKILLBOOK_LIBRARY = SCAN_LIBRARY_PATH
})

beforeEach(() => {
  // Reset fixtures before each test (tests modify state)
  setupScanFixtures()
})

afterAll(() => {
  // Cleanup
  cleanupScanFixtures()

  // Restore env
  if (originalLibraryEnv !== undefined) {
    process.env.SKILLBOOK_LIBRARY = originalLibraryEnv
  } else {
    delete process.env.SKILLBOOK_LIBRARY
  }
})

describe('ScanApp TUI Integration', () => {
  describe('display tests', () => {
    test('shows projects grouped with skill counts', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete (shows PROJECTS header)
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      const frame = stripAnsi(lastFrame() ?? '')

      // Should show all three projects
      expect(frame).toContain('project-a')
      expect(frame).toContain('project-b')
      expect(frame).toContain('project-c')

      // Should show skill counts
      expect(frame).toContain('PROJECTS (3)')

      unmount()
    })

    test('shows correct status badges for skills', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      const frame = stripAnsi(lastFrame() ?? '')

      // local-only should show [local] (not in library)
      expect(frame).toContain('local-only')
      expect(frame).toContain('[local]')

      // existing-same should show [matches] (same as library)
      expect(frame).toContain('existing-same')
      expect(frame).toContain('[matches]')

      // existing-differs should show [differs] (different from library)
      expect(frame).toContain('existing-differs')
      expect(frame).toContain('[differs]')

      unmount()
    })

    test('shows managed project badge for projects with .skillbook', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      const frame = stripAnsi(lastFrame() ?? '')

      // project-a has .skillbook/ so should show managed badge
      // Look for the badge near project-a
      expect(frame).toContain('[✓ skillbook]')

      // The badge should appear on the project-a line
      const lines = frame.split('\n')
      const projectALine = lines.find((l) => l.includes('project-a'))
      expect(projectALine).toContain('[✓ skillbook]')

      unmount()
    })

    test('shows variant warning for conflict skills', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      const frame = stripAnsi(lastFrame() ?? '')

      // conflict-skill exists in both project-b and project-c with different content
      // Should show variant warning
      expect(frame).toContain('conflict-skill')
      expect(frame).toContain('⚠')
      expect(frame).toContain('variants')

      unmount()
    })

    test('shows legend explaining status badges', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      const frame = stripAnsi(lastFrame() ?? '')

      // Legend should explain what the badges mean
      expect(frame).toContain('[local]')
      expect(frame).toContain('not in library')
      expect(frame).toContain('[matches]')
      expect(frame).toContain('[differs]')

      unmount()
    })
  })

  describe('action tests', () => {
    test('add local skill to library with a key', async () => {
      const librarySkillPath = join(SCAN_LIBRARY_PATH, 'skills', 'local-only', 'SKILL.md')

      // Verify skill doesn't exist in library yet
      expect(pathExists(librarySkillPath)).toBe(false)

      const { lastFrame, stdin, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      // Navigate to local-only skill
      const found = await navigateToRow('local-only', stdin, lastFrame)
      expect(found).toBe(true)

      // Press 'a' to add to library
      stdin.write('a')

      // Wait for add to complete - skill should appear in library
      await waitFor(() => pathExists(librarySkillPath), 3000)

      // Verify skill was added to library
      expect(pathExists(librarySkillPath)).toBe(true)
      const content = readFile(librarySkillPath)
      expect(content).toContain('Local Only Skill')

      unmount()
    })

    test('add updates skill status to matches', async () => {
      const { lastFrame, stdin, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      // Verify local-only shows [local] initially
      let frame = stripAnsi(lastFrame() ?? '')
      const localOnlyLine = frame.split('\n').find((l) => l.includes('local-only'))
      expect(localOnlyLine).toContain('[local]')

      // Navigate to local-only skill and add it
      const found = await navigateToRow('local-only', stdin, lastFrame)
      expect(found).toBe(true)
      stdin.write('a')

      // Wait for status to update to [matches]
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        const line = frame.split('\n').find((l) => l.includes('local-only'))
        return line?.includes('[matches]') ?? false
      }, 5000)

      frame = stripAnsi(lastFrame() ?? '')
      const updatedLine = frame.split('\n').find((l) => l.includes('local-only'))
      expect(updatedLine).toContain('[matches]')

      unmount()
    })

    test('overwrite differs skill shows confirmation dialog', async () => {
      const { lastFrame, stdin, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      // Navigate to existing-differs skill
      const found = await navigateToRow('existing-differs', stdin, lastFrame)
      expect(found).toBe(true)

      // Press 'o' to overwrite - should show confirmation
      stdin.write('o')

      // Wait for confirmation dialog
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('Overwrite') && frame.includes('[y]es')
      }, 2000)

      const frame = stripAnsi(lastFrame() ?? '')
      expect(frame).toContain('Overwrite')
      expect(frame).toContain('[y]es')
      expect(frame).toContain('[n]o')

      unmount()
    })

    test('confirm overwrite with y updates library', async () => {
      const librarySkillPath = join(SCAN_LIBRARY_PATH, 'skills', 'existing-differs', 'SKILL.md')

      // Verify library has original content
      expect(readFile(librarySkillPath)).toContain('LIBRARY VERSION')

      const { lastFrame, stdin, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      // Navigate to existing-differs skill
      const found = await navigateToRow('existing-differs', stdin, lastFrame)
      expect(found).toBe(true)

      // Press 'o' to overwrite
      stdin.write('o')

      // Wait for confirmation dialog
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('Overwrite') && frame.includes('[y]es')
      }, 2000)

      // Confirm with 'y'
      stdin.write('y')

      // Wait for library to be updated
      await waitFor(() => {
        const content = readFile(librarySkillPath)
        return content.includes('PROJECT VERSION')
      }, 3000)

      // Verify library now has project content
      expect(readFile(librarySkillPath)).toContain('PROJECT VERSION')

      unmount()
    })

    test('cancel overwrite with n preserves library', async () => {
      const librarySkillPath = join(SCAN_LIBRARY_PATH, 'skills', 'existing-differs', 'SKILL.md')

      // Verify library has original content
      expect(readFile(librarySkillPath)).toContain('LIBRARY VERSION')

      const { lastFrame, stdin, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      // Wait for scan to complete
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      // Navigate to existing-differs skill
      const found = await navigateToRow('existing-differs', stdin, lastFrame)
      expect(found).toBe(true)

      // Press 'o' to overwrite
      stdin.write('o')

      // Wait for confirmation dialog
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('Overwrite') && frame.includes('[y]es')
      }, 2000)

      // Cancel with 'n'
      stdin.write('n')

      // Wait for dialog to close
      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return !frame.includes('[y]es')
      }, 2000)

      // Verify library still has original content
      expect(readFile(librarySkillPath)).toContain('LIBRARY VERSION')

      unmount()
    })
  })
})
