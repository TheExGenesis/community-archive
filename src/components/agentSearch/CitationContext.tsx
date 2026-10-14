'use client'

import { createContext, useContext } from 'react'
import type { Citation } from './messageView'

/**
 * Links an answer's citation chips to its cited tweets. Keys are the
 * citation anchors (`ask-<message>-tweet-<id>`), which both sides know.
 */
export interface CitationLinks {
  /**
   * The citation the sidebar shows, when it shows one of this answer's; the
   * sidebar scrolls to it and opens it. `seq` changes on every click, so
   * clicking the same chip again still scrolls.
   */
  selected: { anchor: string; seq: number } | null
  /** Under the pointer or keyboard focus, on either side. */
  hovered: string | null
  /** Cited in the answer paragraph nearest the middle of the screen. */
  inView: ReadonlySet<string>
  hover: (anchor: string | null) => void
  /** Wide screens: open the sidebar on this citation; focus returns to `chip`. */
  openSidebar: (anchor: string, chip: HTMLElement) => void
  /** Narrow screens: open the post in a sheet; focus returns to `chip`. */
  openSheet: (anchor: string, chip: HTMLElement) => void
  /** The citation, for the card a chip shows on hover and its load state. */
  citationFor: (anchor: string) => Citation | undefined
  /** Fetches again the tweets of a reopened conversation that failed to load. */
  retryTweets?: () => void
}

export const CitationContext = createContext<CitationLinks | null>(null)

export const useCitationLinks = () => useContext(CitationContext)

/** Wide screens open a citation in the sidebar; narrower ones in a sheet. */
export const SIDEBAR_MEDIA = '(min-width: 1024px)'
