'use client'

import Link from 'next/link'
import { useState } from 'react'
import { captureProductAction } from '@/lib/productAnalytics'
import type { TrendStoryCard, TrendStoryDay } from '@/lib/trendStories/core'
import { CARD, MUTED, SERIF } from '../styles'

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

const change = (value: number | null) =>
  value === null ? 'new' : `${value > 0 ? '+' : ''}${Math.round(value)}%`

const changeTone = (value: number | null) =>
  value !== null && value < 0
    ? 'text-red-600 dark:text-red-400'
    : 'text-emerald-700 dark:text-emerald-400'

export const storyKey = (story: Pick<TrendStoryCard, 'trendDate' | 'slug'>) =>
  `${story.trendDate}/${story.slug}`

const row =
  'block w-full min-w-[210px] rounded-[6px] border px-3 py-2.5 text-left transition-colors xl:min-w-0'
const rowIdle =
  'border-transparent hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-[#2a2a2f] dark:hover:bg-[#1c1c1f]'
const rowActive =
  'border-zinc-300 bg-zinc-50 dark:border-[#3a3a40] dark:bg-[#1f1f23]'

function StoryRowBody({ story }: { story: TrendStoryCard }) {
  return (
    <>
      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        {story.changes.map((item) => (
          <span key={item.term} className="inline-flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold leading-tight text-foreground">
              {item.term}
            </span>
            <span
              className={`text-[11.5px] font-bold tabular-nums ${changeTone(item.changePct)}`}
            >
              {change(item.changePct)}
            </span>
          </span>
        ))}
      </span>
      <span
        className={`mt-1 line-clamp-2 text-[12.5px] leading-snug ${MUTED}`}
        style={SERIF}
      >
        {story.title}
      </span>
    </>
  )
}

/**
 * The AI-written daily trend stories as a picker beside the explorer. With
 * `onSelect`, a row focuses the chart and feed on that story; without it
 * (the signed-out view), a row opens the story page.
 */
export function TrendStoryRail({
  days,
  selected,
  onSelect,
  disabled,
}: {
  days: TrendStoryDay[]
  selected?: string | null
  onSelect?: (story: TrendStoryCard | null) => void
  disabled?: boolean
}) {
  const [index, setIndex] = useState(0)
  const day = days[index]
  if (!day) return null
  return (
    <section className={`${CARD} p-2.5`} aria-label="Daily trend stories">
      <div className="flex items-center justify-between gap-2 px-1.5 pb-2 pt-0.5">
        <h2 className="text-[15px] font-semibold" style={SERIF}>
          Trending
        </h2>
        {days.length > 1 ? (
          <select
            aria-label="Trending day"
            value={index}
            onChange={(event) => setIndex(Number(event.target.value))}
            className={`rounded-[4px] border border-zinc-300 bg-white px-1.5 py-1 text-[12px] font-semibold dark:border-[#34343a] dark:bg-[#121214] ${MUTED}`}
          >
            {days.map((item, itemIndex) => (
              <option key={item.date} value={itemIndex}>
                {dayLabel(item.date)}
              </option>
            ))}
          </select>
        ) : (
          <span className={`text-[12px] ${MUTED}`}>{dayLabel(day.date)}</span>
        )}
      </div>
      <ol className="flex gap-1.5 overflow-x-auto pb-1 xl:flex-col xl:gap-0.5 xl:overflow-visible xl:pb-0">
        {onSelect ? (
          <li>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={!selected}
              onClick={() => onSelect(null)}
              className={`${row} ${selected ? rowIdle : rowActive} disabled:cursor-wait`}
            >
              <span className="text-[14px] font-semibold text-foreground">
                All trending terms
              </span>
              <span className={`mt-0.5 block text-[12px] ${MUTED}`}>
                This week’s defaults, side by side
              </span>
            </button>
          </li>
        ) : null}
        {day.stories.map((story) => (
          <li key={story.slug}>
            {onSelect ? (
              <button
                type="button"
                disabled={disabled}
                aria-pressed={selected === storyKey(story)}
                onClick={() => onSelect(story)}
                className={`${row} ${selected === storyKey(story) ? rowActive : rowIdle} disabled:cursor-wait`}
              >
                <StoryRowBody story={story} />
              </button>
            ) : (
              <Link
                href={`/trending/${story.trendDate}/${story.slug}`}
                onClick={() =>
                  captureProductAction('trend_stories', 'topic_opened')
                }
                className={`${row} ${rowIdle}`}
              >
                <StoryRowBody story={story} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The selected story's headline and summary, above the chart. */
export function SelectedTrendStory({
  story,
  onClear,
}: {
  story: TrendStoryCard
  onClear: () => void
}) {
  const href = `/trending/${story.trendDate}/${story.slug}`
  return (
    <div className={`${CARD} mb-4 p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-4">
        <Link
          href={href}
          onClick={() => captureProductAction('trend_stories', 'topic_opened')}
          className="text-[22px] font-semibold leading-tight [text-wrap:pretty] hover:text-brand"
          style={SERIF}
        >
          {story.title}
        </Link>
        <button
          type="button"
          onClick={onClear}
          aria-label="Show all trending terms"
          className={`shrink-0 text-[18px] leading-none ${MUTED} hover:text-foreground`}
        >
          ×
        </button>
      </div>
      <p className={`mt-2 text-[13.5px] leading-[1.55] ${MUTED}`}>
        {story.tooltip}
      </p>
      <Link
        href={href}
        onClick={() => captureProductAction('trend_stories', 'topic_opened')}
        className="mt-2.5 inline-block text-[12.5px] font-semibold text-brand hover:underline"
      >
        Read the story →
      </Link>
    </div>
  )
}
