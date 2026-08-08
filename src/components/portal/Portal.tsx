'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { FaExternalLinkAlt } from 'react-icons/fa'
import {
  PortalData,
  PortalTweet,
  TermWeek,
  RESEARCH_SOURCE,
} from '@/lib/portal/types'
import { PORTAL_ARTICLES } from './articles'
import { PORTAL_TOOLS } from './tools'
import { CARD, MUTED, FAINT, BODY, SERIF } from './styles'
import { TweetRow } from './TweetRow'
import HomepageSearch from '@/components/HomepageSearch'

export type PortalView = 'home' | 'stream'

const compact = (n: number) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)

const fmtDelta = (term: TermWeek) => {
  if (term.status === 'new') return 'new'
  if (term.status === 'inactive' || term.deltaPct === null) return '—'
  return `${term.deltaPct >= 0 ? '+' : '−'}${Math.abs(term.deltaPct)}%`
}

function newestCursor(tweets: PortalTweet[]) {
  return tweets.reduce<{ observedAt: string; id: string } | null>(
    (latest, tweet) => {
      if (!latest) return { observedAt: tweet.observedAt, id: tweet.id }
      const timeDiff =
        new Date(tweet.observedAt).getTime() -
        new Date(latest.observedAt).getTime()
      if (timeDiff > 0 || (timeDiff === 0 && tweet.id > latest.id)) {
        return { observedAt: tweet.observedAt, id: tweet.id }
      }
      return latest
    },
    null,
  )
}

function oldestPageCursor(tweets: PortalTweet[]) {
  const oldest = [...tweets].sort(compareTweetChronology).at(-1)
  return oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null
}

