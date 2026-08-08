'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PortalTweet } from '@/lib/portal/types'
import { CARD, MUTED } from './styles'
import { TweetRow } from './TweetRow'

const CAROUSEL_CONTROL =
  'absolute top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white/90 text-zinc-600 shadow-md backdrop-blur-sm transition-colors hover:border-zinc-400 hover:bg-white hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-[#3a3a40] dark:bg-[#1b1b1e]/90 dark:text-[#c4c4cc] dark:hover:border-[#55555e] dark:hover:bg-[#242428] dark:hover:text-white'

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
      className={`${CARD} relative flex h-[22rem] min-w-0 flex-col overflow-hidden`}
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
      <div className="flex flex-none items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-[#26262a]">
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

      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <TweetRow
            key={currentTweet.id}
            tweet={currentTweet}
            collapsible
            showDate
          />
        </div>

        {hasMultipleTweets && (
          <>
            <span
              aria-live="polite"
              aria-atomic="true"
              className={`pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-zinc-200 bg-white/90 px-2.5 py-1 text-[11.5px] tabular-nums shadow-sm backdrop-blur-sm dark:border-[#303036] dark:bg-[#1b1b1e]/90 ${MUTED}`}
            >
              {visibleIndex + 1} of {tweets.length}
            </span>
            <button
              type="button"
              onClick={showPrevious}
              aria-label="Previous historical banger"
              className={`${CAROUSEL_CONTROL} left-3`}
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={showNext}
              aria-label="Next historical banger"
              className={`${CAROUSEL_CONTROL} right-3`}
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </section>
  )
}
