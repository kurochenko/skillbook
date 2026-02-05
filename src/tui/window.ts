export const getStickyWindowStart = (
  currentStart: number,
  selectedIndex: number,
  totalRows: number,
  windowSize: number,
): number => {
  if (windowSize <= 0 || totalRows <= windowSize) return 0

  const maxStart = totalRows - windowSize
  const clampedStart = Math.max(0, Math.min(maxStart, currentStart))

  if (selectedIndex < clampedStart) return selectedIndex
  if (selectedIndex >= clampedStart + windowSize) {
    return Math.min(maxStart, selectedIndex - windowSize + 1)
  }

  return clampedStart
}
