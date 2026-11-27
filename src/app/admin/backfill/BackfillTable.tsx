'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { captureProductAction } from '@/lib/productAnalytics'
import {
  STATUS_FILTERS,
  filterRows,
  sortRows,
  type BackfillRow,
  type SearchProgress,
  type SortKey,
  type StatusFilter,
} from '@/lib/backfillProgress'
import { formatCount, formatUtc } from './format'

const PAGE = 200

const COLUMNS: Array<{
  key: SortKey | null
  label: string
  title?: string
  defaultDirection?: 'asc' | 'desc'
  className?: string
}> = [
  {
    key: 'rank',
    label: '#',
    title: 'Priority rank (followers × PageRank)',
    defaultDirection: 'asc',
    className: 'w-16',
  },
  { key: 'username', label: 'Member', defaultDirection: 'asc' },
  {
    key: 'completeness',
    label: 'Completeness',
    title: 'Tweets held in ClickHouse against the profile tweet count',
    defaultDirection: 'asc',
    className: 'min-w-[200px]',
  },
  { key: null, label: 'Recent history' },
  {
    key: 'monthly',
    label: 'Monthly search',
    title: 'Months searched out of planned',
    defaultDirection: 'asc',
    className: 'min-w-[220px]',
  },
  { key: null, label: 'Weekly' },
  { key: null, label: 'Nightly' },
  {
    key: 'requests',
    label: 'Requests',
    defaultDirection: 'desc',
    className: 'text-right',
  },
  {
    key: 'gained',
    label: 'Gained',
    title: 'New tweets these crawls added',
    defaultDirection: 'desc',
    className: 'text-right',
  },
  {
    key: 'lastActivity',
    label: 'Last backfill',
    title:
      'Last fetch or insert by a backfill crawl (the nightly has its own column)',
    defaultDirection: 'desc',
  },
]

const TYPE_LABEL: Record<BackfillRow['type'], string> = {
  archive: 'archive',
  opted_in: 'opted in',
  tracked: 'tracked',
}

const STATUS_LABEL: Record<string, string> = {
  done: 'done',
  pending: 'pending',
  not_targeted: 'not targeted',
  unresolved: 'unresolved',
  skipped: 'skipped',
  failed: 'failed',
  excluded_consent: 'excluded by consent',
  moved_to_monthly: 'moved to monthly',
}

