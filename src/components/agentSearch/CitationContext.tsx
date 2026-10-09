'use client'

import { createContext, useContext } from 'react'

/**
 * Links an answer's citation chips to its cited-posts rail. Keys are the
 * citation anchors (`ask-<message>-tweet-<id>`), which both sides know.
 */
export interface CitationLinks {
  /**
   * Chosen by a chip click; the rail scrolls to it and opens it. `seq`
   * changes on every click, so clicking the same chip again still scrolls.
   */
  selected: { anchor: string; seq: number } | null
  /** Under the pointer or keyboard focus, on either side. */
  hovered: string | null
  /** Cited in the answer paragraph nearest the middle of the screen. */
  inView: ReadonlySet<string>
  select: (anchor: string) => void
  hover: (anchor: string | null) => void
  /** Narrow screens: open the post in a sheet; focus returns to `chip`. */
  openSheet: (anchor: string, chip: HTMLElement) => void
}

export const CitationContext = createContext<CitationLinks | null>(null)

export const useCitationLinks = () => useContext(CitationContext)

/** Wide screens show cited posts in the rail beside the answer. */
export const RAIL_MEDIA = '(min-width: 1024px)'
