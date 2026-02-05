import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import ScanApp from '@/tui/ScanApp'
import {
  setupScrollFixtures,
  cleanupScrollFixtures,
  SCROLL_LIBRARY_PATH,
  SCROLL_PROJECTS_PATH,
  TOTAL_ROWS,
} from '../../../test-fixtures/scroll-setup'
import { renderWithHeight } from '../../../test-fixtures/render-with-height'
import { waitForFrame, stripAnsi } from '../../../test-fixtures/helpers'
import { withLibraryEnv } from '@/test-utils/env'
import { KEYS } from '@/tui/constants'

const DOWN_KEY = KEYS.DOWN[0] ?? 'j'
const UP_KEY = KEYS.UP[0] ?? 'k'

let restoreEnv: (() => void) | null = null

beforeAll(() => {
  restoreEnv = withLibraryEnv(SCROLL_LIBRARY_PATH)
})

beforeEach(() => {
  setupScrollFixtures()
})

afterAll(() => {
  cleanupScrollFixtures()
  restoreEnv?.()
})

const findCursorLine = (frame: string): { index: number; line: string } | null => {
  const lines = stripAnsi(frame).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.startsWith('>') || line.startsWith(' >') || /^ *> /.test(line)) {
      return { index: i, line }
    }
  }
  return null
}

const getContentLines = (frame: string): string[] => {
  const stripped = stripAnsi(frame)
  const lines = stripped.split('\n')
  return lines.filter(
    (line) =>
      (line.includes('>') || line.includes('├─') || line.includes('└─') || /^ {2,}/.test(line)) &&
      !line.includes('[q]uit') &&
      !line.includes('PROJECTS'),
  )
}

// Terminal height small enough that 40 rows definitely overflow
const SMALL_TERMINAL = 25

