'use client'

import { useSyncExternalStore } from 'react'

// Wide screens: the sidebar a citation chip opens. One for the page, so a
// chip in any turn moves it to its own citation and the page makes room for
// it. Anchors (`ask-<message>-tweet-<id>`) are unique across turns, so each
// turn knows whether the sidebar shows one of its citations.

export interface CitationSidebarState {
  anchor: string
  /** Changes on every open, so clicking the same chip again still scrolls. */
  seq: number
}

let state: CitationSidebarState | null = null
// The chip that opened the sidebar; focus goes back to it on close.
let opener: HTMLElement | null = null
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function openCitationSidebar(anchor: string, chip: HTMLElement | null) {
  state = { anchor, seq: (state?.seq ?? 0) + 1 }
  opener = chip
  emit()
}

export function closeCitationSidebar() {
  if (!state) return
  state = null
  emit()
}

export const citationSidebarOpener = () => opener

export function useCitationSidebar(): CitationSidebarState | null {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  )
}
