import { useState, useCallback, useRef, useEffect } from 'react'
import { useInput, useApp } from 'ink'
import { KEYS, isKey } from '@/tui/constants'

type ConfirmState = {
  message: string
  onConfirm: () => void | Promise<void>
}

type KeyState = {
  upArrow: boolean
  downArrow: boolean
  tab: boolean
  escape: boolean
  ctrl: boolean
}

type UseListNavigationOptions = {
  listLength: number
  onInput?: (input: string, key: KeyState) => void
  confirmState?: ConfirmState | null
  onConfirmCancel?: () => void
}

type UseListNavigationResult = {
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
}

export const useListNavigation = ({
  listLength,
  onInput,
  confirmState,
  onConfirmCancel,
}: UseListNavigationOptions): UseListNavigationResult => {
  const { exit } = useApp()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const pendingDelta = useRef(0)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
    }
  }, [])

  const flushNavigation = useCallback(() => {
    const delta = pendingDelta.current
    if (delta === 0) return
    pendingDelta.current = 0
    flushTimer.current = null

    setSelectedIndex((current) => {
      if (listLength === 0) return 0
      return Math.max(0, Math.min(listLength - 1, current + delta))
    })
  }, [listLength])

  const queueNavigation = useCallback(
    (delta: number) => {
      pendingDelta.current += delta

      if (!flushTimer.current) {
        flushTimer.current = setTimeout(flushNavigation, 16)
      }
    },
    [flushNavigation],
  )

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

    if (isKey(input, KEYS.QUIT) || (key.ctrl && input === 'c')) {
      exit()
      return
    }

    if (key.upArrow || isKey(input, KEYS.UP)) {
      queueNavigation(-1)
    }
    if (key.downArrow || isKey(input, KEYS.DOWN)) {
      queueNavigation(1)
    }

    onInput?.(input, key)
  })

  return {
    selectedIndex,
    setSelectedIndex: clampedSetIndex,
  }
}
