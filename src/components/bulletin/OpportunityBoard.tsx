'use client'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PiArrowSquareOut } from 'react-icons/pi'
import { useTweetBatch } from './useTweetBatch'
import { useBoardPages } from './useBoardPages'
import { RefreshButton } from './RefreshButton'
import { TweetAvatar } from '@/components/TweetAvatar'
import type { PortalTweet } from '@/lib/portal/types'
import { decodeTweetText } from '@/lib/tweetText'
import { tweetPermalinkHref, userProfileHref } from '@/lib/navigation'
import {
  KIND_LABELS,
  type BulletinPage,
  type Opportunity,
} from '@/lib/bulletin/types'
import {
  isPast,
  relationship,
  sortNotices,
  type BulletinRelationships,
} from '@/lib/bulletin/board'
import styles from './OpportunityBoard.module.css'

const ExpandedTweetCard = lazy(() =>
  import('@/components/TweetCard').then((module) => ({
    default: module.TweetCard,
  })),
)

const EMPTY_GRAPH: BulletinRelationships = { outgoing: {}, available: false }
const LANE_GROUPS = [
  ['free'],
  ['opportunity'],
  ['invite'],
  ['intro'],
  ['help', 'feedback'],
]
const PAGE_SIZE = 4

function ScrollMore({
  count,
  label,
  onMore,
}: {
  count: number
  label: string
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
      { rootMargin: '200px' },
    )
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [count])
  return (
    <div
      ref={sentinel}
      aria-label={`Load more ${label}`}
      className={styles.more}
    >
      {manual ? (
        <button onClick={onMore}>Show more</button>
      ) : (
        <span className="sr-only">More {label} load as you scroll</span>
      )}
    </div>
  )
}

