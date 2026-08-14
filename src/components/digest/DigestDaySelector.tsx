import Link from 'next/link'
import type { DigestEdition } from '@/lib/digest/types'
import { CARD, MUTED } from '@/components/portal/styles'
import { DigestGenerationDayButton } from './DigestGenerationDayButton'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))

export function DigestDaySelector({
  currentDate,
  editions,
  variant = 'card',
  generation,
  navigation,
}: {
  currentDate: string
  editions: DigestEdition[]
  variant?: 'card' | 'editorial'
  generation?: {
    action: string | ((formData: FormData) => Promise<void>)
    dates: string[]
    promptVersionId: string
    runningRuns?: Array<{ date: string; id: string }>
  }
  navigation?: {
    previousHref?: string
    nextHref?: string
  }
}) {
  const editorial = variant === 'editorial'
  const [year, month] = currentDate.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday =
    (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const editionsByDate = new Map(
    editions.map((edition) => [edition.digestDate, edition]),
  )
  const generationDates = new Set(generation?.dates ?? [])
  const runningByDate = new Map(
    (generation?.runningRuns ?? []).map((run) => [run.date, run.id]),
  )
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

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
          Choose a day
        </h2>
        {navigation ? (
          <nav className="flex items-center gap-1" aria-label="Digest months">
            {navigation.previousHref ? (
              <Link
                href={navigation.previousHref}
                aria-label="Previous month"
                className="flex h-7 w-7 items-center justify-center rounded-md border text-sm text-muted-foreground transition hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-900"
              >
                ←
              </Link>
            ) : (
              <span className="h-7 w-7" aria-hidden="true" />
            )}
            <span
              className={`min-w-[112px] text-center ${editorial ? 'text-[12.5px]' : 'text-xs'} ${MUTED}`}
            >
              {monthLabel(year, month)}
            </span>
            {navigation.nextHref ? (
              <Link
                href={navigation.nextHref}
                aria-label="Next month"
                className="flex h-7 w-7 items-center justify-center rounded-md border text-sm text-muted-foreground transition hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-900"
              >
                →
              </Link>
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
      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday, index) => (
          <span
            key={`${weekday}-${index}`}
            className={`pb-1 text-[10px] font-semibold tracking-[0.08em] ${MUTED}`}
            aria-hidden="true"
          >
            {weekday}
          </span>
        ))}
        {cells.map((day, index) => {
          if (day === null)
            return <span key={`empty-${index}`} aria-hidden="true" />
          const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const edition = editionsByDate.get(date)
          const isCurrent = date === currentDate
          const runningRunId = runningByDate.get(date)
          if (runningRunId) {
            return (
              <Link
                key={date}
                href={`/admin/digest?run=${runningRunId}`}
                aria-label={`View running digest job for ${date}`}
                className="dark:bg-amber-950/35 flex aspect-square items-center justify-center rounded-[6px] border border-amber-300 bg-amber-50 text-[12.5px] font-semibold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800 dark:text-amber-100 dark:ring-amber-900"
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
                <DigestGenerationDayButton date={date} day={day} />
              </form>
            )
          }
          if (!edition) {
            return (
              <span
                key={date}
                className={`flex aspect-square items-center justify-center rounded-[6px] ${
                  editorial ? 'text-[12.5px]' : 'text-xs'
                } text-zinc-300 dark:text-zinc-700`}
              >
                {day}
              </span>
            )
          }
          return (
            <Link
              key={date}
              href={`/digest/${date}`}
              aria-label={`${date}${edition.isPreview ? ', preview edition' : ''}`}
              aria-current={isCurrent ? 'date' : undefined}
              className={`relative flex aspect-square items-center justify-center rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                editorial
                  ? `border text-[12.5px] ${
                      isCurrent
                        ? 'border-zinc-500 bg-zinc-100 font-bold text-zinc-950 dark:border-zinc-400 dark:bg-[#1b1b1e] dark:text-zinc-100'
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
              {edition.isPreview ? (
                <span
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${
                    isCurrent ? 'bg-blue-300 dark:bg-blue-700' : 'bg-brand'
                  }`}
                  aria-hidden="true"
                />
              ) : null}
            </Link>
          )
        })}
      </div>
      <p
        className={`${editorial ? 'mt-4 text-xs leading-[1.6]' : 'mt-3 text-[11px] leading-4'} ${MUTED}`}
      >
        {generation
          ? 'Blue days are ready to generate. Amber days are running and safe to leave.'
          : 'Available days have an edition. A dot marks preview data.'}
      </p>
    </section>
  )
}
