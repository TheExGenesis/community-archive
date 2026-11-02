'use client'

import { useCallback, useSyncExternalStore } from 'react'

// The member's own OpenRouter key, kept in this browser only. It is sent
// with each question (OWN_KEY_HEADER) and never stored by the server, so
// another browser, or this one after clearing site data, uses the house
// quota until the key is added again. Storage may be unavailable (private
// windows, blocked site data); the key then lasts for this page view.
const STORAGE_KEY = 'ask-archive.openrouter-key'
const listeners = new Set<() => void>()
let held: string | null | undefined

export function readOwnKey(): string | null {
  if (held !== undefined) return held
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeOwnKey(key: string | null) {
  held = key
  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key)
    else window.localStorage.removeItem(STORAGE_KEY)
    // Storage has it; later reads (and other tabs) go to storage.
    held = undefined
  } catch {
    // Kept in `held` for this page view.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // A key added or removed in another tab applies here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Whether this browser holds a key, and a setter; the key itself stays out of render. */
export function useOwnKey(): [boolean, (key: string | null) => void] {
  const hasKey = useSyncExternalStore(
    subscribe,
    () => Boolean(readOwnKey()),
    () => false,
  )
  const setKey = useCallback((key: string | null) => writeOwnKey(key), [])
  return [hasKey, setKey]
}
