import Link from 'next/link'
import type { DigestTrendMovers as DigestTrendMoversData } from '@/lib/digest/trends'
import { buildSearchHref } from '@/lib/searchParams'

export function DigestTrendMovers({
  movers,
}: {
  movers: DigestTrendMoversData
}) {
  const rows = [
    movers.riser
      ? {
          label: 'Top riser',
          arrow: '↑',
          color: 'text-green-700 dark:text-green-400',
          row: movers.riser,
        }
      : null,
    movers.faller
      ? {
          label: 'Top faller',
          arrow: '↓',
          color: 'text-red-700 dark:text-red-400',
          row: movers.faller,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null)

  return (
    <section className="mt-10 border-t-2 border-zinc-800 py-5 dark:border-zinc-200">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          className="text-2xl font-semibold"
          style={{ fontFamily: 'Petrona, Georgia, serif' }}
        >
          Trending terms · 7 days
        </h2>
        <Link
          href="/trends"
          className="text-sm font-semibold text-brand hover:underline"
        >
          Explore →
        </Link>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 sm:gap-0">
        {rows.map(({ label, arrow, color, row }, index) => (
          <div
            key={row.term}
            className={
              index === 1
                ? 'sm:border-l sm:border-zinc-300 sm:pl-6 dark:sm:border-zinc-700'
                : rows.length === 2
                  ? 'sm:pr-6'
                  : ''
            }
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              {label}
            </p>
            <p className={`mt-1 text-[30px] font-bold leading-tight ${color}`}>
              {arrow} {row.deltaPct! > 0 ? '+' : '−'}
              {Math.abs(row.deltaPct!).toLocaleString('en-US')}%
            </p>
            <p className="mt-1 text-sm">
              <Link
                href={buildSearchHref(row.term)}
                className="font-semibold text-brand hover:underline"
              >
                {row.term}
              </Link>{' '}
              <span className="text-muted-foreground">
                · {row.last7.toLocaleString('en-US')} tweets
              </span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Share change versus the previous seven days.
      </p>
    </section>
  )
}
