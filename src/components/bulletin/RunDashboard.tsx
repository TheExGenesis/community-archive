import Link from 'next/link'
import {
  formatTimestamp,
  runStatus,
  type RunDashboard as Dashboard,
} from '@/lib/bulletin/types'
import { RefreshButton } from './RefreshButton'

const number = (value: number | undefined) =>
  value === undefined ? '—' : value.toLocaleString('en-US')
const columns = [
  ['rows_seen', 'Tweets scanned'],
  ['eligible_originals', 'Eligible originals'],
  ['candidates_seen', 'Candidates'],
  ['calls', 'AI calls'],
  ['positive', 'Notices'],
  ['negative', 'Not notices'],
  ['failed', 'Failed'],
  ['pending', 'Left in queue'],
] as const

export function RunDashboard({
  data,
  olderThan,
}: {
  data: Dashboard
  olderThan?: string
}) {
  const runs = data.runs.slice(0, 25)
  const latest = runs[0]
  const hasOlder = data.runs.length > 25
  const stale =
    !data.last_success_at ||
    Date.now() - Date.parse(data.last_success_at) > 36 * 60 * 60 * 1000
  return (
    <div className="space-y-6">
      {data.preview_note && (
        <p className="rounded-lg border bg-muted p-4 text-sm">
          {data.preview_note}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Last fully successful run: {formatTimestamp(data.last_success_at)}
        </p>
        <RefreshButton />
      </div>
      {stale && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          {data.last_success_at
            ? 'No fully successful run in the last 36 hours.'
            : 'No fully successful run has been recorded yet.'}{' '}
          Check the run results and remaining queue below.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Waiting for first check', data.queue.pending],
          ['Awaiting retry', data.queue.retrying],
          ['Retries exhausted', data.queue.exhausted],
        ].map(([label, count]) => (
          <div key={label} className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {Number(count).toLocaleString('en-US')}
            </p>
          </div>
        ))}
      </div>
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-5">
          <h2 className="text-xl font-semibold">Run history</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {olderThan ? 'Older runs' : 'Most recent runs'} · Daily after
            successful autorefresh · Times in UTC
          </p>
        </div>
        {runs.length ? (
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Worker run results"
          >
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Started / result</th>
                  {columns.map(([key, label]) => (
                    <th key={key} className="px-4 py-3 text-right">
                      {label}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right">Cost (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="px-5 py-4">
                      <time className="font-medium" dateTime={run.started_at}>
                        {formatTimestamp(run.started_at)}
                      </time>
                      <p
                        className={`mt-1 text-xs ${run.status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
                      >
                        {runStatus(run)}
                      </p>
                      {run.prompt_version_id && run.prompt_body ? (
                        <details className="mt-2 max-w-md whitespace-normal text-xs">
                          <summary className="cursor-pointer text-brand">
                            Prompt version {run.prompt_version_id}
                          </summary>
                          <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded border p-3 font-mono leading-5">
                            {run.prompt_body}
                          </pre>
                        </details>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Prompt version not recorded
                        </p>
                      )}
                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">
                          Run #{run.id} details
                        </summary>
                        <dl className="mt-2 space-y-1">
                          <div>
                            <dt className="inline">Finished: </dt>
                            <dd className="inline">
                              {formatTimestamp(run.finished_at)}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Source / window: </dt>
                            <dd className="inline">
                              {run.counts.source || 'PostgreSQL (legacy)'} ·{' '}
                              {run.counts.window_start
                                ? formatTimestamp(run.counts.window_start)
                                : 'Not recorded'}{' '}
                              →{' '}
                              {run.counts.window_end
                                ? formatTimestamp(run.counts.window_end)
                                : 'Not recorded'}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Model: </dt>
                            <dd className="inline">{run.model}</dd>
                          </div>
                          <div>
                            <dt className="inline">Classifier: </dt>
                            <dd className="inline">{run.classifier_version}</dd>
                          </div>
                          <div>
                            <dt className="inline">
                              Suppressed before saving:{' '}
                            </dt>
                            <dd className="inline">
                              {number(run.counts.suppressed)}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Raw status: </dt>
                            <dd className="inline">{run.status}</dd>
                          </div>
                        </dl>
                      </details>
                    </td>
                    {columns.map(([key]) => (
                      <td
                        key={key}
                        className="px-4 py-4 text-right align-top tabular-nums"
                      >
                        {number(run.counts[key])}
                      </td>
                    ))}
                    <td className="px-5 py-4 text-right align-top tabular-nums">
                      ${run.actual_usd.toFixed(5)}
                      {run.unpriced_reserved_usd > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          + ${run.unpriced_reserved_usd.toFixed(5)} reserved
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <h3 className="font-semibold">No recorded runs yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Run history starts when the updated worker is installed. Earlier
              runs are not reconstructed.
            </p>
          </div>
        )}
        {(hasOlder || olderThan) && (
          <nav
            aria-label="Run history pages"
            className="flex justify-between border-t p-5"
          >
            <Link
              href="/admin/bulletin"
              className="text-sm text-brand hover:underline"
            >
              Latest runs
            </Link>
            {hasOlder && (
              <Link
                href={`/admin/bulletin?before=${runs[runs.length - 1].id}`}
                className="text-sm text-brand hover:underline"
              >
                Older runs →
              </Link>
            )}
          </nav>
        )}
      </section>
      <section className="space-y-3 text-sm leading-6 text-muted-foreground">
        <h2 className="font-semibold text-foreground">Reading the counts</h2>
        <p>
          <strong>Tweets scanned</strong> counts rows examined in this run. The
          one-hour overlap can scan a tweet again; it does not pay for another
          AI call when the text is unchanged. <strong>Candidates</strong> passed
          the original-post and phrase filters, including previously checked
          matches.
        </p>
        <p>
          <strong>AI calls</strong> includes retries and candidates left from
          earlier scans. <strong>Notices</strong> counts positive decisions
          saved during this run, before expiry and later consent changes. It is
          not the number currently visible on the website.{' '}
          <strong>Left in queue</strong> includes waiting, failed and exhausted
          decisions at the end of that run.
        </p>
        <p>
          Running and interrupted rows may have partial counts. Costs show
          reported charges plus reservations for requests whose final cost is
          unknown. Limits: $0.10/day, $1/calendar month, at most 50 calls per
          run. Failed decisions wait at least an hour and retry on a later run,
          up to three attempts.
        </p>
        {latest && (
          <p>
            Coverage: ClickHouse posts in the recorded UTC window. Daily scans
            cover the previous two days. Historical runs cover their explicit
            window. Previous PostgreSQL runs cover only that source. No
            historical backfill. Phrase filters and AI can miss notices.
          </p>
        )}
      </section>
    </div>
  )
}
