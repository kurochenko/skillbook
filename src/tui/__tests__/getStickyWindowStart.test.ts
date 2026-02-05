import { describe, expect, test } from 'bun:test'
import { getStickyWindowStart } from '@/tui/window'

describe('getStickyWindowStart', () => {
  describe('edge cases', () => {
    test('returns 0 when windowSize <= 0', () => {
      expect(getStickyWindowStart(5, 3, 20, 0)).toBe(0)
      expect(getStickyWindowStart(5, 3, 20, -1)).toBe(0)
    })

    test('returns 0 when all rows fit in window', () => {
      expect(getStickyWindowStart(0, 3, 5, 10)).toBe(0)
      expect(getStickyWindowStart(3, 2, 5, 5)).toBe(0)
    })
  })

  describe('selected item within current window', () => {
    test('keeps window position when selected is visible', () => {
      // window shows rows 2-6, selected is 4 → stay at 2
      expect(getStickyWindowStart(2, 4, 20, 5)).toBe(2)
    })

    test('keeps window at start when selected is at top', () => {
      expect(getStickyWindowStart(0, 0, 20, 5)).toBe(0)
    })

    test('keeps window at end when selected is at bottom edge', () => {
      // window shows rows 15-19, selected is 19 → stay at 15
      expect(getStickyWindowStart(15, 19, 20, 5)).toBe(15)
    })
  })

  describe('selected item above window', () => {
    test('scrolls up to show selected item', () => {
      // window shows rows 5-9, selected is 3 → snap to 3
      expect(getStickyWindowStart(5, 3, 20, 5)).toBe(3)
    })

    test('scrolls to top when selected is 0', () => {
      expect(getStickyWindowStart(5, 0, 20, 5)).toBe(0)
    })
  })

  describe('selected item below window', () => {
    test('scrolls down to show selected item', () => {
      // window shows rows 0-4, selected is 7 → move to 3 (7 - 5 + 1)
      expect(getStickyWindowStart(0, 7, 20, 5)).toBe(3)
    })

    test('does not scroll past maxStart', () => {
      // total=20, window=5, maxStart=15, selected=19 → min(15, 19-5+1)=15
      expect(getStickyWindowStart(0, 19, 20, 5)).toBe(15)
    })
  })

  describe('clamps invalid currentStart', () => {
    test('clamps negative currentStart to 0', () => {
      expect(getStickyWindowStart(-5, 2, 20, 5)).toBe(0)
    })

    test('clamps currentStart beyond maxStart', () => {
      // maxStart=15, currentStart=18, selected is in view from 15 → 15
      expect(getStickyWindowStart(18, 16, 20, 5)).toBe(15)
    })
  })

  describe('stability / no oscillation', () => {
    test('applying output as next input produces same output (idempotent)', () => {
      const totalRows = 30
      const windowSize = 8

      for (let selected = 0; selected < totalRows; selected++) {
        const firstResult = getStickyWindowStart(0, selected, totalRows, windowSize)
        const secondResult = getStickyWindowStart(firstResult, selected, totalRows, windowSize)
        expect(secondResult).toBe(firstResult)
      }
    })

    test('sequential scrolling down produces monotonically increasing starts', () => {
      const totalRows = 30
      const windowSize = 8
      let currentStart = 0

      for (let selected = 0; selected < totalRows; selected++) {
        const nextStart = getStickyWindowStart(currentStart, selected, totalRows, windowSize)
        expect(nextStart).toBeGreaterThanOrEqual(currentStart)
        // start should never jump more than 1 row when moving one step
        expect(nextStart - currentStart).toBeLessThanOrEqual(1)
        currentStart = nextStart
      }
    })

    test('sequential scrolling up produces monotonically decreasing starts', () => {
      const totalRows = 30
      const windowSize = 8
      let currentStart = totalRows - windowSize

      for (let selected = totalRows - 1; selected >= 0; selected--) {
        const nextStart = getStickyWindowStart(currentStart, selected, totalRows, windowSize)
        expect(nextStart).toBeLessThanOrEqual(currentStart)
        expect(currentStart - nextStart).toBeLessThanOrEqual(1)
        currentStart = nextStart
      }
    })

    test('selected item is always within the window', () => {
      const totalRows = 30
      const windowSize = 8

      for (let currentStart = 0; currentStart <= totalRows - windowSize; currentStart++) {
        for (let selected = 0; selected < totalRows; selected++) {
          const start = getStickyWindowStart(currentStart, selected, totalRows, windowSize)
          expect(selected).toBeGreaterThanOrEqual(start)
          expect(selected).toBeLessThan(start + windowSize)
        }
      }
    })

    test('rapid direction changes do not cause jumps', () => {
      const totalRows = 30
      const windowSize = 8
      let currentStart = 0
      let selected = 0

      // Scroll down to middle
      for (let i = 0; i < 15; i++) {
        selected++
        currentStart = getStickyWindowStart(currentStart, selected, totalRows, windowSize)
      }

      const midStart = currentStart

      // Go up one
      selected--
      const upStart = getStickyWindowStart(currentStart, selected, totalRows, windowSize)

      // Go back down one
      selected++
      const downStart = getStickyWindowStart(upStart, selected, totalRows, windowSize)

      // Should be back where we were or stable
      expect(Math.abs(downStart - midStart)).toBeLessThanOrEqual(1)
    })
  })
})
