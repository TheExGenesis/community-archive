import Link from 'next/link'
import type { DigestTrendSnapshot, DigestTrendTerm } from '@/lib/digest/trends'
import { digestTrendLabel, formatDigestShareChange } from '@/lib/digest/trends'
import { buildSearchHref } from '@/lib/searchParams'

function TrendTerm({ row }: { row: DigestTrendTerm }) {
  const direction = Math.sign(row.changePct ?? 0)

  return (
    <div className="flex items-center gap-3">
      {direction !== 0 && (
        <span
          aria-hidden="true"
          className={`shrink-0 text-[44px] font-bold leading-none ${direction > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
        >
          {direction > 0 ? '↑' : '↓'}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {digestTrendLabel(row.changePct)}
        </p>
        <p className="mt-1 text-[23px] font-bold leading-tight">
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
}: {
  snapshot: DigestTrendSnapshot
}) {
  return (
    <section className="mt-8 border-t border-zinc-200 pt-7 dark:border-zinc-800">
      <h2
        className="text-[19px] font-semibold"
        style={{ fontFamily: 'Petrona, Georgia, serif' }}
      >
        Trending terms · 7 days
      </h2>
      <div className="mt-4 space-y-5">
        {snapshot.terms.map((row) => (
          <TrendTerm key={row.term} row={row} />
        ))}
      </div>
      <Link
        href="/trends"
        className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline"
      >
        Explore current trends →
      </Link>
    </section>
  )
}
