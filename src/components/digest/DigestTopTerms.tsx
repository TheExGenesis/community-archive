import Link from 'next/link'
import type { DigestTrendSnapshot, DigestTrendTerm } from '@/lib/digest/trends'
import { digestTrendLabel, formatDigestShareChange } from '@/lib/digest/trends'
import { buildSearchHref } from '@/lib/searchParams'

function TrendTerm({
  row,
  compact,
}: {
  row: DigestTrendTerm
  compact: boolean
}) {
  const direction = Math.sign(row.changePct ?? 0)

  return (
    <div className="flex items-center gap-3">
      {direction !== 0 && (
        <span
          aria-hidden="true"
          className={`${compact ? 'text-[44px]' : 'text-[56px]'} shrink-0 font-bold leading-none ${direction > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
        >
          {direction > 0 ? '↑' : '↓'}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {digestTrendLabel(row.changePct)}
        </p>
        <p
          className={`${compact ? 'text-[23px]' : 'text-[30px]'} mt-1 font-bold leading-tight`}
        >
          {row.tweets.toLocaleString('en-US')}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            tweets
          </span>
        </p>
        <p className="mt-1 text-sm">
          <Link
            href={buildSearchHref(row.term)}
            className="font-semibold text-brand hover:underline"
          >
            {row.term}
          </Link>{' '}
          {row.changePct !== null && (
            <span className="text-muted-foreground">
              · {formatDigestShareChange(row.changePct)} share
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

export function DigestTopTerms({
  snapshot,
  variant = 'main',
}: {
  snapshot: DigestTrendSnapshot
  variant?: 'main' | 'sidebar'
}) {
  const compact = variant === 'sidebar'
  return (
    <section
      className={
        compact
          ? 'mt-8 border-t border-zinc-200 pt-7 dark:border-zinc-800'
          : 'mt-10 border-t-2 border-zinc-800 py-5 dark:border-zinc-200'
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          className={`${compact ? 'text-[19px]' : 'text-2xl'} font-semibold`}
          style={{ fontFamily: 'Petrona, Georgia, serif' }}
        >
          Trending terms · 7 days
        </h2>
        {!compact && (
          <Link
            href="/trends"
            className="text-sm font-semibold text-brand hover:underline"
          >
            Explore current trends →
          </Link>
        )}
      </div>
      <div
        className={
          compact ? 'mt-4 space-y-5' : 'mt-5 grid gap-5 sm:grid-cols-2 sm:gap-0'
        }
      >
        {snapshot.terms.map((row, index) => (
          <div
            key={row.term}
            className={
              compact
                ? ''
                : index === 1
                  ? 'sm:border-l sm:border-zinc-300 sm:pl-6 dark:sm:border-zinc-700'
                  : snapshot.terms.length === 2
                    ? 'sm:pr-6'
                    : ''
            }
          >
            <TrendTerm row={row} compact={compact} />
          </div>
        ))}
      </div>
      {compact ? (
        <Link
          href="/trends"
          className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline"
        >
          Explore current trends →
        </Link>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {snapshot.sinceDate}–{snapshot.untilDate} UTC · Share change versus
          the previous seven days.
        </p>
      )}
    </section>
  )
}