function compareTweetChronology(left: PortalTweet, right: PortalTweet) {
  return (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
    right.id.localeCompare(left.id)
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[12.5px] font-semibold transition-colors ${
        active
          ? 'bg-brand/15 border-brand text-blue-600 dark:text-blue-300'
          : `border-zinc-300 bg-white dark:border-[#2c2c30] dark:bg-[#1b1b1e] ${MUTED} hover:border-zinc-400 dark:hover:border-[#3f3f46]`
      }`}
    >
      {children}
    </button>
  )
}

function PanelHeader({
  title,
  action,
  live,
  divider = true,
}: {
  title: string
  action?: { label: string; href: string; external?: boolean }
  live?: boolean
  divider?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 ${
        divider ? 'border-b border-zinc-200 dark:border-[#26262a]' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {live && (
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#2acf80]" />
        )}
        <span className="text-[13px] font-bold">{title}</span>
      </div>
      {action &&
        (action.external ? (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12.5px] font-semibold text-brand hover:underline"
          >
            {action.label} →
          </a>
        ) : (
          <Link
            href={action.href}
            className="text-[12.5px] font-semibold text-brand hover:underline"
          >
            {action.label} →
          </Link>
        ))}
    </div>
  )
}

function LiveCounter({ count }: { count: string }) {
  return (
    <span className={`inline-flex items-center gap-[7px] text-[12px] ${MUTED}`}>
      <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#2acf80]" />
      <span className="tabular-nums">{count} tweets</span>
    </span>
  )
}

export default function Portal({
  data,
  view,
}: {
  data: PortalData
  view: PortalView
}) {
  const { stats, trends } = data

  // ---- live stream state -------------------------------------------------
  const [visible, setVisible] = useState<PortalTweet[]>(data.initialStream)
  const seenIds = useRef<Set<string>>(
    new Set(data.initialStream.map((t) => t.id)),
  )
  const updateCursor = useRef(newestCursor(data.initialStream))
  const pageCursor = useRef(oldestPageCursor(data.initialStream))
  const loadingMoreRef = useRef(false)
  const loadMoreTarget = useRef<HTMLDivElement>(null)
  const [hasMore, setHasMore] = useState(data.initialStream.length >= 30)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const loadMore = useCallback(async () => {
    if (
      view !== 'stream' ||
      !hasMore ||
      loadingMoreRef.current ||
      !pageCursor.current
    ) {
      return
    }
    loadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const params = new URLSearchParams({
        before: pageCursor.current.createdAt,
        beforeId: pageCursor.current.id,
      })
      const res = await fetch(`/api/portal/stream?${params.toString()}`)
      if (!res.ok) return
      const {
        tweets,
        nextCursor,
        hasMore: nextHasMore,
      } = (await res.json()) as {
        tweets: PortalTweet[]
        nextCursor: { createdAt: string; id: string } | null
        hasMore: boolean
      }
      const older = tweets.filter((tweet) => !seenIds.current.has(tweet.id))
      older.forEach((tweet) => seenIds.current.add(tweet.id))
      if (older.length > 0) {
        setVisible((current) =>
          [...current, ...older].sort(compareTweetChronology),
        )
      }
      pageCursor.current = nextCursor
      setHasMore(nextHasMore && nextCursor !== null)
    } catch {
      // Keep the sentinel active so scrolling can retry after a network hiccup.
    } finally {
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [hasMore, view])

  useEffect(() => {
    const controller = new AbortController()
    const poll = setInterval(async () => {
      try {
        const params = new URLSearchParams()
        if (updateCursor.current) {
          params.set('after', updateCursor.current.observedAt)
          params.set('afterId', updateCursor.current.id)
        }
        const res = await fetch(`/api/portal/stream?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const { tweets, updateCursor: nextUpdateCursor } =
          (await res.json()) as {
            tweets: PortalTweet[]
            updateCursor: { observedAt: string; id: string } | null
          }
        if (nextUpdateCursor) updateCursor.current = nextUpdateCursor
        const fresh = tweets
          .filter((t) => !seenIds.current.has(t.id))
          .sort(
            (a, b) =>
              new Date(a.observedAt).getTime() -
                new Date(b.observedAt).getTime() || a.id.localeCompare(b.id),
          )
        if (fresh.length > 0) {
          fresh.forEach((t) => seenIds.current.add(t.id))
          setVisible((current) =>
            [...fresh, ...current].sort(compareTweetChronology),
          )
        }
      } catch {
        // network hiccup; try again next poll
      }
    }, 45_000)
    return () => {
      controller.abort()
      clearInterval(poll)
    }
  }, [])

  useEffect(() => {
    if (view !== 'stream' || !hasMore) return
    const target = loadMoreTarget.current
    if (!target) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore()
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loadMore, view])

  const liveCount = stats.totalTweets.toLocaleString('en-US')

  // ---- derived trend views ----------------------------------------------
  const weeklyRanked = useMemo(
    () =>
      trends.weekly
        .filter((term) => term.last7 > 0)
        .sort((a, b) => b.last7 - a.last7),
    [trends.weekly],
  )
  const weeklyBars = weeklyRanked.slice(0, 6)
  const maxWeekly = Math.max(...weeklyBars.map((w) => w.last7), 1)
  const withDelta = useMemo(
    () =>
      trends.weekly.filter(
        (w) => w.deltaPct !== null && w.prev7 >= 5,
      ) as (TermWeek & {
        deltaPct: number
      })[],
    [trends.weekly],
  )
  const risers = useMemo(
    () =>
      [...withDelta]
        .filter((w) => w.deltaPct > 0)
        .sort((a, b) => b.deltaPct - a.deltaPct)
        .slice(0, 4),
    [withDelta],
  )
  const fallers = useMemo(
    () =>
      [...withDelta]
        .filter((w) => w.deltaPct < 0)
        .sort((a, b) => a.deltaPct - b.deltaPct)
        .slice(0, 4),
    [withDelta],
  )

  const bestStrands = PORTAL_TOOLS.find((t) => t.name === 'Best Strands')
  const recentBanger = data.recentBangers[0] ?? null
  const historicalBanger = data.historicalBangers[0] ?? null

  const generatedDate = useMemo(() => {
    const d = new Date(stats.generatedAt)
    return `${d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(
      d.getUTCMinutes(),
    ).padStart(2, '0')} UTC`
  }, [stats.generatedAt])

  return (
    <main className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      {/* ------------------------------------------------ Home ---------- */}
      {view === 'home' && (
        <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6">
          {/* Hero: same gist as the logged-out homepage */}
          <div className="mx-auto mb-40 mt-36 w-full max-w-[48rem] space-y-3 text-center">
            <h1
              className="text-6xl font-bold tracking-tight text-foreground"
              style={SERIF}
            >
              Community Archive
            </h1>
            <p className="text-xl leading-8 text-zinc-500 dark:text-[#a7a7b4]">
              We preserve{' '}
              <strong className="font-semibold text-foreground">
                {compact(stats.totalTweets)} public tweets
              </strong>{' '}
              from{' '}
              <strong className="font-semibold text-foreground">
                {stats.accountCount.toLocaleString('en-US')} community members
              </strong>
              .
            </p>
            <p className={`text-xs ${FAINT}`}>
              Backed by{' '}
              <a
                href="https://survivalandflourishing.fund/"
                target="_blank"
                rel="noopener noreferrer"
                className={`font-medium ${MUTED} transition-colors hover:text-brand hover:underline`}
              >
                Survival and Flourishing Fund
              </a>{' '}
              and{' '}
              <a
                href="https://x.com/VitalikButerin"
                target="_blank"
                rel="noopener noreferrer"
                className={`font-medium ${MUTED} transition-colors hover:text-brand hover:underline`}
              >
                Vitalik Buterin
              </a>
            </p>
            <div className="pt-4">
              <HomepageSearch />
            </div>
          </div>

          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[30px] font-semibold" style={SERIF}>
              Today on the archive
            </h2>
            <span className="flex items-baseline gap-3">
              <LiveCounter count={liveCount} />
              <span className={`text-[12.5px] ${MUTED}`}>{generatedDate}</span>
            </span>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Tweets archived"
              value={stats.totalTweets.toLocaleString('en-US')}
              note={`+${stats.streamedToday.toLocaleString('en-US')} streamed today`}
              noteClass="text-[#16a34a] dark:text-[#2acf80]"
            />
            <StatCard
              label="Community members"
              value={stats.accountCount.toLocaleString('en-US')}
              note={
                stats.joinedThisWeek > 0
                  ? `${stats.joinedThisWeek} upload${stats.joinedThisWeek === 1 ? '' : 's'} this week`
                  : 'volunteered archives'
              }
            />
            <StatCard
              label="Corpus span"
              value={`${stats.firstYear}–${stats.currentYear}`}
              note={`${stats.currentYear - stats.firstYear} years of discourse`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
            <div className="flex flex-col gap-4">
              <div className={CARD}>
                <PanelHeader
                  title="Live stream"
                  live
                  action={{ label: 'Open firehose', href: '/stream' }}
                />
                <div className="flex flex-col">
                  {visible.slice(0, 5).map((t, i) => (
                    <TweetRow key={t.id} tweet={t} compact animate={i === 0} />
                  ))}
                  {visible.length === 0 && (
                    <div
                      className={`px-4 py-8 text-center text-[13px] ${MUTED}`}
                    >
                      Waiting for the firehose…
                    </div>
                  )}
                </div>
              </div>

              <div className={`${CARD} flex flex-1 flex-col`}>
                <PanelHeader
                  title="Trending terms · 7 days"
                  action={{ label: 'Trends explorer', href: '/stream#trends' }}
                />
                <div className="flex flex-1 flex-col justify-evenly px-4 pb-3 pt-2">
                  {weeklyBars.length > 0 && (
                    <div
                      className={`flex items-center gap-3 pb-1 text-[10px] font-medium uppercase tracking-wide ${MUTED}`}
                    >
                      <span className="w-[90px] sm:w-[110px]" />
                      <span className="w-[54px] text-right">7d tweets</span>
                      <span className="flex-1">Relative volume</span>
                      <span className="w-[52px] text-right">7d change</span>
                    </div>
                  )}
                  {weeklyBars.map((b) => (
                    <div
                      key={b.term}
                      className="flex items-center gap-3 py-[5px]"
                    >
                      <span className="w-[90px] truncate text-[13px] font-semibold sm:w-[110px]">
                        {b.term}
                      </span>
                      <span className="w-[54px] text-right text-[12px] tabular-nums text-muted-foreground">
                        {b.last7.toLocaleString('en-US')}
                      </span>
                      <div
                        className="h-2 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-[#26262a]"
                        role="img"
                        aria-label={`${b.term}: ${b.last7.toLocaleString('en-US')} tweets in the last seven days`}
                        title={`${b.last7.toLocaleString('en-US')} tweets in the last 7 days; bar is relative to ${weeklyBars[0].term}`}
                      >
                        <div
                          className="h-full rounded bg-brand"
                          style={{ width: `${(b.last7 / maxWeekly) * 100}%` }}
                        />
                      </div>
                      <span
                        title={`${b.last7.toLocaleString('en-US')} tweets vs ${b.prev7.toLocaleString('en-US')} in the previous 7 days`}
                        className={`w-[52px] text-right text-[12px] font-bold tabular-nums ${
                          b.status === 'inactive'
                            ? MUTED
                            : (b.deltaPct ?? 0) >= 0
                              ? 'text-[#16a34a] dark:text-[#2acf80]'
                              : 'text-[#dc2626] dark:text-[#f87171]'
                        }`}
                      >
                        {fmtDelta(b)}
                      </span>
                    </div>
                  ))}
                  {weeklyBars.length === 0 && (
                    <div className={`py-8 text-center text-[13px] ${MUTED}`}>
                      No watchlist activity in the last seven days.
                    </div>
                  )}
                </div>
              </div>

              {(recentBanger || historicalBanger) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {recentBanger && (
                    <div className={`${CARD} min-w-0 overflow-hidden`}>
                      <PanelHeader
                        title="Banger of the moment"
                        action={{ label: 'More bangers', href: '/bangers' }}
                      />
                      <TweetRow tweet={recentBanger} collapsible />
                    </div>
                  )}

                  {historicalBanger && (
                    <div className={`${CARD} min-w-0 overflow-hidden`}>
                      <PanelHeader title="Historical banger · near this day" />
                      <TweetRow tweet={historicalBanger} collapsible showDate />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className={CARD}>
                <PanelHeader
                  title="Research"
                  action={{ label: 'All research', href: '/research' }}
                />
                <div className="flex flex-col">
                  {data.research.slice(0, 3).map((post) => (
                    <a
                      key={post.url}
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3 border-b border-zinc-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-zinc-50 dark:border-[#202023] dark:hover:bg-[#1f1f23]"
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className="flex items-baseline gap-1.5 text-[15.5px] font-semibold leading-snug"
                          style={SERIF}
                        >
                          {post.title}
                          <FaExternalLinkAlt className="h-2.5 w-2.5 flex-shrink-0 text-zinc-900 opacity-0 transition-opacity group-hover:opacity-70 dark:text-white" />
                        </div>
                        {post.excerpt && (
                          <div
                            className={`mt-1 line-clamp-2 text-[12.5px] leading-normal ${MUTED}`}
                          >
                            {post.excerpt}
                          </div>
                        )}
                        <div className={`mt-1 text-[12px] ${MUTED}`}>
                          {RESEARCH_SOURCE.name}
                          {post.date &&
                            ` · ${new Date(post.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </div>
                      </div>
                      {post.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.image}
                          alt=""
                          loading="lazy"
                          className="mt-0.5 h-14 w-20 flex-shrink-0 rounded-[4px] border border-zinc-200 object-cover dark:border-[#26262a]"
                        />
                      )}
                    </a>
                  ))}
                  {data.research.length === 0 && (
                    <a
                      href={RESEARCH_SOURCE.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`px-4 py-6 text-center text-[13px] ${MUTED} hover:text-brand`}
                    >
                      Read the latest research at {RESEARCH_SOURCE.name} →
                    </a>
                  )}
                </div>
              </div>
              {bestStrands && (
                <a
                  href={bestStrands.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${CARD} group overflow-hidden transition-colors hover:border-brand/60`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bestStrands.image}
                    alt={`${bestStrands.name} preview`}
                    loading="lazy"
                    className="aspect-[2/1] w-full border-b border-zinc-200 object-cover dark:border-[#26262a]"
                  />
                  <div className="flex items-start gap-2.5 px-4 py-3">
                    <span className="mt-0.5 flex-shrink-0 text-[15px] text-brand">
                      {bestStrands.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
                        {bestStrands.name}
                        <FaExternalLinkAlt className="h-2.5 w-2.5 flex-shrink-0 text-zinc-900 opacity-0 transition-opacity group-hover:opacity-70 dark:text-white" />
                      </span>
                      <span
                        className={`mt-0.5 block text-[12px] leading-snug ${MUTED}`}
                      >
                        {bestStrands.description}
                      </span>
                    </span>
                  </div>
                </a>
              )}
            </div>
          </div>

          {/* Tools */}
          <div id="products" className={`${CARD} mt-4 scroll-mt-32`}>
            <PanelHeader
              title="Explore the archive"
              action={{ label: 'All tools', href: '/tools' }}
              divider={false}
            />
            <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {PORTAL_TOOLS.filter(
                (t) =>
                  !t.image &&
                  !['Banger Bot', 'Highlights Bot'].includes(t.name),
              ).map((tool) => (
                <a
                  key={tool.name}
                  href={tool.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-[4px] border border-zinc-200 bg-zinc-50 px-3 py-2.5 transition-colors hover:border-brand/60 dark:border-[#26262a] dark:bg-[#121214] dark:hover:border-brand/60"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex-shrink-0 text-[15px] text-brand">
                      {tool.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[13px] font-bold">
                        {tool.name}
                        <FaExternalLinkAlt className="h-2.5 w-2.5 flex-shrink-0 text-zinc-900 opacity-0 transition-opacity group-hover:opacity-70 dark:text-white" />
                      </span>
                      <span
                        className={`mt-0.5 block text-[12px] leading-snug ${MUTED}`}
                      >
                        {tool.description}
                      </span>
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Stream -------- */}
      {view === 'stream' && (
        <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <Link
                href="/"
                className={`mb-2 inline-flex items-center text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
              >
                ← Dashboard
              </Link>
              <div className="mb-1.5 flex items-baseline gap-3">
                <h1 className="text-[26px] font-semibold" style={SERIF}>
                  Live stream
                </h1>
                <LiveCounter count={liveCount} />
              </div>
              <div className={`mb-3.5 text-[13px] ${MUTED}`}>
                Tweets arriving from the browser-extension firehose, as
                contributors read their timelines.
              </div>
              <div className={`${CARD} overflow-hidden`}>
                {visible.map((t, i) => (
                  <TweetRow
                    key={t.id}
                    tweet={t}
                    animate={i === 0}
                    showArchivedBadge
                  />
                ))}
                {visible.length === 0 && (
                  <div className={`px-4 py-8 text-center text-[13px] ${MUTED}`}>
                    Waiting for the firehose…
                  </div>
                )}
              </div>
              <div
                ref={loadMoreTarget}
                aria-live="polite"
                className={`py-5 text-center text-[12.5px] ${MUTED}`}
              >
                {isLoadingMore
                  ? 'Loading older tweets…'
                  : hasMore
                    ? 'Scroll for older tweets'
                    : visible.length > 0
                      ? 'You’ve reached the end.'
                      : ''}
              </div>
            </div>
            <div id="trends" className="scroll-mt-32">
              <TrendsView trends={trends} risers={risers} fallers={fallers} />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function StatCard({
  label,
  value,
  note,
  noteClass,
}: {
  label: string
  value: string
  note: string
  noteClass?: string
}) {
  return (
    <div className={`${CARD} px-4 py-3.5`}>
      <div
        className={`mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
      >
        {label}
      </div>
      <div className="text-[27px] font-semibold tabular-nums" style={SERIF}>
        {value}
      </div>
      <div className={`mt-0.5 text-[12px] ${noteClass ?? MUTED}`}>{note}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trends view
// ---------------------------------------------------------------------------

function TrendsView({
  trends,
  risers,
  fallers,
}: {
  trends: PortalData['trends']
  risers: (TermWeek & { deltaPct: number })[]
  fallers: (TermWeek & { deltaPct: number })[]
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(trends.series.map((s, i) => [s.term, i < 4])),
  )

  const activeSeries = trends.series.filter((s) => enabled[s.term])
  const maxVal = Math.max(5, ...activeSeries.flatMap((s) => s.perYear))
  const niceMax = Math.ceil(maxVal / 3) * 3

  const W = 480
  const H = 270
  const X0 = 44
  const X1 = 448
  const Y0 = 244
  const Y1 = 24
  const xs = trends.years.map(
    (_, i) => X0 + (i * (X1 - X0)) / Math.max(trends.years.length - 1, 1),
  )
  const yOf = (v: number) => Y0 - (v / niceMax) * (Y0 - Y1)
  const gridVals = [0, niceMax / 3, (2 * niceMax) / 3, niceMax]

  return (
    <div>
      <h2 className="mb-3 text-[18px] font-semibold" style={SERIF}>
        Trends in ideas
      </h2>
      <div className={`${CARD} mb-4 p-4`}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
          {gridVals.map((v) => (
            <g key={v}>
              <line
                x1={X0 - 4}
                y1={yOf(v)}
                x2={X1}
                y2={yOf(v)}
                className="stroke-zinc-200 dark:stroke-[#202023]"
                strokeWidth={1}
              />
              <text
                x={X0 - 8}
                y={yOf(v) + 4}
                textAnchor="end"
                fontSize={10}
                className="fill-zinc-400 dark:fill-[#6d6d78]"
              >
                {Math.round(v)}
              </text>
            </g>
          ))}
          {trends.years.map((y, i) => (
            <text
              key={y}
              x={xs[i]}
              y={262}
              textAnchor="middle"
              fontSize={11}
              className="fill-zinc-400 dark:fill-[#6d6d78]"
            >
              {y}
            </text>
          ))}
          {activeSeries.map((s) => (
            <polyline
              key={s.term}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.perYear
                .map((v, i) => `${xs[i]},${yOf(v).toFixed(1)}`)
                .join(' ')}
            />
          ))}
        </svg>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {trends.series.map((s) => (
          <Chip
            key={s.term}
            active={!!enabled[s.term]}
            onClick={() => setEnabled((e) => ({ ...e, [s.term]: !e[s.term] }))}
          >
            <span
              className="h-[9px] w-[9px] rounded-full"
              style={{
                background: s.color,
                opacity: enabled[s.term] ? 1 : 0.35,
              }}
            />
            {s.term}
          </Chip>
        ))}
      </div>
      <div className={`mb-4 text-[13px] leading-normal ${BODY}`}>
        Term frequency per 100k tweets, {trends.years[0]}–
        {trends.years[trends.years.length - 1]}. An ngram viewer for the
        vocabulary of one corner of the internet. Recomputed daily from the full
        corpus.
      </div>
      <div className="grid grid-cols-1 gap-4">
        <DeltaPanel title="Rising this week" items={risers} positive />
        <DeltaPanel title="Cooling this week" items={fallers} />
      </div>
    </div>
  )
}

function DeltaPanel({
  title,
  items,
  positive,
}: {
  title: string
  items: (TermWeek & { deltaPct: number })[]
  positive?: boolean
}) {
  return (
    <div className={CARD}>
      <PanelHeader title={title} />
      {items.length === 0 && (
        <div className={`px-4 py-6 text-center text-[13px] ${MUTED}`}>
          Nothing moving fast this week.
        </div>
      )}
      {items.map((m) => (
        <div
          key={m.term}
          className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 last:border-b-0 dark:border-[#202023]"
        >
          <span className="text-[13.5px] font-semibold">{m.term}</span>
          <span
            className={`text-[13px] font-bold tabular-nums ${
              positive
                ? 'text-[#16a34a] dark:text-[#2acf80]'
                : 'text-[#dc2626] dark:text-[#f87171]'
            }`}
          >
            {fmtDelta(m)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field notes view
// ---------------------------------------------------------------------------

export function PortalNotes({
  initialArticleId,
}: {
  initialArticleId?: string
}) {
  const [articleId, setArticleId] = useState<string | null>(
    initialArticleId ?? null,
  )
  const article = PORTAL_ARTICLES.find((a) => a.id === articleId)

  if (article) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
        <button
          onClick={() => setArticleId(null)}
          className="mb-4 text-[13px] font-semibold text-brand hover:underline"
        >
          ← All field notes
        </button>
        <div className="max-w-[680px]">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-brand">
            {article.tag}
          </div>
          <h1
            className="mb-2.5 text-[32px] font-semibold leading-tight"
            style={SERIF}
          >
            {article.title}
          </h1>
          <div className={`mb-6 text-[13px] ${MUTED}`}>{article.meta}</div>
          <div
            className={`flex flex-col gap-4 text-[15.5px] leading-[1.75] ${BODY}`}
          >
            {article.paras.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
      <h1 className="mb-1.5 text-[26px] font-semibold" style={SERIF}>
        AI field notes
      </h1>
      <div className={`mb-[18px] text-[13px] ${MUTED}`}>
        Short essays from inside the archive: how ideas enter the canon, mutate,
        and fade.
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {PORTAL_ARTICLES.map((a) => (
          <button
            key={a.id}
            onClick={() => setArticleId(a.id)}
            className={`${CARD} p-[18px] text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:hover:border-[#3f3f46] dark:hover:bg-[#1f1f23]`}
          >
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-brand">
              {a.tag}
            </div>
            <div
              className="mb-2 text-[19px] font-semibold leading-snug"
              style={SERIF}
            >
              {a.title}
            </div>
            <div className={`mb-2.5 text-[13px] leading-normal ${MUTED}`}>
              {a.excerpt}
            </div>
            <div className={`text-[12px] ${FAINT}`}>{a.meta}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
