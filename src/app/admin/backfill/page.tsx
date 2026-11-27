import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { BackfillSummary, CrawlTally } from '@/lib/backfillProgress'
import {
  loadBackfillProgress,
  requireBackfillAdmin,
} from '@/lib/backfillProgressData'
import { BackfillTable } from './BackfillTable'
import { formatCount, formatPercent, formatUtc } from './format'

// Admin only: rendered per request after the admin check, never cached.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Backfill progress | CA admin',
  robots: { index: false, follow: false },
}

function Tile({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-1 space-y-1 text-sm">{children}</div>
      {footer ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{footer}</p>
      ) : null}
    </div>
  )
}

function Bar({ ratio, tone }: { ratio: number | null; tone: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full ${tone}`}
        style={{ width: `${Math.min(100, Math.max(0, (ratio ?? 0) * 100))}%` }}
      />
    </div>
  )
}

function statusLine(tally: CrawlTally | undefined) {
  if (!tally) return '—'
  const done = tally.by_status.done ?? 0
  const pending = tally.by_status.pending ?? 0
  return `${formatCount(done)} done · ${formatCount(pending)} pending`
}

function CrawlTile({
  title,
  tally,
  extra,
}: {
  title: string
  tally: CrawlTally | undefined
  extra?: ReactNode
}) {
  const done = tally?.by_status.done ?? 0
  return (
    <Tile
      title={title}
      footer={
        tally
          ? `${formatCount(tally.requests)} requests · ${formatCount(tally.tweets_gained)} tweets gained`
          : null
      }
    >
      <p className="font-semibold tabular-nums">{statusLine(tally)}</p>
      <Bar
        ratio={tally?.accounts ? done / tally.accounts : null}
        tone="bg-sky-600"
      />
      {extra}
    </Tile>
  )
}

function SummaryStrip({ summary }: { summary: BackfillSummary }) {
  const { crawls, quota } = summary
  const quotaRatio =
    quota.limit && quota.remaining !== null
      ? quota.remaining / quota.limit
      : null
  const weeklyMoved = crawls.weekly?.by_status.moved_to_monthly ?? 0
  return (
    <section
      aria-label="Summary"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
    >
      <Tile
        title="Overall completeness"
        footer={`${formatCount(summary.under50)} members under 50%`}
      >
        <p className="text-xl font-semibold tabular-nums">
          {formatPercent(summary.completeness)}
        </p>
        <Bar ratio={summary.completeness} tone="bg-emerald-500" />
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {formatCount(summary.held)} held /{' '}
          {formatCount(summary.profileTweets)} on profiles
        </p>
      </Tile>
      <Tile
        title="Request quota"
        footer={`Resets ${formatUtc(quota.reset_at) ?? '—'} UTC · guard ${quota.guard_state ?? '—'}`}
      >
        <p className="text-xl font-semibold tabular-nums">
          {formatCount(quota.remaining)}
          <span className="text-sm font-normal text-muted-foreground">
            {' '}
            / {formatCount(quota.limit)} left
          </span>
        </p>
        <Bar ratio={quotaRatio} tone="bg-violet-500" />
        <p className="text-[11px] tabular-nums text-muted-foreground">
          Backfill budget {formatCount(quota.backfill_allowed)} · nightly
          reserve {formatCount(quota.nightly_reserve)}
        </p>
      </Tile>
      <CrawlTile title="Recent history" tally={crawls.recent} />
      <CrawlTile
        title="Monthly search"
        tally={crawls.monthly}
        extra={
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {formatCount(crawls.monthly?.months_remaining)} months left · ETA{' '}
            {formatUtc(crawls.monthly?.eta_at) ?? '—'}
          </p>
        }
      />
      <CrawlTile title="New-member search" tally={crawls.new_members} />
      <CrawlTile
        title="Weekly search (test)"
        tally={crawls.weekly}
        extra={
          <p className="text-[11px] text-muted-foreground">
            {formatCount(weeklyMoved)} moved to monthly
          </p>
        }
      />
      <Tile
        title="Nightly refresh"
        footer="03:00 UTC: new tweets since each account's last refresh"
      >
        <p className="font-semibold tabular-nums">
          {formatCount(crawls.nightly?.accounts_refreshed)} refreshed
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {formatCount(crawls.nightly?.waiting_full_timeline)} wait for a full
          timeline
        </p>
      </Tile>
    </section>
  )
}

export default async function BackfillProgressPage() {
  await requireBackfillAdmin()
  let view: Awaited<ReturnType<typeof loadBackfillProgress>> | null = null
  try {
    view = await loadBackfillProgress()
  } catch (error) {
    console.error('[admin backfill] snapshot unavailable:', error)
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1700px] space-y-6 px-4 py-8 sm:px-8">
      <header>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          ← Admin
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Private admin
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Backfill progress
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          How complete each member&apos;s tweets are, and where each crawl
          stands. Ordered by priority: followers × PageRank over the member tie
          graph. Opted-out accounts are never listed.
        </p>
        {view ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Crawl snapshot {formatUtc(view.summary.generatedAt)} UTC · tweets
            held{' '}
            {view.summary.countsGeneratedAt
              ? `${formatUtc(view.summary.countsGeneratedAt)} UTC`
              : 'unavailable'}{' '}
            · ranking {formatUtc(view.summary.rankingGeneratedAt) ?? '—'} UTC ·{' '}
            {formatCount(view.summary.accounts)} members
            {view.summary.withoutAccountId
              ? `, ${view.summary.withoutAccountId} without an account ID not listed`
              : ''}
          </p>
        ) : null}
      </header>
      {view ? (
        <>
          {view.summary.countsGeneratedAt ? null : (
            <p role="alert" className="rounded-lg border p-3 text-sm">
              Tweets held could not be loaded from the query gateway, so
              completeness is unknown. The crawl columns are current.
            </p>
          )}
          <SummaryStrip summary={view.summary} />
          <BackfillTable rows={view.rows} />
        </>
      ) : (
        <p role="alert" className="rounded-lg border p-5">
          The backfill snapshot could not be loaded. It is written every 30
          minutes by ca-backfill-progress-snapshot on ca-autorefresh; check that
          timer, then refresh.
        </p>
      )}
    </main>
  )
}