function NoticeCard({
  notice,
  loadTweet,
  badge,
  expired,
}: {
  notice: Opportunity
  loadTweet: (id: string) => Promise<PortalTweet>
  badge: string
  expired: boolean
}) {
  const [open, setOpen] = useState(false)
  const [tweet, setTweet] = useState<PortalTweet | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open) return
    let active = true
    setError(false)
    loadTweet(notice.tweet_id)
      .then((value) => {
        if (active) setTweet(value)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [notice.tweet_id, open, attempt, loadTweet])
  const fallback: PortalTweet = {
    id: notice.tweet_id,
    accountId: notice.account_id,
    username: notice.username,
    name: notice.display_name || notice.username,
    avatar: notice.avatar_url || null,
    text: notice.preview_text || '',
    createdAt: notice.posted_at,
    observedAt: notice.posted_at,
    likes: 0,
    rts: 0,
  }
  const date = new Date(notice.posted_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const text = decodeTweetText(tweet?.text || notice.preview_text || '')
  return (
    <article
      className={styles.notice}
      style={expired ? { opacity: 0.6 } : undefined}
    >
      <div className={styles.noticeHead}>
        <span
          className={`${styles.kind} ${notice.side === 'offer' ? styles.offer : styles.ask}`}
        >
          {notice.side === 'offer' ? 'Offer' : 'Ask'}
        </span>
        <time dateTime={notice.posted_at} className={styles.date}>
          {date}
        </time>
      </div>
      <p className={styles.summary}>
        <Link
          href={tweetPermalinkHref(
            notice.tweet_id,
            'opportunities',
            '/opportunities',
          )}
        >
          {notice.summary}
        </Link>
      </p>
      <button
        className={styles.textButton}
        aria-label={`${open ? 'Collapse' : 'Read full'} tweet by @${notice.username}`}
        aria-expanded={open}
        aria-controls={`original-${notice.tweet_id}`}
        onClick={() => setOpen((value) => !value)}
      >
        {!open && (
          <span className={styles.text}>{text || 'Read original tweet'}</span>
        )}
        <span className={styles.readMore}>
          {open ? 'Show less' : 'Read more'}
        </span>
      </button>
      {open && (
        <div id={`original-${notice.tweet_id}`} className={styles.expanded}>
          <Suspense fallback={<p className={styles.fullText}>{text}</p>}>
            <ExpandedTweetCard
              tweet={tweet || fallback}
              showEngagement={!!tweet}
              clickable={false}
              showDate
              showExternalLink
              origin="opportunities"
              returnTo="/opportunities"
            />
          </Suspense>
          {!tweet && !error && (
            <p className="text-xs text-muted-foreground">
              Loading post details…
            </p>
          )}
          {error && (
            <button
              className="text-sm text-brand"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Retry post details
            </button>
          )}
        </div>
      )}
      <footer className={styles.noticeFoot}>
        <Link
          href={userProfileHref(notice.username, notice.account_id)}
          aria-label={`View @${notice.username}'s profile`}
        >
          <TweetAvatar tweet={tweet || fallback} size={22} />
        </Link>
        <Link
          className={styles.handle}
          href={userProfileHref(notice.username, notice.account_id)}
        >
          @{notice.username}
        </Link>
        <span
          className={styles.likes}
          aria-label={tweet ? `${tweet.likes} likes` : undefined}
        >
          {tweet ? `♡ ${tweet.likes.toLocaleString()}` : ''}
        </span>
        <a
          className={styles.outbound}
          href={`https://twitter.com/${encodeURIComponent(notice.username)}/status/${notice.tweet_id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View original on X"
        >
          <PiArrowSquareOut size={12} />
        </a>
      </footer>
      {(badge || expired) && (
        <span className={styles.badge}>
          {badge}
          {expired ? `${badge ? ' · ' : ''}Past` : ''}
        </span>
      )}
    </article>
  )
}

export function OpportunityBoard({
  opportunities,
  initialPage,
  me = '',
  username = '',
  graph = EMPTY_GRAPH,
  now = Date.now(),
  isAdmin = false,
}: {
  opportunities: Opportunity[]
  initialPage?: BulletinPage
  me?: string
  username?: string
  graph?: BulletinRelationships
  now?: number
  isAdmin?: boolean
}) {
  const loadTweet = useTweetBatch()
  const [pageSize, setPageSize] = useState<Record<string, number>>({})
  const [side, setSide] = useState('all')
  const [kind, setKind] = useState('all')
  const [search, setSearch] = useState('')
  const [past, setPast] = useState(false)
  const [recommended, setRecommended] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const pages = useBoardPages(
    initialPage,
    { kind, side, search, past, recommended },
    hydrated,
  )
  const loaded = pages.page?.opportunities || opportunities
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1))
    const savedKind = p.get('kind') || 'all'
    setKind(savedKind in KIND_LABELS ? savedKind : 'all')
    setSide(
      ['ask', 'offer'].includes(p.get('side') || '') ? p.get('side')! : 'all',
    )
    setPast(p.get('past') === '1')
    setRecommended(p.get('sort') !== 'newest')
    setHydrated(true)
  }, [])
  useEffect(() => {
    if (!hydrated) return
    const p = new URLSearchParams()
    if (kind !== 'all') p.set('kind', kind)
    if (side !== 'all') p.set('side', side)
    if (past) p.set('past', '1')
    if (!recommended) p.set('sort', 'newest')
    window.history.replaceState(
      null,
      '',
      window.location.pathname +
        window.location.search +
        (p.toString() ? '#' + p.toString() : ''),
    )
  }, [kind, side, past, recommended, hydrated])
  const visible = useMemo(
    () =>
      sortNotices(
        loaded.filter(
          (o) =>
            (past || !isPast(o, now)) &&
            (kind === 'all' || o.kind === kind) &&
            (side === 'all' || o.side === side) &&
            [o.summary, o.preview_text, o.username, o.place, ...o.topics]
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
    [loaded, kind, side, past, search, recommended, me, graph, now],
  )
  useEffect(() => {
    setPageSize({})
  }, [kind, side, search, past, recommended])
  const shown = initialPage
    ? visible.length
    : Object.keys(KIND_LABELS).reduce(
        (count, id) =>
          count +
          Math.min(
            pageSize[id] || PAGE_SIZE,
            visible.filter((o) => o.kind === id).length,
          ),
        0,
      )
  const count = initialPage
    ? Object.values(pages.page?.counts || {}).reduce((n, count) => n + count, 0)
    : visible.length
  const total = pages.page?.total ?? opportunities.length
  const own = loaded.filter((o) => o.account_id === me)
  const answered = loaded.filter(
    (o) => o.account_id !== me && o.reply_account_ids?.includes(me),
  ).length
  return (
    <>
      <header className={styles.subbar}>
        <h1 className={styles.title}>Opportunities</h1>
        <p className={styles.lede}>{count} notices · collected daily</p>
        <div className={styles.controls}>
          <div
            className={styles.segmented}
            role="group"
            aria-label="Notice type"
          >
            {(['all', 'offer', 'ask'] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={side === id}
                onClick={() => setSide(id)}
              >
                {id === 'all' ? 'All' : id === 'offer' ? 'Offers' : 'Asks'}
              </button>
            ))}
          </div>
          <input
            className={styles.field}
            type="search"
            aria-label="Filter notices"
            placeholder="Filter notices"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <RefreshButton className={styles.refresh} />
        </div>
        <p className={styles.description}>
          This page may contain opportunities. We filter tweets for asks and
          offers. Things like free services, invitations to events, grants,
          collaborations, requests for feedback or introductions, and more. We
          show you things that may be relevant to you first.
        </p>
      </header>
      {pages.pending && (
        <p role="status" className="px-8 py-4 text-sm text-muted-foreground">
          {pages.error || 'Loading matching notices…'}
          {pages.error && (
            <button className="ml-2 text-brand" onClick={pages.retry}>
              Retry
            </button>
          )}
        </p>
      )}
      <div className={styles.board} aria-busy={pages.pending}>
        {LANE_GROUPS.filter(
          (group) => !pages.pending && (kind === 'all' || group.includes(kind)),
        ).map((group) => (
          <div className={styles.laneGroup} key={group[0]}>
            {group
              .filter((id) => kind === 'all' || kind === id)
              .map((id) => {
                const notices = visible.filter((o) => o.kind === id)
                const limit = initialPage
                  ? notices.length
                  : pageSize[id] || PAGE_SIZE
                return (
                  <section
                    key={id}
                    className={styles.lane}
                    aria-label={KIND_LABELS[id]}
                  >
                    <div className={styles.laneHead}>
                      <h2>{KIND_LABELS[id]}</h2>
                      <span className={styles.laneCount}>
                        {initialPage
                          ? pages.page?.counts[id] || 0
                          : notices.length}
                      </span>
                    </div>
                    {notices.slice(0, limit).map((o) => (
                      <NoticeCard
                        key={o.tweet_id}
                        notice={o}
                        loadTweet={loadTweet}
                        badge={relationship(o, me, graph).label}
                        expired={isPast(o, now)}
                      />
                    ))}
                    {(initialPage
                      ? pages.page?.cursors[id] &&
                        !pages.loading[id] &&
                        !pages.laneErrors[id]
                      : notices.length > limit) && (
                      <ScrollMore
                        key={`${kind}:${side}:${search}:${past}:${recommended}`}
                        label={KIND_LABELS[id]}
                        count={limit}
                        onMore={() =>
                          initialPage
                            ? void pages.loadMore(id)
                            : setPageSize((size) => ({
                                ...size,
                                [id]: (size[id] || PAGE_SIZE) + PAGE_SIZE,
                              }))
                        }
                      />
                    )}
                    {pages.loading[id] && (
                      <p className={styles.empty}>Loading more…</p>
                    )}
                    {pages.laneErrors[id] && (
                      <p className={styles.empty}>
                        {pages.laneErrors[id]}{' '}
                        <button onClick={() => void pages.loadMore(id)}>
                          Retry
                        </button>
                      </p>
                    )}
                    {!notices.length && (
                      <p className={styles.empty}>No matching notices.</p>
                    )}
                  </section>
                )
              })}
          </div>
        ))}
      </div>
      <footer className={styles.footer}>
        <p role="status">
          {count} of {total} notices
          {shown < count ? ` · ${shown} shown` : ''}
          {total === 2000 ? ' · Latest 2,000 only' : ''}
        </p>
        <p>
          Thanks to <Link href="/user/maskys_">@maskys_</Link> for the first
          prototype.
        </p>
        {isAdmin && <Link href="/admin/opportunities">Run dashboard →</Link>}
        <details className={styles.options}>
          <summary>Options & about this board</summary>
          <div className={styles.optionFields}>
            <label>
              Sort{' '}
              <select
                value={recommended ? 'recommended' : 'newest'}
                onChange={(e) =>
                  setRecommended(e.target.value === 'recommended')
                }
              >
                <option value="recommended">Recommended</option>
                <option value="newest">Newest</option>
              </select>
            </label>
            <label>
              Category{' '}
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">All categories</option>
                {Object.entries(KIND_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={past}
                onChange={(e) => setPast(e.target.checked)}
              />
              Show past notices
            </label>
          </div>
          <p className={styles.method}>
            {recommended
              ? graph.available
                ? 'Recommended puts your notices and people you interact with most first within each category, using your top 25 all-time outgoing interactions. Missing people are not necessarily strangers.'
                : 'Top outgoing interactions are unavailable. Showing your notices first within each category, then newest.'
              : 'Newest notices first within each category.'}{' '}
            Past notices appear last.
          </p>
          {me && (
            <p className={styles.method}>
              @{username || me} · {own.filter((o) => o.side === 'offer').length}{' '}
              offers · {own.filter((o) => o.side === 'ask').length} asks ·{' '}
              {own.reduce((n, o) => n + (o.replies || 0) + (o.quotes || 0), 0)}{' '}
              public responses · Replied to {answered} other notices. Public
              archive activity within the loaded notices only.
            </p>
          )}
          <p className={styles.method}>
            After the daily archive refresh, phrase filters and AI find asks and
            offers in recent original ClickHouse posts from participating
            accounts. This is a selection, not a complete directory: replies,
            reposts, late arrivals and notices without matching phrases may be
            missed. Read the original before responding. Counts may adjust as
            more posts are checked.
          </p>
          <p className={styles.method}>
            The daily scan covers the previous two UTC days. Undated asks expire
            after 14 days and offers after 60 days; standing offers stay open.
            Post an “offer:”, “ask:”, or “standing offer:” on X with what you
            need or offer and how to respond. Quote your own notice to renew an
            undated notice when it reaches the archive.
          </p>
        </details>
      </footer>
    </>
  )
}
