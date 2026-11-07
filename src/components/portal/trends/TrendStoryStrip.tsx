'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChartLineUp, Sparkle } from '@phosphor-icons/react'
import { captureProductAction } from '@/lib/productAnalytics'
import type { TrendStoryDay } from '@/lib/trendStories/core'
import { CARD, MUTED, SERIF } from '../styles'

const dayLabel = (date: string, style: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat('en-US', {
    ...(style === 'long' ? { weekday: 'long' } : { weekday: 'short' }),
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

const change = (value: number | null) =>
  value === null ? 'new' : `${value > 0 ? '+' : ''}${Math.round(value)}%`

/**
 * The AI-written daily trend stories, as a day-by-day strip above the
 * explorer. Each card opens its story page or charts its terms below.
 */
export function TrendStoryStrip({
  days,
  onChart,
  charting,
}: {
  days: TrendStoryDay[]
  /** Omitted where there is no chart (the signed-out view). */
  onChart?: (terms: string[]) => void
  charting?: boolean
}) {
  const [index, setIndex] = useState(0)
  const day = days[index]
  if (!day) return null
  return (
    <section className={`${CARD} mb-5`} aria-label="Daily trend stories">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-[#26262a]">
        <div className="flex items-center gap-2">
          <Sparkle
            aria-hidden="true"
            className="h-4 w-4 text-brand"
            weight="fill"
          />
          <h2 className="text-[15px] font-semibold" style={SERIF}>
            What’s trending · {dayLabel(day.date, 'long')}
          </h2>
        </div>
        <div className="flex max-w-full items-center gap-2 overflow-x-auto">
          {days.map((item, itemIndex) => (
            <button
              key={item.date}
              type="button"
              onClick={() => setIndex(itemIndex)}
              aria-pressed={itemIndex === index}
              className={`whitespace-nowrap border-b-2 px-1.5 py-0.5 text-[12px] font-semibold transition-colors ${
                itemIndex === index
                  ? 'border-brand text-foreground'
                  : `border-transparent ${MUTED} hover:text-foreground`
              }`}
            >
              {itemIndex === 0 ? 'Latest' : dayLabel(item.date)}
            </button>
          ))}
        </div>
      </div>
      <ol className="grid grid-cols-1 gap-px bg-zinc-200 dark:bg-[#26262a] sm:grid-cols-2 xl:grid-cols-3">
        {day.stories.map((story) => (
          <li
            key={story.slug}
            className="flex flex-col bg-white p-4 dark:bg-[#161618]"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              {story.changes.map((item) => (
                <span
                  key={item.term}
                  className="inline-flex items-baseline gap-1.5"
                >
                  <span className="text-[21px] font-bold leading-tight tracking-[-0.01em] text-foreground">
                    {item.term}
                  </span>
                  <span
                    className={`text-[13px] font-bold tabular-nums ${
                      item.changePct !== null && item.changePct < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {change(item.changePct)}
                  </span>
                </span>
              ))}
            </div>
            <Link
              href={`/trending/${story.trendDate}/${story.slug}`}
              onClick={() =>
                captureProductAction('trend_stories', 'topic_opened')
              }
              className="mt-2.5 text-[15px] font-semibold leading-snug hover:text-brand"
              style={SERIF}
            >
              {story.title}
            </Link>
            <p className={`mt-1.5 flex-1 text-[12.5px] leading-[1.5] ${MUTED}`}>
              {story.tooltip}
            </p>
            <div className="mt-3 flex items-center gap-3 text-[11.5px] font-semibold">
              <Link
                href={`/trending/${story.trendDate}/${story.slug}`}
                className="text-brand hover:underline"
              >
                Read the story →
              </Link>
              {onChart ? (
                <button
                  type="button"
                  disabled={charting}
                  onClick={() => onChart(story.terms)}
                  className={`inline-flex items-center gap-1 ${MUTED} hover:text-brand disabled:opacity-50`}
                >
                  <ChartLineUp aria-hidden="true" className="h-3.5 w-3.5" />
                  Chart {story.terms.length > 1 ? 'these terms' : 'this term'}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
