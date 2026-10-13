'use client'

import { useCallback, useSyncExternalStore } from 'react'

// Whether the reader closed the cited-tweets column on wide screens. One
// setting for every turn on the page, kept in this browser. Storage may be
// unavailable (private windows, blocked site data); the choice then lasts
// for this page view only.
const KEY = 'ask-archive.cited-column-hidden'
const listeners = new Set<() => void>()
let chosen: boolean | null = null

function read() {
  if (chosen !== null) return chosen
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCitedColumnHidden(): [boolean, (hidden: boolean) => void] {
  const hidden = useSyncExternalStore(subscribe, read, () => false)
  const setHidden = useCallback((next: boolean) => {
    chosen = next
    try {
      if (next) window.localStorage.setItem(KEY, '1')
      else window.localStorage.removeItem(KEY)
    } catch {
      // Kept in `chosen` for this page view.
    }
    listeners.forEach((listener) => listener())
  }, [])
  return [hidden, setHidden]
}
