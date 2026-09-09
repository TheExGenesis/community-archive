'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TweetCard } from '@/components/TweetCard'
import { TweetAvatar } from '@/components/portal/TweetRow'
import type { PortalTweet } from '@/lib/portal/types'
import {
  KIND_LABELS,
  RESPONSE_LABELS,
  formatDate,
  type Opportunity,
} from '@/lib/bulletin/types'
import {
  expiry,
  isPast,
  relationship,
  sortNotices,
  type BulletinRelationships,
} from '@/lib/bulletin/board'
import { tweetPermalinkHref, userProfileHref } from '@/lib/navigation'

const EMPTY_GRAPH: BulletinRelationships = {
  following: [],
  followers: [],
  available: false,
}
function Original({ id }: { id: string }) {
  const [tweet, setTweet] = useState<PortalTweet | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/bulletin/tweet/${id}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(setTweet)
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [id])
  if (error)
    return (
      <p role="alert" className="text-sm">
        The original could not be loaded. Close and reopen to retry.
      </p>
    )
  return tweet ? (
    <TweetCard
      tweet={tweet}
      noClamp
      clickable={false}
      showDate
      showExternalLink
      origin="opportunities"
      returnTo="/opportunities"
    />
  ) : (
    <p role="status" className="text-sm">
      Loading original…
    </p>
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
  const [kind, setKind] = useState('all')
  const [search, setSearch] = useState('')
  const [past, setPast] = useState(false)
  const [recommended, setRecommended] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
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
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Element && !event.target.closest('article'))
        setOpen(null)
    }
    document.addEventListener('click', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('keydown', escape)
      document.removeEventListener('click', outside)
    }
  }, [])
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
  const own = opportunities.filter((o) => o.account_id === me)
  const answered = opportunities.filter(
    (o) => o.account_id !== me && o.reply_account_ids?.includes(me),
  ).length
  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            aria-pressed={recommended}
            variant={recommended ? 'default' : 'outline'}
            onClick={() => setRecommended(true)}
          >
            Recommended
          </Button>
          <Button
            aria-pressed={!recommended}
            variant={!recommended ? 'default' : 'outline'}
            onClick={() => setRecommended(false)}
          >
            Newest
          </Button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={past}
              onChange={(e) => setPast(e.target.checked)}
            />
            Show past notices
          </label>
        </div>
        <Input
          aria-label="Search opportunities"
          placeholder="Search topics, people, or places"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2" aria-label="Categories">
          {Object.entries({ all: 'All categories', ...KIND_LABELS }).map(
            ([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={kind === id ? 'default' : 'outline'}
                aria-pressed={kind === id}
                onClick={() => setKind(id)}
              >
                {label}{' '}
                <span className="opacity-60">
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
        <p className="text-xs text-muted-foreground">
          {recommended && graph.available
            ? 'Your notices, then mutuals, people you follow or who follow you, then everyone else. Newest first within each group.'
            : recommended
              ? 'Follow relationships are unavailable; showing your notices first, then newest.'
              : 'Newest notices first.'}{' '}
          Past notices appear last.
        </p>
      </div>
      {me && (
        <aside className="rounded-lg border p-4 text-sm">
          <strong>{username ? '@' + username : 'Your activity'}</strong> ·{' '}
          {own.filter((o) => o.side === 'offer').length} offers ·{' '}
          {own.filter((o) => o.side === 'ask').length} asks ·{' '}
          {own.reduce((n, o) => n + (o.replies || 0) + (o.quotes || 0), 0)}{' '}
          public responses · Replied to {answered} other notices
          <p className="mt-1 text-xs text-muted-foreground">
            Within the notices loaded here. Public archive replies and quotes
            only; private messages and outcomes are unknown.
          </p>
        </aside>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {visible.length} of {opportunities.length} notices
        {opportunities.length === 2000 ? ' · Latest 2,000 only' : ''}
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {(['offer', 'ask'] as const).map((side) => (
          <section
            key={side}
            className="space-y-3"
            aria-label={side === 'offer' ? 'Offers' : 'Asks'}
          >
            <h2 className="flex items-center justify-between border-b pb-3 text-2xl font-semibold">
              {side === 'offer' ? 'Offers' : 'Asks'}{' '}
              <span className="text-base text-muted-foreground">
                {visible.filter((o) => o.side === side).length}
              </span>
            </h2>
            {visible
              .filter((o) => o.side === side)
              .map((o) => {
                const rel = relationship(o, me, graph),
                  expired = isPast(o, now),
                  until = expiry(o),
                  expanded = open === o.tweet_id
                const x = `https://x.com/${o.username}/status/${o.tweet_id}`
                const report =
                  'https://github.com/TheExGenesis/community-archive/issues/new?' +
                  new URLSearchParams({
                    title: `Bulletin correction: ${o.tweet_id}`,
                    body: `Post: ${x}\nShown as: ${o.side} / ${o.kind}\nSummary: ${o.summary}\n\nWhat should change?\n`,
                  })
                return (
                  <article
                    key={o.tweet_id}
                    className={`rounded-lg border bg-card p-4 ${expired ? 'opacity-60' : ''} ${rel.rank < 3 ? 'border-brand/40' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <TweetAvatar
                        tweet={{
                          id: o.tweet_id,
                          username: o.username,
                          avatar: o.avatar_url || null,
                        }}
                      />
                      <Link
                        href={userProfileHref(o.username, o.account_id)}
                        className="min-w-0 text-sm hover:underline"
                      >
                        <strong>{o.display_name || o.username}</strong>
                        <span className="ml-1 text-muted-foreground">
                          @{o.username}
                        </span>
                      </Link>
                      {rel.label && (
                        <span className="ml-auto whitespace-nowrap text-xs text-brand">
                          {rel.label}
                        </span>
                      )}
                    </div>
                    <button
                      className="mt-3 w-full text-left"
                      aria-expanded={expanded}
                      aria-controls={`original-${o.tweet_id}`}
                      onClick={() => setOpen(expanded ? null : o.tweet_id)}
                    >
                      <h3 className="text-lg font-medium leading-snug">
                        {o.summary}
                      </h3>
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {KIND_LABELS[o.kind]} · {formatDate(o.posted_at)}
                        {o.place ? ' · ' + o.place : ''}
                        {expired ? ' · Past' : o.standing ? ' · Ongoing' : ''}
                      </span>
                      <span className="mt-2 block text-xs text-brand">
                        {expanded ? 'Hide original ↑' : 'Read original ↓'}
                      </span>
                    </button>
                    {o.account_created_at && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        On X since {o.account_created_at.slice(0, 4)}
                      </p>
                    )}
                    {expanded && (
                      <div
                        id={`original-${o.tweet_id}`}
                        className="mt-4 border-t pt-3"
                      >
                        <Original id={o.tweet_id} />
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Array.from(new Set(o.topics)).map((t) => (
                            <span
                              key={t}
                              className="rounded bg-muted px-2 py-1 text-xs"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
                          <Link
                            href={tweetPermalinkHref(
                              o.tweet_id,
                              'opportunities',
                              '/opportunities',
                            )}
                            className="text-brand hover:underline"
                          >
                            Open in archive
                          </Link>
                          <a
                            href={report}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:underline"
                          >
                            Not right? Report a correction
                          </a>
                        </div>
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {o.replies || 0} public repliers · {o.quotes || 0}{' '}
                        quotes
                      </span>
                      <a
                        href={x}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand hover:underline"
                      >
                        {RESPONSE_LABELS[o.respond]} on X ↗
                      </a>
                    </div>
                    {until && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {expired ? 'Expired' : 'Until'}{' '}
                        {formatDate(new Date(until - 1).toISOString())}
                      </p>
                    )}
                  </article>
                )
              })}
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
