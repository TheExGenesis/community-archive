'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { DigestCalendarDay, DigestEdition } from '@/lib/digest/types'
import { CARD, MUTED } from '@/components/portal/styles'
import { DigestGenerationDayButton } from './DigestGenerationDayButton'
import { capturePostHogEvent } from '@/lib/posthog'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const weekOfLabel = (monday: string) =>
  `Week of ${new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${monday}T12:00:00Z`))}`

const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))

export function DigestDaySelector({
  currentDate,
  editions = [],
  availableDays = [],
  variant = 'card',
  generation,
  week,
  weekLinks,
  title = 'Choose a day',
}: {
  /** The open edition's day, or a day in `week` that picks the first month. */
  currentDate: string
  /** Tint a week's days instead of marking `currentDate` as the open day. */
  week?: { start: string; end: string }
  /**
   * Add a trailing "→" per week row that opens that week's weekly edition.
   * `weeks` are the Mondays that have one (published or in progress); other
   * rows get no arrow. The `week` row is tinted and its arrow is not a link.
   */
  weekLinks?: { weeks: string[] }
  title?: string
  editions?: DigestEdition[]
  availableDays?: DigestCalendarDay[]
  variant?: 'card' | 'editorial'
  generation?: {
    action: string | ((formData: FormData) => Promise<void>)
    dates: string[]
    promptVersionId: string
    targetCommunityUsersOnly?: boolean
    runningRuns?: Array<{ date: string; id: string }>
  }
}) {
  const editorial = variant === 'editorial'
  const calendarDays = [
    ...availableDays,
    ...editions.map(({ digestDate, isPreview }) => ({
      digestDate,
      isPreview,
    })),
  ]
  const availableMonths = Array.from(
    new Set([
      ...calendarDays.map(({ digestDate }) => digestDate.slice(0, 7)),
      ...(generation?.dates ?? []).map((date) => date.slice(0, 7)),
    ]),
  ).sort()
  const initialMonth = currentDate.slice(0, 7)
  const [visibleMonth, setVisibleMonth] = useState(initialMonth)
  const [targetCommunityUsersOnly, setTargetCommunityUsersOnly] = useState(
    generation?.targetCommunityUsersOnly ?? true,
  )
  const [year, month] = visibleMonth.split('-').map(Number)
  const firstMonth = availableMonths[0] ?? initialMonth
  const lastMonth = availableMonths.at(-1) ?? initialMonth
  const shiftVisibleMonth = (offset: number) => {
    const shifted = new Date(Date.UTC(year, month - 1 + offset, 1))
    setVisibleMonth(
      `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`,
    )
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday =
    (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const daysByDate = new Map(calendarDays.map((day) => [day.digestDate, day]))
  const generationDates = new Set(generation?.dates ?? [])
  const runningByDate = new Map(
    (generation?.runningRuns ?? []).map((run) => [run.date, run.id]),
  )
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  const rows = Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) =>
    cells.slice(row * 7, row * 7 + 7),
  )
  const linkedWeeks = new Set(weekLinks?.weeks ?? [])
  /** Monday (`YYYY-MM-DD`) of a row of the visible month, possibly in the month before. */
  const rowMonday = (row: number) =>
    new Date(Date.UTC(year, month - 1, 1 - firstWeekday + row * 7))
      .toISOString()
      .slice(0, 10)
  const rowGrid = weekLinks
    ? 'grid grid-cols-[repeat(7,minmax(0,1fr))_14px] gap-1'
    : 'grid grid-cols-7 gap-1'

  const renderDay = (day: number | null, index: number, rowTinted: boolean) => {
    if (day === null) return <span key={`empty-${index}`} aria-hidden="true" />
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const availableDay = daysByDate.get(date)
    const isCurrent = !week && date === currentDate
    const inWeek = Boolean(week && date >= week.start && date <= week.end)
    // A tinted row already marks the week; its days drop their own tint.
    const dayTint = inWeek && !rowTinted
    const runningRunId = runningByDate.get(date)
    if (runningRunId) {
      return (
        <Link
          key={date}
          href={`/admin/digest?run=${runningRunId}`}
          aria-label={`View running digest job for ${date}`}
          className="flex aspect-square items-center justify-center rounded-[6px] border border-amber-300 bg-amber-50 text-[12.5px] font-semibold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100 dark:ring-amber-900"
        >
          <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          {day}
        </Link>
      )
    }
    if (generation && generationDates.has(date)) {
      return (
        <form key={date} action={generation.action}>
          <input
            type="hidden"
            name="prompt_version_id"
            value={generation.promptVersionId}
          />
          <input type="hidden" name="digest_date" value={date} />
          <input
            type="hidden"
            name="target_ca_users_only"
            value={String(targetCommunityUsersOnly)}
          />
          <DigestGenerationDayButton date={date} day={day} />
        </form>
      )
    }
    if (!availableDay) {
      return (
        <span
          key={date}
          className={`flex aspect-square items-center justify-center rounded-[6px] ${
            editorial ? 'text-[12.5px]' : 'text-xs'
          } text-zinc-300 dark:text-zinc-700 ${
            dayTint ? 'bg-zinc-50 dark:bg-zinc-900/60' : ''
          }`}
        >
          {day}
        </span>
      )
    }
    return (
      <Link
        key={date}
        href={`/digest/${date}`}
        onClick={() =>
          capturePostHogEvent('digest_action', {
            action: 'edition_selected',
            surface: 'calendar',
          })
        }
        aria-label={`${date}${availableDay.isPreview ? ', preview edition' : ''}`}
        aria-current={isCurrent ? 'date' : undefined}
        className={`relative flex aspect-square items-center justify-center rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          editorial
            ? `border text-[12.5px] ${
                isCurrent
                  ? 'border-zinc-500 bg-zinc-100 font-bold text-zinc-950 dark:border-zinc-400 dark:bg-[#1b1b1e] dark:text-zinc-100'
                  : inWeek
                    ? `border-transparent font-semibold text-brand hover:bg-blue-100 dark:hover:bg-blue-950/70 ${
                        dayTint ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                      }`
                    : 'border-transparent font-normal text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-[#1b1b1e]'
              }`
            : `text-xs font-semibold ${
                isCurrent
                  ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                  : 'bg-blue-50 text-brand hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/70'
              }`
        }`}
      >
        {day}
        {availableDay.isPreview ? (
          <span
            className={`absolute bottom-1 h-1 w-1 rounded-full ${
              isCurrent ? 'bg-blue-300 dark:bg-blue-700' : 'bg-brand'
            }`}
            aria-hidden="true"
          />
        ) : null}
      </Link>
    )
  }

  return (
    <section
      className={editorial ? '' : `${CARD} p-5`}
      aria-labelledby="digest-day-selector"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="digest-day-selector"
          className={
            editorial
              ? 'text-[19px] font-semibold [font-family:var(--font-petrona)]'
              : 'font-semibold'
          }
        >
          {title}
        </h2>
        {availableMonths.length > 1 ? (
          <nav className="flex items-center gap-1" aria-label="Digest months">
            {visibleMonth > firstMonth ? (
              <button
                type="button"
                onClick={() => shiftVisibleMonth(-1)}
                aria-label="Previous month"
                className="flex h-7 w-7 items-center justify-center rounded-md border text-sm text-muted-foreground transition hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-900"
              >
                ←
              </button>
            ) : (
              <span className="h-7 w-7" aria-hidden="true" />
            )}
            <span
              className={`min-w-[112px] text-center ${editorial ? 'text-[12.5px]' : 'text-xs'} ${MUTED}`}
            >
              {monthLabel(year, month)}
            </span>
            {visibleMonth < lastMonth ? (
              <button
                type="button"
                onClick={() => shiftVisibleMonth(1)}
                aria-label="Next month"
                className="flex h-7 w-7 items-center justify-center rounded-md border text-sm text-muted-foreground transition hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-900"
              >
                →
              </button>
            ) : (
              <span className="h-7 w-7" aria-hidden="true" />
            )}
          </nav>
        ) : (
          <span
            className={`${editorial ? 'text-[12.5px]' : 'text-xs'} ${MUTED}`}
          >
            {monthLabel(year, month)}
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-1 text-center">
        <div className={rowGrid}>
          {WEEKDAYS.map((weekday, index) => (
            <span
              key={`${weekday}-${index}`}
              className={`pb-1 text-[10px] font-semibold tracking-[0.08em] ${MUTED}`}
              aria-hidden="true"
            >
              {weekday}
            </span>
          ))}
          {weekLinks ? <span aria-hidden="true" /> : null}
        </div>
        {rows.map((rowCells, row) => {
          const monday = rowMonday(row)
          const isViewedWeek = Boolean(weekLinks && week?.start === monday)
          const weekLabel = weekOfLabel(monday)
          return (
            <div
              key={monday}
              className={`${rowGrid} ${
                weekLinks
                  ? `rounded-[6px] transition-colors has-[.week-link:focus-visible]:bg-blue-50 has-[.week-link:hover]:bg-blue-50 dark:has-[.week-link:focus-visible]:bg-blue-950/40 dark:has-[.week-link:hover]:bg-blue-950/40 ${
                      isViewedWeek ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                    }`
                  : ''
              }`}
            >
              {rowCells.map((day, index) =>
                renderDay(day, index, isViewedWeek),
              )}
              {weekLinks ? (
                isViewedWeek ? (
                  <span
                    role="img"
                    aria-label={`${weekLabel}, this page`}
                    title={`${weekLabel} (this page)`}
                    className="flex items-center justify-center text-[12.5px] text-brand opacity-60"
                  >
                    →
                  </span>
                ) : linkedWeeks.has(monday) ? (
                  <Link
                    href={`/digest/week/${monday}`}
                    aria-label={weekLabel}
                    title={weekLabel}
                    onClick={() =>
                      capturePostHogEvent('digest_action', {
                        action: 'week_selected',
                        surface: 'calendar',
                      })
                    }
                    className={`week-link flex items-center justify-center rounded-[4px] text-[12.5px] ${MUTED} hover:text-brand focus-visible:text-brand focus-visible:outline-none`}
                  >
                    →
                  </Link>
                ) : (
                  <span aria-hidden="true" />
                )
              ) : null}
            </div>
          )
        })}
      </div>
      {generation ? (
        <label className={`mt-4 flex items-start gap-2 text-xs ${MUTED}`}>
          <input
            type="checkbox"
            checked={targetCommunityUsersOnly}
            onChange={(event) =>
              setTargetCommunityUsersOnly(event.currentTarget.checked)
            }
            className="mt-0.5 h-4 w-4 rounded border-zinc-300"
          />
          Only include posts authored by Community Archive members
        </label>
      ) : null}
      <p
        className={`${editorial ? 'mt-4 text-xs leading-[1.6]' : 'mt-3 text-[11px] leading-4'} ${MUTED}`}
      >
        {generation
          ? 'Blue days are ready to generate. Amber days are running and safe to leave.'
          : week
            ? weekLinks
              ? "Open any day's edition; → opens the week. This week's days are tinted."
              : "Open any day's edition. This week's days are tinted."
            : weekLinks
              ? "Open any day's edition; → opens the week."
              : 'Available days have an edition. A dot marks preview data.'}
      </p>
    </section>
  )
}
