'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { loadActivityPageAction } from './activityFeedActions'
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABELS,
  type ActivityFilters,
  type ActivityPage,
} from './activityTypes'

const emptyPage: ActivityPage = { events: [], nextCursor: null }
const defaultFilters: ActivityFilters = { kind: '', search: '' }
function formatDate(value: string | null) {
  if (!value) return 'Date unknown'
  return (
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value)) + ' UTC'
  )
}

export function AdminActivityFeed({
  initialPage,
  initialError = null,
}: {
  initialPage: ActivityPage | null
  initialError?: string | null
}) {
  const [page, setPage] = useState(initialPage ?? emptyPage)
  const [filters, setFilters] = useState(defaultFilters)
  const [draft, setDraft] = useState(defaultFilters)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(initialPage !== null)
  const busy = useRef(false)
  const retry = useRef<{ replace: boolean; filters: ActivityFilters }>({
    replace: true,
    filters: defaultFilters,
  })
  const scrollRoot = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const request = useCallback(
    async (replace: boolean, nextFilters = filters) => {
      if (busy.current || (!replace && !page.nextCursor)) return
      retry.current = { replace, filters: nextFilters }
      busy.current = true
      setLoading(true)
      setError(null)
      try {
        const result = await loadActivityPageAction({
          ...nextFilters,
          cursor: replace ? null : page.nextCursor,
        })
        setPage((previous) => {
          if (replace) return result
          const seen = new Set(previous.events.map((event) => event.id))
          return {
            ...result,
            events: [
              ...previous.events,
              ...result.events.filter((event) => !seen.has(event.id)),
            ],
          }
        })
        if (replace) {
          setFilters(nextFilters)
          if (scrollRoot.current) scrollRoot.current.scrollTop = 0
        }
        setLoaded(true)
      } catch {
        setError(
          'Activity could not be loaded. Your current list is unchanged. Please try again.',
        )
      } finally {
        busy.current = false
        setLoading(false)
      }
    },
    [filters, page.nextCursor],
  )

  useEffect(() => {
    if (
      !page.nextCursor ||
      loading ||
      error ||
      !sentinel.current ||
      !scrollRoot.current ||
      typeof IntersectionObserver === 'undefined'
    )
      return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void request(false)
      },
      { root: scrollRoot.current, rootMargin: '100px' },
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [page.nextCursor, loading, error, request])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archive activity</CardTitle>
        <CardDescription>
          Newest first. Filter or scroll for older entries. Current consent
          records can overlap historical logs; “Logged” is a report, not a
          verified deletion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          aria-label="Filter archive activity"
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void request(true, draft)
          }}
        >
          <label className="flex min-w-0 flex-1 basis-full flex-col gap-1 text-sm sm:basis-0">
            Account
            <Input
              value={draft.search}
              maxLength={64}
              placeholder="Username or account ID"
              onChange={(event) =>
                setDraft({ ...draft, search: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Event type
            <select
              className="h-10 rounded-md border border-input bg-background px-3"
              value={draft.kind}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  kind: event.target.value as ActivityFilters['kind'],
                })
              }
            >
              <option value="">All events</option>
              {ACTIVITY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ACTIVITY_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={loading}>
            Apply filters
          </Button>
        </form>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing{' '}
          {filters.kind
            ? ACTIVITY_LABELS[filters.kind].toLowerCase()
            : 'all events'}
          {filters.search ? ` matching “${filters.search}”` : ''} ·{' '}
          {page.events.length} loaded
        </p>
        {error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 text-sm text-destructive"
          >
            <p>{error}</p>
            <Button
              variant="outline"
              onClick={() =>
                void request(retry.current.replace, retry.current.filters)
              }
              disabled={loading}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <div
          ref={scrollRoot}
          tabIndex={0}
          role="region"
          aria-label="Archive activity list"
          aria-busy={loading}
          className="max-h-[32rem] overflow-y-auto overscroll-contain rounded-md border focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ol className="divide-y">
            {page.events.map((event) => (
              <li key={event.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium">
                    {event.username
                      ? `@${event.username}`
                      : event.account_id
                        ? `Account ${event.account_id}`
                        : 'Unknown account'}
                  </span>
                  <Badge variant="outline">{ACTIVITY_LABELS[event.kind]}</Badge>
                  <Badge
                    variant={
                      event.status === 'Failed' ? 'destructive' : 'secondary'
                    }
                  >
                    {event.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground sm:ml-auto">
                    {formatDate(event.occurred_at)} · {event.date_basis}
                  </span>
                </div>
                <p className="break-words text-sm">{event.detail}</p>
                {event.reason ? (
                  <p className="break-words text-sm text-muted-foreground">
                    {event.reason}
                  </p>
                ) : null}
                {event.error ? (
                  <p className="break-words text-sm text-destructive">
                    {event.error}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          {loaded && !page.events.length ? (
            <p className="p-4 text-sm text-muted-foreground">
              No matching activity records.
            </p>
          ) : null}
          <div ref={sentinel} className="flex justify-center p-4">
            {loading ? (
              <p role="status" className="text-sm">
                Loading activity…
              </p>
            ) : page.nextCursor ? (
              <Button variant="outline" onClick={() => void request(false)}>
                Load more
              </Button>
            ) : loaded ? (
              <p className="text-sm text-muted-foreground">
                All matching records loaded.
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
