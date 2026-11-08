import type { WeeklyTrendSeries } from '@/lib/digest/weekly'

const W = 260
const H = 64
const PAD = 2

const average = (values: (number | null)[]) => {
  const known = values.filter((value): value is number => value !== null)
  return known.length
    ? known.reduce((sum, value) => sum + value, 0) / known.length
    : null
}

/**
 * One term's daily usage (per 100k archived tweets) over the week before and
 * the edition's week, with the edition's week shaded.
 */
export function WeeklyTrendChart({
  days,
  series,
  weekStart,
  color = 'hsl(var(--brand))',
}: {
  days: string[]
  series: WeeklyTrendSeries
  weekStart: string
  color?: string
}) {
  const weekIndex = Math.max(0, days.indexOf(weekStart))
  const values = series.per100k
  const max = Math.max(...values.map((value) => value ?? 0), 0.0001)
  const x = (index: number) =>
    PAD + (index / Math.max(1, days.length - 1)) * (W - PAD * 2)
  const y = (value: number) => H - PAD - (value / max) * (H - PAD * 2 - 6)
  const segments: string[] = []
  let current = ''
  values.forEach((value, index) => {
    if (value === null) {
      if (current) segments.push(current)
      current = ''
      return
    }
    current += `${current ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`
  })
  if (current) segments.push(current)

  const before = average(values.slice(0, weekIndex))
  const during = average(values.slice(weekIndex))
  const ratio = before && during !== null ? during / before : null
  const changeLabel =
    ratio === null
      ? null
      : ratio >= 5
        ? `×${Math.round(ratio)}`
        : `${ratio >= 1 ? '+' : '−'}${Math.abs(Math.round((ratio - 1) * 100))}%`
  const weekTweets = series.tweets
    .slice(weekIndex)
    .reduce((sum, count) => sum + count, 0)

  return (
    <figure className="space-y-1.5">
      <figcaption className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="truncate font-semibold text-foreground">
          {series.term}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {weekTweets.toLocaleString('en-US')} tweets
          {changeLabel ? ` · ${changeLabel}` : ''}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-16 w-full overflow-visible"
        role="img"
        aria-label={`Daily use of “${series.term}” over two weeks; ${weekTweets} tweets this week${
          changeLabel ? `, ${changeLabel} versus the week before` : ''
        }.`}
      >
        <rect
          x={x(weekIndex)}
          y={0}
          width={W - PAD - x(weekIndex)}
          height={H}
          className="fill-zinc-100 dark:fill-zinc-800/60"
          rx={3}
        />
        <line
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD}
          y2={H - PAD}
          className="stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth={1}
        />
        {segments.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            style={{ stroke: color }}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        <span>Week before</span>
        <span>This week</span>
      </div>
    </figure>
  )
}
