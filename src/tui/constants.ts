/**
 * Shared TUI constants for key bindings and UI values
 */

// Navigation keys
export const KEYS = {
  UP: ['k'],
  DOWN: ['j'],
  QUIT: ['q'],
  CONFIRM: ['y'],
  CANCEL: ['n'],
  TAB: 'tab',
} as const

// Check if input matches a key binding
export const isKey = (input: string, keys: readonly string[]): boolean =>
  keys.includes(input)

// UI constants
export const UI = {
  CONTENT_MIN_HEIGHT: 10,
  MESSAGE_TIMEOUT_MS: 2000,
  SELECTED_COLOR: 'blue',
} as const

// Section labels
export const SECTION_LABELS = {
  INSTALLED: 'INSTALLED',
  LOCAL: 'LOCAL',
  AVAILABLE: 'AVAILABLE',
  HARNESSES: 'SELECT HARNESSES',
  PROJECTS: 'PROJECTS',
} as const