const STATUS_TONE: Record<string, string> = {
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  excluded_consent:
    'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  unresolved: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

function StatusPill({
  status,
  title,
}: {
  status: string
  title?: string | null
}) {
  return (
    <span
      title={title ?? undefined}
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${
        STATUS_TONE[status] ?? 'bg-muted text-muted-foreground'
      }`}
    >
      {STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
    </span>
  )
}

function completenessTone(ratio: number) {
  if (ratio >= 0.9) return 'bg-emerald-500'
  if (ratio >= 0.5) return 'bg-amber-500'
  return 'bg-rose-500'
}

function CompletenessBar({ row }: { row: BackfillRow }) {
  if (row.completeness === null) {
    return (
      <span className="text-xs text-muted-foreground">
        {row.held === null ? 'held unknown' : 'no profile count'}
      </span>
    )
  }
  const pct = Math.round(row.completeness * 100)
  return (
    <div className="space-y-1">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={`${pct}% complete`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
      >
        <div
          className={`h-full ${completenessTone(row.completeness)}`}
          style={{ width: `${Math.min(100, row.completeness * 100)}%` }}
        />
      </div>
      <p className="text-[11px] tabular-nums text-muted-foreground">
        <span className="font-semibold text-foreground">{pct}%</span>{' '}
        {formatCount(row.held)} / {formatCount(row.profileTweets)}
      </p>
    </div>
  )
}

function SearchBar({ progress }: { progress: SearchProgress }) {
  const { planned, done, withTweets, failed } = progress
  if (!planned) return null
  const seg = (n: number) => `${(100 * n) / planned}%`
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      title={`${withTweets} with tweets, ${done - withTweets} empty, ${failed} failed, ${progress.pending ?? 0} pending`}
    >
      <div className="h-full bg-sky-600" style={{ width: seg(withTweets) }} />
      <div
        className="h-full bg-sky-300 dark:bg-sky-800"
        style={{ width: seg(done - withTweets) }}
      />
      <div className="h-full bg-rose-500" style={{ width: seg(failed) }} />
    </div>
  )
}

function SearchCell({ progress }: { progress: SearchProgress | null }) {
  if (!progress) return <span className="text-xs text-muted-foreground">—</span>
  const showPlan =
    progress.planned !== null && progress.status !== 'excluded_consent'
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={progress.status} title={progress.reason} />
        {progress.runner === 'new_members' ? (
          <span className="text-[11px] text-muted-foreground">
            new-member walk
          </span>
        ) : null}
      </div>
      {showPlan ? (
        <>
          <SearchBar progress={progress} />
          <p className="text-[11px] tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">
              {progress.done}/{progress.planned}
            </span>{' '}
            {progress.runner === 'weekly' ? 'weeks' : 'months'} ·{' '}
            {progress.withTweets} with tweets
            {progress.failed ? ` · ${progress.failed} failed` : ''}
            {progress.oldest ? ` · back to ${progress.oldest.slice(0, 7)}` : ''}
          </p>
        </>
      ) : null}
    </div>
  )
}

const CRAWL_SHORT: Array<[keyof BackfillRow['spend'], string]> = [
  ['recent', 'recent'],
  ['monthly', 'monthly'],
  ['new_members', 'new-member'],
  ['weekly', 'weekly'],
]

/** Per-crawl split under a total; recent-history requests are estimates. */
function SpendBreakdown({
  row,
  field,
}: {
  row: BackfillRow
  field: 'requests' | 'gained'
}) {
  const parts = CRAWL_SHORT.filter(([crawl]) => row.spend[crawl][field] > 0)
  if (parts.length < 2) {
    return parts.length === 1 ? (
      <div className="text-[11px] text-muted-foreground">
        {parts[0][1]}
        {field === 'requests' && parts[0][0] === 'recent' ? ' (est.)' : ''}
      </div>
    ) : null
  }
  return (
    <div className="space-y-0.5 text-[11px] text-muted-foreground">
      {parts.map(([crawl, label]) => (
        <div key={crawl} className="whitespace-nowrap">
          {label} {field === 'requests' && crawl === 'recent' ? '≈' : ''}
          {formatCount(row.spend[crawl][field])}
        </div>
      ))}
    </div>
  )
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: (typeof COLUMNS)[number]
  sort: { key: SortKey; direction: 'asc' | 'desc' }
  onSort: (key: SortKey) => void
}) {
  const active = column.key !== null && sort.key === column.key
  return (
    <th
      scope="col"
      title={column.title}
      aria-sort={
        active
          ? sort.direction === 'asc'
            ? 'ascending'
            : 'descending'
          : undefined
      }
      className={`whitespace-nowrap px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${column.className ?? ''}`}
    >
      {column.key ? (
        <button
          type="button"
          onClick={() => onSort(column.key as SortKey)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground ${active ? 'text-foreground' : ''}`}
        >
          {column.label}
          <span aria-hidden="true">
            {active ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
          </span>
        </button>
      ) : (
        column.label
      )}
    </th>
  )
}

