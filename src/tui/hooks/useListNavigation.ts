import { useState, useCallback } from 'react'
import { useInput, useApp } from 'ink'
import { KEYS, isKey } from '@/tui/constants'

type ConfirmState = {
  message: string
  onConfirm: () => void | Promise<void>
}

type UseListNavigationOptions = {
  listLength: number
  onInput?: (input: string, key: { upArrow: boolean; downArrow: boolean; tab: boolean; escape: boolean; ctrl: boolean }) => void
  confirmState?: ConfirmState | null
  onConfirmCancel?: () => void
}

type UseListNavigationResult = {
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
}

/**
 * Shared hook for list navigation, quit handling, and confirm dialogs.
 * 
 * Handles:
 * - j/k and arrow keys for navigation
 * - q and Ctrl+C for quit
 * - y/n/escape for confirm dialogs
 * - Clamps selection to valid bounds
 */
export const useListNavigation = ({
  listLength,
  onInput,
  confirmState,
  onConfirmCancel,
}: UseListNavigationOptions): UseListNavigationResult => {
  const { exit } = useApp()
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Clamp selection when list changes
  const clampedSetIndex = useCallback(
    (updater: React.SetStateAction<number>) => {
      setSelectedIndex((current) => {
        const next = typeof updater === 'function' ? updater(current) : updater
        if (listLength === 0) return 0
        return Math.max(0, Math.min(listLength - 1, next))
      })
    },
    [listLength]
  )

  useInput((input, key) => {
    // Confirm dialog handling (takes priority)
    if (confirmState) {
      if (isKey(input, KEYS.CONFIRM)) {
        confirmState.onConfirm()
        onConfirmCancel?.()
        return
      }
      if (isKey(input, KEYS.CANCEL) || key.escape) {
        onConfirmCancel?.()
        return
      }
      return
    }

    // Quit
    if (isKey(input, KEYS.QUIT) || (key.ctrl && input === 'c')) {
      exit()
      return
    }

    // Navigation
    if (key.upArrow || isKey(input, KEYS.UP)) {
      clampedSetIndex((i) => i - 1)
    }
    if (key.downArrow || isKey(input, KEYS.DOWN)) {
      clampedSetIndex((i) => i + 1)
    }

    // Pass through to custom handler
    onInput?.(input, key)
  })

  return {
    selectedIndex,
    setSelectedIndex: clampedSetIndex,
  }
}
