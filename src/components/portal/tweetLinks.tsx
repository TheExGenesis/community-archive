'use client'

import { createContext, useContext, type ReactNode } from 'react'

// Where a tweet card's links open. Most pages navigate in place; a page whose
// state would be lost by leaving (an answer being read in Ask the archive)
// wraps its cards so profiles and tweets open in a new tab.

const NewTab = createContext(false)

export function TweetLinksInNewTab({ children }: { children: ReactNode }) {
  return <NewTab.Provider value>{children}</NewTab.Provider>
}

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const

/** Props for a card's links: a new tab inside TweetLinksInNewTab. */
export function useTweetLinkTarget(): Partial<typeof NEW_TAB> {
  return useContext(NewTab) ? NEW_TAB : {}
}

/** Whether a card's own navigation (a click on the card) opens a new tab. */
export function useTweetLinksInNewTab() {
  return useContext(NewTab)
}
