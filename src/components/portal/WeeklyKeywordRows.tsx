import Link from 'next/link'
import type { TermWeek } from '@/lib/portal/types'
import { MUTED } from './styles'

const GROUPS = [
  {
    lane: 'emerging',
    title: 'Breaking out',
    description:
      'Previously uncommon terms with a strong rise across several authors.',
  },
  {
    lane: 'rising',
    title: 'Big and rising',
    description: 'Established terms gaining the most share of conversation.',
  },
  {
    lane: 'falling',
    title: 'Cooling off',
    description:
      'Terms previously in the top 20 breakouts or risers, now losing share.',
  },
] as const

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
  const groups = dynamic
    ? GROUPS.map((group) => ({
        ...group,
        rows: weekly.filter((row) => row.lane === group.lane),
      }))
    : [
        {
          lane: 'tracked',
          title: 'Tracked terms',
          description: 'Terms from the original watchlist.',
          rows: weekly
            .filter((row) => row.last7 > 0)
            .sort((a, b) => b.last7 - a.last7)
            .slice(0, 6),
        },
      ]
  const max = Math.max(
    1,
    ...groups.flatMap((group) => group.rows.map((row) => row.last7)),
  )
  const until = weekly[0]?.untilDate
  const through =
    until &&
    new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${until}T00:00:00Z`))
  return (
    <div className="flex flex-1 flex-col px-4 pb-3 pt-2">
      <div
        className={`grid grid-cols-[minmax(0,1fr)_46px_minmax(35px,0.6fr)_68px] items-end gap-2 pb-1 text-[9px] uppercase tracking-wide ${MUTED}`}
      >
        <span>Term</span>
        <span className="text-right">Tweets</span>
        <span>Volume</span>
        <span
          className="text-right"
          title={
            dynamic
              ? 'Change in author-weighted share: each author contributes the square root of their posts mentioning the term. Compared with the previous complete week.'
              : undefined
          }
        >
          {dynamic ? 'Share change' : 'Change'}
        </span>
      </div>
      {groups.map((group) => (
        <section key={group.lane} aria-label={group.title} className="py-1.5">
          {dynamic && (
            <h3
              title={group.description}
              className={`mb-1 text-[10px] font-semibold ${MUTED}`}
            >
              {group.title}
            </h3>
          )}
          {group.rows.length === 0 ? (
            <p className={`py-1 text-[11px] ${MUTED}`}>
              No clear movers this week.
            </p>
          ) : (
            group.rows.map((row) => {
              const change =
                row.status === 'new'
                  ? 'New'
                  : row.deltaPct === null
                    ? '—'
                    : `${row.deltaPct >= 0 ? '+' : '−'}${Math.abs(row.deltaPct).toLocaleString('en-US')}%`
              const details = `${row.last7.toLocaleString('en-US')} tweets${row.currentAuthors === undefined ? '' : ` from ${row.currentAuthors} authors`}; ${row.prev7.toLocaleString('en-US')} tweets in the previous week. ${dynamic ? 'Percentage compares author-weighted shares, excluding retweets.' : ''}`
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
                  <span
                    className={`text-right text-[11px] tabular-nums ${MUTED}`}
                  >
                    {row.last7.toLocaleString('en-US')}
                  </span>
                  <div
                    role="img"
                    aria-label={`${row.term}: ${row.last7.toLocaleString('en-US')} tweets in the last seven days`}
                    title={`${row.last7.toLocaleString('en-US')} tweets; all bars use the same scale.`}
                    className="h-2 overflow-hidden rounded bg-zinc-100 dark:bg-[#26262a]"
                  >
                    <div
                      className="h-full rounded bg-chart-accent"
                      style={{ width: `${(row.last7 / max) * 100}%` }}
                    />
                  </div>
                  <span
                    title={details}
                    className={`text-right text-[11px] font-bold tabular-nums ${row.deltaPct !== null && row.deltaPct < 0 ? 'text-[#dc2626] dark:text-[#f87171]' : row.status === 'inactive' ? MUTED : 'text-[#16a34a] dark:text-[#2acf80]'}`}
                  >
                    {change}
                  </span>
                </div>
              )
            })
          )}
        </section>
      ))}
      <p className={`mt-auto pt-2 text-[10px] leading-relaxed ${MUTED}`}>
        {dynamic
          ? 'Author-weighted share vs the previous week; excludes retweets.'
          : 'Tweet counts vs the previous week.'}
        {through && <> Through {through} (UTC).</>}
      </p>
    </div>
  )
}
