import Link from 'next/link'
import type { DigestEdition } from '@/lib/digest/types'
import { CARD, MUTED } from '@/components/portal/styles'

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
}: {
  currentDate: string
  editions: DigestEdition[]
}) {
  const [year, month] = currentDate.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday =
    (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const editionsByDate = new Map(
    editions.map((edition) => [edition.digestDate, edition]),
  )
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  return (
    <section className={`${CARD} p-5`} aria-labelledby="digest-day-selector">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="digest-day-selector" className="font-semibold">
          Choose a day
        </h2>
        <span className={`text-xs ${MUTED}`}>{monthLabel(year, month)}</span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday, index) => (
          <span
            key={`${weekday}-${index}`}
            className={`pb-1 text-[10px] font-semibold ${MUTED}`}
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
          if (!edition) {
            return (
              <span
                key={date}
                className="flex aspect-square items-center justify-center rounded text-xs text-zinc-300 dark:text-zinc-700"
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
              className={`relative flex aspect-square items-center justify-center rounded text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                isCurrent
                  ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                  : 'bg-blue-50 text-brand hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/70'
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
      <p className={`mt-3 text-[11px] leading-4 ${MUTED}`}>
        Filled days have an edition. A dot marks preview data.
      </p>
    </section>
  )
}
