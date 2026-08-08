'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PortalTweet } from '@/lib/portal/types'
import { CARD, MUTED } from './styles'
import { TweetRow } from './TweetRow'

export function HistoricalBangersCarousel({
  tweets,
}: {
  tweets: PortalTweet[]
}) {
  const [currentIndex, setCurrentIndex] = useState(0)

  if (tweets.length === 0) return null

  const visibleIndex = Math.min(currentIndex, tweets.length - 1)
  const currentTweet = tweets[visibleIndex]
  const hasMultipleTweets = tweets.length > 1

  const showPrevious = () => {
    setCurrentIndex((index) => (index - 1 + tweets.length) % tweets.length)
  }

  const showNext = () => {
    setCurrentIndex((index) => (index + 1) % tweets.length)
  }

  return (
    <section
      aria-label="Historical bangers"
      aria-roledescription="carousel"
      className={`${CARD} min-w-0 overflow-hidden`}
      tabIndex={hasMultipleTweets ? 0 : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          showPrevious()
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          showNext()
        }
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-[#26262a]">
        <h3 className="min-w-0 truncate text-[13px] font-bold">
          Historical banger · near this day
        </h3>
        <Link
          href="/bangers"
          className="flex-shrink-0 text-[12.5px] font-semibold text-brand hover:underline"
        >
          More bangers →
        </Link>
      </div>

      <div aria-live="polite" aria-atomic="true">
        <TweetRow
          key={currentTweet.id}
          tweet={currentTweet}
          collapsible
          showDate
        />
      </div>

      {hasMultipleTweets && (
        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2 dark:border-[#202023]">
          <span className={`text-[11.5px] tabular-nums ${MUTED}`}>
            {visibleIndex + 1} of {tweets.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={showPrevious}
              aria-label="Previous historical banger"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-[#303036] dark:text-[#a7a7b4] dark:hover:border-[#45454c] dark:hover:bg-[#242428] dark:hover:text-white"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={showNext}
              aria-label="Next historical banger"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-[#303036] dark:text-[#a7a7b4] dark:hover:border-[#45454c] dark:hover:bg-[#242428] dark:hover:text-white"
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
