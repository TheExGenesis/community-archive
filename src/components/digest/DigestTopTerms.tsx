import Link from 'next/link'
import type { DigestTrendSnapshot } from '@/lib/digest/trends'
import { formatDigestShareChange } from '@/lib/digest/trends'
import { buildSearchHref } from '@/lib/searchParams'

export function DigestTopTerms({
  snapshot,
}: {
  snapshot: DigestTrendSnapshot
}) {
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
          Explore current trends →
        </Link>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 sm:gap-0">
        {snapshot.terms.map((row, index) => (
          <div
            key={row.term}
            className={
              index === 1
                ? 'sm:border-l sm:border-zinc-300 sm:pl-6 dark:sm:border-zinc-700'
                : snapshot.terms.length === 2
                  ? 'sm:pr-6'
                  : ''
            }
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              #{index + 1} by tweet volume
            </p>
            <p className="mt-1 text-[30px] font-bold leading-tight">
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
                  {' '}
                  · {formatDigestShareChange(row.changePct)} share
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {snapshot.sinceDate}–{snapshot.untilDate} UTC · Share change versus the
        previous seven days.
      </p>
    </section>
  )
}