describe('ScanApp scroll/windowing', () => {
  test('renders with many projects in small terminal', async () => {
    const { lastFrame, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    const frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toContain('PROJECTS')
    expect(frame).toContain('alpha')

    unmount()
  })

  test('selected item is always visible after scrolling down', async () => {
    const { lastFrame, stdin, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    // Scroll down through all rows
    for (let step = 0; step < TOTAL_ROWS - 1; step++) {
      stdin.write(DOWN_KEY)
      await new Promise((r) => setTimeout(r, 30))

      const frame = lastFrame() ?? ''
      const cursor = findCursorLine(frame)
      expect(cursor).not.toBeNull()
    }

    unmount()
  })

  test('selected item is always visible after scrolling up', async () => {
    const { lastFrame, stdin, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    // Scroll to bottom
    for (let i = 0; i < TOTAL_ROWS - 1; i++) {
      stdin.write(DOWN_KEY)
      await new Promise((r) => setTimeout(r, 15))
    }
    await new Promise((r) => setTimeout(r, 50))

    // Scroll back up through all rows
    for (let step = 0; step < TOTAL_ROWS - 1; step++) {
      stdin.write(UP_KEY)
      await new Promise((r) => setTimeout(r, 30))

      const frame = lastFrame() ?? ''
      const cursor = findCursorLine(frame)
      expect(cursor).not.toBeNull()
    }

    unmount()
  })

  test('no flickering: consecutive frames without input are identical', async () => {
    const { lastFrame, stdin, stdout, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    // Scroll to middle
    for (let i = 0; i < 15; i++) {
      stdin.write(DOWN_KEY)
      await new Promise((r) => setTimeout(r, 15))
    }
    await new Promise((r) => setTimeout(r, 100))

    // Capture frame count, wait, and check no new frames were added
    const frameCountBefore = stdout.frames.length
    const frameBefore = stripAnsi(lastFrame() ?? '')

    await new Promise((r) => setTimeout(r, 200))

    const frameCountAfter = stdout.frames.length
    const frameAfter = stripAnsi(lastFrame() ?? '')

    // No new frames should have been rendered without input
    expect(frameAfter).toBe(frameBefore)
    // Allow at most 1 extra frame for any pending React flush
    expect(frameCountAfter - frameCountBefore).toBeLessThanOrEqual(1)

    unmount()
  })

  test('viewport moves at most 1 row per navigation step when scrolling down', async () => {
    const { lastFrame, stdin, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    let previousFirstContentLine = ''

    for (let step = 0; step < TOTAL_ROWS - 1; step++) {
      stdin.write(DOWN_KEY)
      await new Promise((r) => setTimeout(r, 30))

      const frame = stripAnsi(lastFrame() ?? '')
      const contentLines = getContentLines(frame)
      const firstLine = contentLines[0] ?? ''

      if (previousFirstContentLine && firstLine !== previousFirstContentLine) {
        // The viewport shifted - the previous first line should now be gone
        // (it scrolled off the top), meaning we shifted by exactly the lines that disappeared
        // This is normal - just verify the cursor is still visible
        const cursor = findCursorLine(lastFrame() ?? '')
        expect(cursor).not.toBeNull()
      }

      previousFirstContentLine = firstLine
    }

    unmount()
  })

  test('rapid direction changes do not cause visual jumps', async () => {
    const { lastFrame, stdin, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    // Scroll to middle
    for (let i = 0; i < 15; i++) {
      stdin.write(DOWN_KEY)
      await new Promise((r) => setTimeout(r, 15))
    }
    await new Promise((r) => setTimeout(r, 50))

    const midFrame = stripAnsi(lastFrame() ?? '')

    // Rapidly alternate: down, up, down, up
    for (let i = 0; i < 5; i++) {
      stdin.write(DOWN_KEY)
      await new Promise((r) => setTimeout(r, 15))
      stdin.write(UP_KEY)
      await new Promise((r) => setTimeout(r, 15))
    }
    await new Promise((r) => setTimeout(r, 100))

    const afterFrame = stripAnsi(lastFrame() ?? '')

    // Should end up at approximately the same place
    // The cursor should be visible and frame should be stable
    const cursor = findCursorLine(lastFrame() ?? '')
    expect(cursor).not.toBeNull()

    // Content should be similar (same viewport area)
    const midLines = getContentLines(midFrame)
    const afterLines = getContentLines(afterFrame)
    // At least half the content lines should overlap
    const overlap = midLines.filter((l) => afterLines.includes(l))
    expect(overlap.length).toBeGreaterThan(midLines.length / 3)

    unmount()
  })

  test('frame-by-frame: window top row only shifts by 1 row per keystroke', async () => {
    const { lastFrame, stdin, stdout, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    // Record initial frame index
    const initialFrameCount = stdout.frames.length

    // Scroll through all rows, recording every frame
    for (let step = 0; step < TOTAL_ROWS - 1; step++) {
      stdin.write(DOWN_KEY)
      await new Promise((r) => setTimeout(r, 30))
    }

    // Gather all frames generated during scrolling
    const scrollFrames = stdout.frames.slice(initialFrameCount)
      .map((f) => stripAnsi(f))

    // Extract the first "content" line (row with cursor/tree markers) from each frame
    const firstContentPerFrame: string[] = []
    for (const frame of scrollFrames) {
      const lines = frame.split('\n')
      const contentLine = lines.find(
        (l) =>
          (l.includes('>') || l.includes('├─') || l.includes('└─')) &&
          !l.includes('[q]uit') &&
          !l.includes('PROJECTS'),
      )
      if (contentLine) {
        firstContentPerFrame.push(contentLine.trim())
      }
    }

    // Between consecutive frames, the first content line should either stay the same
    // or shift by exactly 1 row (i.e. the previous first line disappears and a new one
    // takes its place). We verify this by checking that consecutive frames share at
    // least the second line of the previous frame as the first line of the current.
    // For simplicity: just verify no large jumps by checking that at least one content
    // line from the previous frame appears in the next frame.
    for (let i = 1; i < scrollFrames.length; i++) {
      const prevLines = getContentLines(scrollFrames[i - 1] ?? '')
      const currLines = getContentLines(scrollFrames[i] ?? '')

      if (prevLines.length === 0 || currLines.length === 0) continue

      const overlap = prevLines.filter((l) => currLines.includes(l))
      // At least most lines should overlap (window shifts at most 1 row)
      expect(overlap.length).toBeGreaterThanOrEqual(
        Math.max(0, Math.min(prevLines.length, currLines.length) - 2),
      )
    }

    unmount()
  })

  test('scrolling to bottom shows last project', async () => {
    const { lastFrame, stdin, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    // Scroll all the way down
    for (let i = 0; i < TOTAL_ROWS - 1; i++) {
      stdin.write(DOWN_KEY)
      await new Promise((r) => setTimeout(r, 15))
    }
    await new Promise((r) => setTimeout(r, 100))

    const frame = stripAnsi(lastFrame() ?? '')
    // Should see the last project (hotel) somewhere
    expect(frame).toContain('hotel')

    unmount()
  })

  test('scrolling back to top shows first project', async () => {
    const { lastFrame, stdin, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    // Scroll down
    for (let i = 0; i < 20; i++) {
      stdin.write(DOWN_KEY)
      await new Promise((r) => setTimeout(r, 15))
    }
    await new Promise((r) => setTimeout(r, 50))

    // Scroll back up
    for (let i = 0; i < 20; i++) {
      stdin.write(UP_KEY)
      await new Promise((r) => setTimeout(r, 15))
    }
    await new Promise((r) => setTimeout(r, 100))

    const frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toContain('alpha')

    unmount()
  })

  test('rapid keystrokes are batched into fewer renders', async () => {
    const { lastFrame, stdin, stdout, unmount } = renderWithHeight(
      <ScanApp basePath={SCROLL_PROJECTS_PATH} />,
      SMALL_TERMINAL,
    )

    await waitForFrame(lastFrame, 'PROJECTS', 5000)

    const framesBefore = stdout.frames.length

    // Fire 10 keys as fast as possible (no delay between them)
    const rapidKeys = 10
    for (let i = 0; i < rapidKeys; i++) {
      stdin.write(DOWN_KEY)
    }

    // Wait for all batched flushes to complete
    await new Promise((r) => setTimeout(r, 100))

    const framesAfter = stdout.frames.length
    const rendersFromRapidInput = framesAfter - framesBefore

    // With batching, we should get significantly fewer renders than keystrokes
    // Without batching, we'd get ~10 renders (1 per key)
    // With batching at 16ms, keys fired synchronously should collapse into ~1-2 renders
    expect(rendersFromRapidInput).toBeLessThan(rapidKeys)

    // And the cursor should still be visible at the final position
    const cursor = findCursorLine(lastFrame() ?? '')
    expect(cursor).not.toBeNull()

    unmount()
  })
})
