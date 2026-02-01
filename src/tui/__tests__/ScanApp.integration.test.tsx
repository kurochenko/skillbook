import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { render } from 'ink-testing-library'
import { join } from 'path'
import ScanApp from '@/tui/ScanApp'
import {
  setupScanFixtures,
  cleanupScanFixtures,
  SCAN_LIBRARY_PATH,
  SCAN_PROJECTS_PATH,
} from '../../../test-fixtures/scan-setup'
import {
  waitFor,
  waitForFrame,
  stripAnsi,
  pathExists,
  readFile,
  navigateToRow,
} from '../../../test-fixtures/helpers'
import { withLibraryEnv } from '@/test-utils/env'

let restoreEnv: (() => void) | null = null

beforeAll(() => {
  restoreEnv = withLibraryEnv(SCAN_LIBRARY_PATH)
})

beforeEach(() => {
  setupScanFixtures()
})

afterAll(() => {
  cleanupScanFixtures()

  restoreEnv?.()
})

describe('ScanApp TUI Integration', () => {
  describe('display tests', () => {
    test('shows projects grouped with skill counts', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      await waitForFrame(lastFrame, 'PROJECTS', 5000)

      const frame = stripAnsi(lastFrame() ?? '')

      expect(frame).toContain('project-a')
      expect(frame).toContain('project-b')
      expect(frame).toContain('project-c')

      expect(frame).toContain('PROJECTS (3)')

      unmount()
    })

    test('shows correct status badges for skills', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      await waitForFrame(lastFrame, 'PROJECTS', 5000)

      const frame = stripAnsi(lastFrame() ?? '')

      expect(frame).toContain('local-only')
      expect(frame).toContain('[local]')

      expect(frame).toContain('existing-same')
      expect(frame).toContain('[matches]')

      expect(frame).toContain('existing-differs')
      expect(frame).toContain('[differs]')

      unmount()
    })

    test('shows managed project badge for projects with .SB', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      await waitForFrame(lastFrame, 'PROJECTS', 5000)

      const frame = stripAnsi(lastFrame() ?? '')

      expect(frame).toContain('[✓ skillbook]')

      const lines = frame.split('\n')
      const projectALine = lines.find((l) => l.includes('project-a'))
      expect(projectALine).toContain('[✓ skillbook]')

      unmount()
    })

    test('shows variant warning for conflict skills', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      await waitForFrame(lastFrame, 'PROJECTS', 5000)

      const frame = stripAnsi(lastFrame() ?? '')

      expect(frame).toContain('conflict-skill')
      expect(frame).toContain('⚠')
      expect(frame).toContain('variants')

      unmount()
    })

    test('shows legend explaining status badges', async () => {
      const { lastFrame, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      await waitForFrame(lastFrame, 'PROJECTS', 5000)

      const frame = stripAnsi(lastFrame() ?? '')

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

      expect(pathExists(librarySkillPath)).toBe(false)

      const { lastFrame, stdin, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      await waitForFrame(lastFrame, 'PROJECTS', 5000)

      const found = await navigateToRow('local-only', stdin, lastFrame)
      expect(found).toBe(true)

      stdin.write('a')

      await waitFor(() => pathExists(librarySkillPath), 3000)

      expect(pathExists(librarySkillPath)).toBe(true)
      const content = readFile(librarySkillPath)
      expect(content).toContain('Local Only Skill')

      unmount()
    })

    test('add updates skill status to matches', async () => {
      const { lastFrame, stdin, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      await waitForFrame(lastFrame, 'PROJECTS', 5000)

      let frame = stripAnsi(lastFrame() ?? '')
      const localOnlyLine = frame.split('\n').find((l) => l.includes('local-only'))
      expect(localOnlyLine).toContain('[local]')

      const found = await navigateToRow('local-only', stdin, lastFrame)
      expect(found).toBe(true)
      stdin.write('a')

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

      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      const found = await navigateToRow('existing-differs', stdin, lastFrame)
      expect(found).toBe(true)

      stdin.write('o')

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

      expect(readFile(librarySkillPath)).toContain('LIBRARY VERSION')

      const { lastFrame, stdin, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      const found = await navigateToRow('existing-differs', stdin, lastFrame)
      expect(found).toBe(true)

      stdin.write('o')

      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('Overwrite') && frame.includes('[y]es')
      }, 2000)

      stdin.write('y')

      await waitFor(() => {
        const content = readFile(librarySkillPath)
        return content.includes('PROJECT VERSION')
      }, 3000)

      expect(readFile(librarySkillPath)).toContain('PROJECT VERSION')

      unmount()
    })

    test('cancel overwrite with n preserves library', async () => {
      const librarySkillPath = join(SCAN_LIBRARY_PATH, 'skills', 'existing-differs', 'SKILL.md')

      expect(readFile(librarySkillPath)).toContain('LIBRARY VERSION')

      const { lastFrame, stdin, unmount } = render(<ScanApp basePath={SCAN_PROJECTS_PATH} />)

      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('PROJECTS')
      }, 5000)

      const found = await navigateToRow('existing-differs', stdin, lastFrame)
      expect(found).toBe(true)

      stdin.write('o')

      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return frame.includes('Overwrite') && frame.includes('[y]es')
      }, 2000)

      stdin.write('n')

      await waitFor(() => {
        const frame = stripAnsi(lastFrame() ?? '')
        return !frame.includes('[y]es')
      }, 2000)

      expect(readFile(librarySkillPath)).toContain('LIBRARY VERSION')

      unmount()
    })
  })
})