export function BackfillTable({ rows }: { rows: BackfillRow[] }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<BackfillRow['type'] | 'all'>('all')
  const [statuses, setStatuses] = useState<Set<StatusFilter>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>(
    {
      key: 'rank',
      direction: 'asc',
    },
  )
  const [limit, setLimit] = useState(PAGE)
  const searched = useRef(false)

  const visible = useMemo(
    () =>
      sortRows(
        filterRows(rows, query, statuses, type),
        sort.key,
        sort.direction,
      ),
    [rows, query, statuses, type, sort],
  )

  const onSort = (key: SortKey) => {
    const column = COLUMNS.find((c) => c.key === key)
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: column?.defaultDirection ?? 'asc' },
    )
    setLimit(PAGE)
    captureProductAction('admin_backfill', 'sort_changed')
  }

  const toggleStatus = (id: StatusFilter) => {
    setStatuses((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setLimit(PAGE)
    captureProductAction('admin_backfill', 'filter_changed')
  }

  return (
    <section aria-label="Members" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setLimit(PAGE)
            if (!searched.current && event.target.value) {
              searched.current = true
              captureProductAction('admin_backfill', 'searched')
            }
          }}
          placeholder="Filter by username or account ID"
          aria-label="Filter by username or account ID"
          className="h-9 w-64 rounded-md border bg-background px-3 text-sm"
        />
        <select
          value={type}
          aria-label="Member type"
          onChange={(event) => {
            setType(event.target.value as BackfillRow['type'] | 'all')
            setLimit(PAGE)
            captureProductAction('admin_backfill', 'filter_changed')
          }}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="all">All member types</option>
          <option value="archive">Archive uploaders</option>
          <option value="opted_in">Opted in</option>
          <option value="tracked">Tracked by hand</option>
        </select>
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            aria-pressed={statuses.has(filter.id)}
            onClick={() => toggleStatus(filter.id)}
            className={`h-8 rounded-full border px-3 text-xs ${
              statuses.has(filter.id)
                ? 'border-foreground bg-foreground text-background'
                : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            {filter.label}
          </button>
        ))}
        <span
          className="ml-auto text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {formatCount(visible.length)} of {formatCount(rows.length)} members
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b">
              {COLUMNS.map((column) => (
                <SortHeader
                  key={column.label}
                  column={column}
                  sort={sort}
                  onSort={onSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, limit).map((row) => (
              <tr
                key={row.id}
                className="border-b align-top last:border-0 hover:bg-muted/40"
              >
                <td className="px-2 py-2 tabular-nums">
                  <div className="font-semibold">{row.rank ?? '—'}</div>
                  {row.score !== null ? (
                    <div className="text-[11px] text-muted-foreground">
                      {row.score.toFixed(3)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      unranked
                    </div>
                  )}
                </td>
                <td className="px-2 py-2">
                  <Link
                    href={`/user/${row.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    @{row.username ?? row.id}
                  </Link>
                  <div className="text-[11px] text-muted-foreground">
                    {TYPE_LABEL[row.type]} · {formatCount(row.followers)}{' '}
                    followers
                    {row.pagerank !== null
                      ? ` · PR ${row.pagerank.toFixed(1)}`
                      : ''}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <CompletenessBar row={row} />
                </td>
                <td className="px-2 py-2">
                  <StatusPill
                    status={row.recent.status}
                    title={row.recent.reason}
                  />
                </td>
                <td className="px-2 py-2">
                  <SearchCell progress={row.monthly} />
                </td>
                <td className="px-2 py-2">
                  <SearchCell progress={row.weekly} />
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-xs">
                  <div className="tabular-nums">
                    {formatUtc(row.nightly.lastRefreshAt) ?? 'never'}
                  </div>
                  {row.nightly.waiting ? (
                    <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                      full-timeline queue
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <div>{formatCount(row.requests)}</div>
                  <SpendBreakdown row={row} field="requests" />
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <div>{formatCount(row.gained)}</div>
                  <SpendBreakdown row={row} field="gained" />
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-muted-foreground">
                  {formatUtc(row.lastActivityAt) ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No member matches these filters.
          </p>
        ) : null}
      </div>
      {visible.length > limit ? (
        <button
          type="button"
          onClick={() => {
            setLimit((n) => n + PAGE)
            captureProductAction('admin_backfill', 'load_more')
          }}
          className="h-9 rounded-md border px-4 text-sm hover:bg-muted"
        >
          Show {Math.min(PAGE, visible.length - limit)} more
        </button>
      ) : null}
    </section>
  )
}
