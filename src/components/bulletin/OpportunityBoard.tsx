'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTweetBatch } from './useTweetBatch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TweetCard } from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'
import { KIND_LABELS, type Opportunity } from '@/lib/bulletin/types'
import {
  isPast,
  relationship,
  sortNotices,
  type BulletinRelationships,
} from '@/lib/bulletin/board'

const EMPTY_GRAPH: BulletinRelationships = {
  outgoing: {},
  available: false,
}
function ScrollMore({
  count,
  side,
  onMore,
}: {
  count: number
  side: string
  onMore: () => void
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const callback = useRef(onMore)
  callback.current = onMore
  const [manual, setManual] = useState(false)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setManual(true)
      return
    }
    let fired = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired) {
          fired = true
          observer.disconnect()
          callback.current()
        }
      },
      { rootMargin: '600px' },
    )
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [count])
  return (
    <div
      ref={sentinel}
      aria-label={`Load more ${side}`}
      className="min-h-[1px]"
    >
      {manual ? (
        <Button variant="outline" onClick={onMore}>
          Load more {side}
        </Button>
      ) : (
        <span className="sr-only">More {side} load as you scroll</span>
      )}
    </div>
  )
}

function Original({
  notice,
  loadTweet,
}: {
  notice: Opportunity
  loadTweet: (id: string) => Promise<PortalTweet>
}) {
  const id = notice.tweet_id
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [tweet, setTweet] = useState<PortalTweet | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    setError(false)
    loadTweet(id)
      .then((tweet) => {
        if (!controller.signal.aborted) setTweet(tweet)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [id, visible, attempt, loadTweet])
  const displayTweet =
    tweet ||
    (typeof notice.preview_text === 'string'
      ? {
          id,
          accountId: notice.account_id,
          username: notice.username,
          name: notice.display_name || notice.username,
          avatar: notice.avatar_url || null,
          text: notice.preview_text,
          createdAt: notice.posted_at,
          observedAt: notice.posted_at,
          likes: 0,
          rts: 0,
        }
      : null)
  return (
    <div
      ref={container}
      className="relative min-w-0"
      aria-busy={!tweet && !error}
    >
      {displayTweet ? (
        <TweetCard
          tweet={displayTweet}
          showEngagement={!!tweet}
          previewHeight={240}
          clickable={false}
          showDate
          showExternalLink
          origin="opportunities"
          returnTo="/opportunities"
        />
      ) : error ? (
        <div role="alert" className="h-[240px] p-4 text-sm">
          The original could not be loaded.{' '}
          <button
            className="text-brand underline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      ) : (
        <div
          className="h-[240px] animate-pulse space-y-3 p-4"
          aria-label="Loading original tweet"
        >
          <div className="h-8 w-2/3 rounded bg-muted" />
          <div className="h-3 rounded bg-muted" />
          <div className="h-3 w-5/6 rounded bg-muted" />
        </div>
      )}
      {displayTweet && error && (
        <button
          className="absolute bottom-3 left-14 bg-card px-1 text-xs text-brand"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry post details
        </button>
      )}
    </div>
  )
}
export function OpportunityBoard({
  opportunities,
  me = '',
  username = '',
  graph = EMPTY_GRAPH,
  now = Date.now(),
}: {
  opportunities: Opportunity[]
  me?: string
  username?: string
  graph?: BulletinRelationships
  now?: number
}) {
  const loadTweet = useTweetBatch()
  const [pageSize, setPageSize] = useState({ offer: 6, ask: 6 })
  const [kind, setKind] = useState('all')
  const [search, setSearch] = useState('')
  const [past, setPast] = useState(false)
  const [recommended, setRecommended] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1))
    setKind(p.get('kind') || 'all')
    setPast(p.get('past') === '1')
    setRecommended(p.get('sort') !== 'newest')
    setHydrated(true)
  }, [])
  useEffect(() => {
    if (!hydrated) return
    const p = new URLSearchParams()
    if (kind !== 'all') p.set('kind', kind)
    if (past) p.set('past', '1')
    if (!recommended) p.set('sort', 'newest')
    window.history.replaceState(
      null,
      '',
      window.location.pathname +
        window.location.search +
        (p.toString() ? '#' + p.toString() : ''),
    )
  }, [kind, past, recommended, hydrated])
  const visible = useMemo(
    () =>
      sortNotices(
        opportunities.filter(
          (o) =>
            (past || !isPast(o, now)) &&
            (kind === 'all' || o.kind === kind) &&
            [o.summary, o.username, o.place, ...o.topics]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        ),
        recommended,
        me,
        graph,
        now,
      ),
    [opportunities, kind, past, search, recommended, me, graph, now],
  )
  useEffect(() => {
    setPageSize({ offer: 6, ask: 6 })
  }, [kind, search, past, recommended])
  const shown = (['offer', 'ask'] as const).reduce(
    (count, side) =>
      count +
      Math.min(pageSize[side], visible.filter((o) => o.side === side).length),
    0,
  )
  const own = opportunities.filter((o) => o.account_id === me)
  const answered = opportunities.filter(
    (o) => o.account_id !== me && o.reply_account_ids?.includes(me),
  ).length
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            aria-pressed={recommended}
            variant={recommended ? 'default' : 'outline'}
            onClick={() => setRecommended(true)}
          >
            Recommended
          </Button>
          <Button
            size="sm"
            aria-pressed={!recommended}
            variant={!recommended ? 'default' : 'outline'}
            onClick={() => setRecommended(false)}
          >
            Newest
          </Button>
          <Input
            className="h-9 min-w-[160px] flex-1 sm:max-w-xs"
            aria-label="Search opportunities"
            placeholder="Search topics, people, or places"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={past}
              onChange={(e) => setPast(e.target.checked)}
            />
            Show past notices
          </label>
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap"
          aria-label="Categories"
        >
          {Object.entries({ all: 'All categories', ...KIND_LABELS }).map(
            ([id, label]) => (
              <Button
                key={id}
                className="shrink-0"
                size="sm"
                variant={kind === id ? 'default' : 'outline'}
                aria-pressed={kind === id}
                onClick={() => setKind(id)}
              >
                {label}
                <span className="ml-1.5 opacity-60">
                  {
                    opportunities.filter(
                      (o) =>
                        (past || !isPast(o, now)) &&
                        (id === 'all' || o.kind === id),
                    ).length
                  }
                </span>
              </Button>
            ),
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <p role="status">
          {visible.length} of {opportunities.length} notices
          {shown < visible.length ? ` · ${shown} shown` : ''}
          {opportunities.length === 2000 ? ' · Latest 2,000 only' : ''}
        </p>
        <details>
          <summary className="cursor-pointer">
            {recommended ? 'About recommendations' : 'About sorting'}
            {me ? ' & your activity' : ''}
          </summary>
          <p className="mt-2 max-w-2xl">
            {recommended && graph.available
              ? 'Free things first, then opportunities, invitations, introductions, help, and feedback. Within each category: your notices, then your top outgoing interactions, then everyone else. This uses the profile’s top 25 all-time interaction counts (mentions, replies, quotes and reposts); missing people are not necessarily strangers.'
              : recommended
                ? 'Top outgoing interactions are unavailable. Showing categories in priority order, with your notices first within each category, then newest.'
                : 'Newest notices first.'}{' '}
            Past notices appear last.
          </p>
          {me && (
            <p className="my-2">
              <strong>{username ? '@' + username : 'Your activity'}</strong> ·{' '}
              {own.filter((o) => o.side === 'offer').length} offers ·{' '}
              {own.filter((o) => o.side === 'ask').length} asks ·{' '}
              {own.reduce((n, o) => n + (o.replies || 0) + (o.quotes || 0), 0)}{' '}
              public responses · Replied to {answered} other notices. Public
              archive activity within the loaded notices only.
            </p>
          )}
        </details>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {(['offer', 'ask'] as const).map((side) => (
          <section
            key={side}
            className="space-y-3"
            aria-label={side === 'offer' ? 'Offers' : 'Asks'}
          >
            <h2 className="flex items-center justify-between border-b pb-2 text-xl font-semibold">
              {side === 'offer' ? 'Offers' : 'Asks'}{' '}
              <span className="text-base text-muted-foreground">
                {visible.filter((o) => o.side === side).length}
              </span>
            </h2>
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {visible
                .filter((o) => o.side === side)
                .slice(0, pageSize[side])
                .map((o) => {
                  const rel = relationship(o, me, graph)
                  const expired = isPast(o, now)
                  return (
                    <article
                      key={o.tweet_id}
                      className={`min-w-0 overflow-hidden rounded-lg border bg-card ${expired ? 'opacity-60' : ''} ${rel.rank < 3 ? 'border-brand/40' : ''}`}
                    >
                      <Original notice={o} loadTweet={loadTweet} />
                      <div className="h-24 space-y-1 border-t px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] leading-4">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                            {KIND_LABELS[o.kind]}
                          </span>
                          {(rel.label || expired) && (
                            <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-right text-muted-foreground">
                              {rel.label}
                              {expired ? `${rel.label ? ' · ' : ''}Past` : ''}
                            </span>
                          )}
                        </div>
                        <p
                          className="line-clamp-3 text-xs leading-[18px] text-foreground/80"
                          title={o.summary}
                        >
                          {o.summary}
                        </p>
                      </div>
                    </article>
                  )
                })}
            </div>
            {visible.filter((o) => o.side === side).length > pageSize[side] && (
              <ScrollMore
                key={`${kind}:${search}:${past}:${recommended}`}
                side={side === 'offer' ? 'offers' : 'asks'}
                count={pageSize[side]}
                onMore={() =>
                  setPageSize((size) => ({ ...size, [side]: size[side] + 6 }))
                }
              />
            )}
            {!visible.some((o) => o.side === side) && (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No matching {side === 'offer' ? 'offers' : 'asks'}.
              </p>
            )}
          </section>
        ))}
      </div>
      <aside className="rounded-lg bg-muted/40 p-5 text-sm">
        <strong>Put a notice on the board</strong>
        <p className="mt-2 text-muted-foreground">
          Post an “offer:”, “ask:”, or “standing offer:” on X. Say what you’re
          offering or looking for and how to respond. Participating accounts are
          checked after the daily refresh. Quote your own notice to renew an
          undated notice when that quote reaches the archive.
        </p>
      </aside>
    </div>
  )
}
