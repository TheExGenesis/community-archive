'use client'

import Link from 'next/link'
import { Info } from '@phosphor-icons/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { TermWeek } from '@/lib/portal/types'
import { MUTED } from './styles'

export function WeeklyKeywordRows({
  weekly,
  failed,
}: {
  weekly: TermWeek[]
  failed: boolean
}) {
  if (failed)
    return (
      <p role="status" className={`px-4 py-8 text-center text-[13px] ${MUTED}`}>
        Trending terms are temporarily unavailable.
      </p>
    )
  const dynamic = weekly.length === 0 || weekly.every((row) => row.lane)
  const weighted = weekly.every(
    (row) =>
      row.currentPer100k !== undefined && row.previousPer100k !== undefined,
  )
  const activity = (row: TermWeek) => ({
    current: weighted ? row.currentPer100k! : row.last7,
    previous: weighted ? row.previousPer100k! : row.prev7,
  })
  const rows = weekly
    .map((row) => ({ ...row, ...activity(row) }))
    .sort(
      (a, b) =>
        Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous) ||
        b.current - a.current ||
        a.term.localeCompare(b.term),
    )
    .slice(0, 6)
  const max = Math.max(1, ...rows.flatMap((row) => [row.current, row.previous]))
  const width = (value: number) => `${(value / max) * 100}%`
  const until = weekly[0]?.untilDate
  const through =
    until &&
    new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${until}T00:00:00Z`))
  const explanation = [
    dynamic
      ? 'Author-weighted share vs the previous week; excludes retweets.'
      : 'Tweet counts vs the previous week.',
    through ? `Through ${through} (UTC).` : '',
    `Ordered by the absolute change in ${weighted ? 'author-weighted share' : 'tweet count'}.`,
    `Bars show ${weighted ? 'author-weighted share per 100k' : 'tweet counts'} on a shared linear scale. A green overlay shows activity gained this week; a faded blue extension shows activity lost since the previous week.`,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="flex flex-1 flex-col px-4 pb-3 pt-2">
      <div
        className={`grid grid-cols-[minmax(0,1fr)_46px_minmax(35px,0.6fr)_68px] items-end gap-2 pb-2 text-[9px] uppercase tracking-wide ${MUTED}`}
      >
        <span className="inline-flex items-center gap-1">
          Term
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About trending terms"
                  className="inline-flex rounded hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                >
                  <Info aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-[300px] text-[12px] normal-case tracking-normal"
              >
                {explanation}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
        <span className="text-right">Tweets</span>
        <span>Volume</span>
        <span className="text-right">
          {dynamic ? 'Share change' : 'Change'}
        </span>
      </div>
      {rows.length === 0 && (
        <p className={`py-3 text-[11px] ${MUTED}`}>
          No clear movers this week.
        </p>
      )}
      {rows.map((row) => {
        const change =
          row.status === 'new'
            ? 'New'
            : row.deltaPct === null
              ? '—'
              : `${row.deltaPct >= 0 ? '+' : '−'}${Math.abs(row.deltaPct).toLocaleString('en-US')}%`
        const falling = row.previous > row.current
        const rising = row.current > row.previous
        const details = `${row.last7.toLocaleString('en-US')} tweets${row.currentAuthors === undefined ? '' : ` from ${row.currentAuthors} authors`}; ${row.prev7.toLocaleString('en-US')} tweets in the previous week.`
        const barDetails = `${row.term}: ${row.last7.toLocaleString('en-US')} tweets in the last seven days; ${weighted ? 'author-weighted share per 100k' : 'tweet count'} ${row.current.toLocaleString('en-US', { maximumFractionDigits: 1 })}, previously ${row.previous.toLocaleString('en-US', { maximumFractionDigits: 1 })}; linear scale${falling ? '; faded extension shows the previous week' : rising ? '; green overlay shows the gain since the previous week' : ''}`
        return (
          <div
            key={row.term}
            className="grid grid-cols-[minmax(0,1fr)_46px_minmax(35px,0.6fr)_68px] items-center gap-2 py-[5px]"
          >
            <Link
              href={`/search?${new URLSearchParams({
                q: row.term,
                ...(row.sinceDate ? { sinceDate: row.sinceDate } : {}),
                ...(row.untilDate ? { untilDate: row.untilDate } : {}),
              })}`}
              title={`Search tweets mentioning ${row.term}`}
              className="truncate text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
            >
              {row.term}
            </Link>
            <span className={`text-right text-[11px] tabular-nums ${MUTED}`}>
              {row.last7.toLocaleString('en-US')}
            </span>
            <div
              role="img"
              aria-label={barDetails}
              title={barDetails}
              className="relative h-2 overflow-hidden rounded bg-zinc-100 dark:bg-[#26262a]"
            >
              {falling && (
                <div
                  className="absolute inset-y-0 left-0 rounded bg-chart-accent opacity-25"
                  style={{ width: width(row.previous) }}
                />
              )}
              <div
                className="relative h-full rounded bg-chart-accent"
                style={{ width: width(row.current) }}
              />
              {rising && (
                <div
                  className="absolute inset-y-0 rounded-r bg-emerald-500/70 dark:bg-emerald-400/70"
                  style={{
                    left: width(row.previous),
                    width: width(row.current - row.previous),
                  }}
                />
              )}
            </div>
            <span
              title={details}
              className={`text-right text-[11px] font-bold tabular-nums ${row.deltaPct !== null && row.deltaPct < 0 ? 'text-[#dc2626] dark:text-[#f87171]' : row.status === 'inactive' ? MUTED : 'text-[#16a34a] dark:text-[#2acf80]'}`}
            >
              {change}
            </span>
          </div>
        )
      })}
    </div>
  )
}
