import Link from 'next/link'
import { requireBulletinAdmin } from '@/lib/bulletin/data'
import {
  DECISION_LABELS,
  decisionStatus,
  loadDecisions,
} from '@/lib/bulletin/decisions'
import { formatTimestamp } from '@/lib/bulletin/types'
import { DecisionTweet } from '@/components/bulletin/DecisionTweet'
import { decodeTweetText } from '@/lib/tweetText'
import { RefreshButton } from '@/components/bulletin/RefreshButton'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Bulletin decisions | CA admin',
  robots: { index: false, follow: false },
}
export default async function DecisionsPage({
  searchParams,
}: {
  searchParams?: { status?: string; before?: string }
}) {
  await requireBulletinAdmin()
  const status = decisionStatus(searchParams?.status)
  const data = await loadDecisions(status, searchParams?.before).catch(
    () => null,
  )
  return (
    <main className="mx-auto min-h-[70vh] max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        href="/admin/bulletin"
        className="text-sm text-brand hover:underline"
      >
        ← Bulletin admin
      </Link>
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">Tweet decisions</h1>
        <p>
          Inspect the latest saved outcome for each candidate. Accepted means
          the AI found a notice; rejected means it did not. Acceptance does not
          guarantee a notice is still active or visible on the board.
        </p>
        <p className="text-sm text-muted-foreground">
          Posts skipped by the candidate filters never reach this queue. This is
          current decision state, not an immutable per-run history. Private
          comparison experiments are not included.
        </p>
      </header>
      <nav aria-label="Decision filters" className="flex flex-wrap gap-2">
        {Object.entries(DECISION_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/bulletin/decisions?status=${key}`}
            aria-current={status === key ? 'page' : undefined}
            className={`rounded-full border px-4 py-2 text-sm ${status === key ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {!data ? (
        <div role="alert" className="space-y-3 rounded-lg border p-5">
          <p>
            Decisions could not be loaded. The decision-browser database
            migration must be installed.
          </p>
          <RefreshButton />
        </div>
      ) : (
        <>
          {!!data.hidden && (
            <p className="text-sm text-muted-foreground">
              {data.hidden} records omitted because their current source could
              not be verified. Deleted, changed or no-longer-permitted posts are
              not shown.
            </p>
          )}
          {!data.decisions.length && (
            <p className="rounded-lg border p-6">
              No available tweets on this page.
            </p>
          )}
          {data.decisions.map((row) => (
            <article
              key={row.tweet_id}
              className="space-y-4 rounded-lg border bg-card p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={`https://x.com/${encodeURIComponent(row.username)}/status/${row.tweet_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  @{row.username} ↗
                </a>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                  {row.status === 'failed' && row.attempts >= 3
                    ? 'Retries exhausted'
                    : DECISION_LABELS[row.status]}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words">
                {decodeTweetText(row.text)}
              </p>
              {row.summary && (
                <p className="text-sm">
                  <strong>AI notice:</strong> {row.summary}
                </p>
              )}
              {row.evidence && (
                <p className="text-sm text-muted-foreground">
                  <strong>Matched evidence:</strong> {row.evidence}
                </p>
              )}
              {row.status === 'negative' && (
                <p className="text-sm text-muted-foreground">
                  The AI returned “not a notice.” A detailed rejection reason
                  was not stored.
                </p>
              )}
              {row.status === 'pending' && (
                <p className="text-sm text-muted-foreground">
                  Waiting for classification. This can also be an unchanged post
                  queued for a requested recheck.
                </p>
              )}
              {row.status === 'failed' && (
                <p className="text-sm text-muted-foreground">
                  {row.attempts >= 3
                    ? 'Reached the automatic retry limit; no successful decision.'
                    : 'No successful decision yet; may be in progress or awaiting a retry.'}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Posted {formatTimestamp(row.posted_at)} · Updated{' '}
                {formatTimestamp(row.updated_at)} · {row.attempts} attempts ·
                Classifier {row.version}
              </p>
              <DecisionTweet id={row.tweet_id} />
            </article>
          ))}
          <nav aria-label="Decision pages" className="flex justify-between">
            {searchParams?.before ? (
              <Link
                href={`/admin/bulletin/decisions?status=${status}`}
                className="text-brand"
              >
                Latest decisions
              </Link>
            ) : (
              <span />
            )}
            {data.next && (
              <Link
                href={`/admin/bulletin/decisions?${new URLSearchParams({ status, before: data.next })}`}
                className="text-brand"
              >
                Older decisions →
              </Link>
            )}
          </nav>
        </>
      )}
    </main>
  )
}
