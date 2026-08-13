'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { FaDatabase, FaExternalLinkAlt, FaUsers } from 'react-icons/fa'
import {
  PortalData,
  PortalTweet,
  TermWeek,
  RESEARCH_SOURCE,
} from '@/lib/portal/types'
import { PORTAL_ARTICLES } from './articles'
import { CARD, MUTED, FAINT, BODY, SERIF } from './styles'
import TweetCard from '@/components/TweetCard'
import {
  estimateLiveTweetGain,
  interpolateLiveTweetCount,
  liveCounterBurstDelay,
  LIVE_COUNTER_CATCH_UP_BURST_BASE_MS,
  LIVE_COUNTER_CATCH_UP_DURATION_MS,
  liveTweetCatchUpRange,
  liveCounterRefreshInterval,
  PORTAL_STREAM_POLL_INTERVAL_MS,
} from './live'
import {
  comparePortalTweetChronology,
  selectHomepageStream,
} from '@/lib/portal/stream'
import { BANGERS_ALL_TIME_HREF, BANGERS_WEEK_HREF } from '@/lib/portal/bangers'
import { capturePostHogEvent } from '@/lib/posthog'
import type { DigestPreview } from '@/lib/digest/types'

export type PortalView = 'home' | 'stream'

const HOME_LIVE_STREAM_LIMIT = 12
const ARCHIVE_EXPORT_URL =
  'https://github.com/TheExGenesis/community-archive/releases/tag/data_export'
const COMMUNITY_BUILDS_URL = '/tweets/1835411943735140798'

type DashboardDestination =
  | 'all_time_bangers'
  | 'community_builds'
  | 'data_export'
  | 'daily_digest'
  | 'live_stream'
  | 'recent_bangers'
  | 'research'
  | 'research_article'
  | 'trends'

function captureDashboardDestination(
  destination: DashboardDestination,
  surface: 'card' | 'list' | 'panel_header',
  external: boolean,
) {
  capturePostHogEvent('dashboard_destination_opened', {
    destination,
    surface,
    external,
  })
}

const compact = (n: number) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)

const signInHref = (returnTo: string) =>
  `/login?redirect=${encodeURIComponent(returnTo)}`

const fmtDelta = (term: TermWeek) => {
  if (term.status === 'new') return 'new'
  if (term.status === 'inactive' || term.deltaPct === null) return '—'
  return `${term.deltaPct >= 0 ? '+' : '−'}${Math.abs(term.deltaPct)}%`
}

function compareTweetIds(left: string, right: string): number {
  return left.length - right.length || left.localeCompare(right)
}

function newestCursor(tweets: PortalTweet[]) {
  return tweets.reduce<{ observedAt: string; id: string } | null>(
    (latest, tweet) => {
      if (!latest) return { observedAt: tweet.observedAt, id: tweet.id }
      const timeDiff =
        new Date(tweet.observedAt).getTime() -
        new Date(latest.observedAt).getTime()
      if (
        timeDiff > 0 ||
        (timeDiff === 0 && compareTweetIds(tweet.id, latest.id) > 0)
      ) {
        return { observedAt: tweet.observedAt, id: tweet.id }
      }
      return latest
    },
    null,
  )
}

function oldestPageCursor(tweets: PortalTweet[]) {
  const oldest = [...tweets].sort(comparePortalTweetChronology).at(-1)
  return oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null
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
  action?: {
    label: string
    href: string
    analyticsDestination: DashboardDestination
    external?: boolean
  }
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
            onClick={() =>
              captureDashboardDestination(
                action.analyticsDestination,
                'panel_header',
                true,
              )
            }
            className="text-[12.5px] font-semibold text-brand hover:underline"
          >
            {action.label} →
          </a>
        ) : (
          <Link
            href={action.href}
            onClick={() =>
              captureDashboardDestination(
                action.analyticsDestination,
                'panel_header',
                false,
              )
            }
            className="text-[12.5px] font-semibold text-brand hover:underline"
          >
            {action.label} →
          </Link>
        ))}
    </div>
  )
}

function PanelUnavailable({ message }: { message: string }) {
  return (
    <div
      role="status"
      className={`min-h-24 flex items-center justify-center px-4 py-8 text-center text-[13px] ${MUTED}`}
    >
      {message}
    </div>
  )
}

function useLiveTweetCount({
  count,
  gain,
  generatedAt,
}: {
  count: number
  gain: number
  generatedAt: string
}): number {
  // Keep the server and first client render identical, then begin projecting
  // from the analytics snapshot after hydration.
  const [displayCount, setDisplayCount] = useState(count)
  const displayCountRef = useRef(count)

  useEffect(() => {
    let timer: number | null = null
    let cancelled = false
    let animationBurstIndex = 0
    let liveBurstIndex = 0
    const animationStartedAt = Date.now()
    const catchUp = liveTweetCatchUpRange({
      totalTweets: count,
      streamedLast24Hours: gain,
      generatedAt,
      now: animationStartedAt,
    })
    const startCount = Math.max(catchUp.startCount, displayCountRef.current)
    const targetCount = Math.max(catchUp.targetCount, startCount)

    const updateDisplayCount = (nextCount: number) => {
      const monotonicCount = Math.max(displayCountRef.current, nextCount)
      if (monotonicCount === displayCountRef.current) return
      displayCountRef.current = monotonicCount
      setDisplayCount(monotonicCount)
    }

    const startLiveUpdates = () => {
      const intervalMs = liveCounterRefreshInterval(gain)
      if (intervalMs === null) return
      const liveStartedAt = Date.now()
      const liveStartCount = displayCountRef.current
      const tick = () => {
        if (cancelled) return
        updateDisplayCount(
          liveStartCount +
            estimateLiveTweetGain(gain, Date.now() - liveStartedAt),
        )
        timer = window.setTimeout(
          tick,
          liveCounterBurstDelay(intervalMs, liveBurstIndex++),
        )
      }
      timer = window.setTimeout(
        tick,
        liveCounterBurstDelay(intervalMs, liveBurstIndex++),
      )
    }

    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    updateDisplayCount(startCount)
    if (prefersReducedMotion || targetCount <= startCount) {
      updateDisplayCount(targetCount)
      startLiveUpdates()
    } else {
      const animate = () => {
        const elapsedMs = Date.now() - animationStartedAt
        updateDisplayCount(
          interpolateLiveTweetCount({
            startCount,
            targetCount,
            elapsedMs,
          }),
        )
        if (elapsedMs >= LIVE_COUNTER_CATCH_UP_DURATION_MS) {
          startLiveUpdates()
          return
        }
        const baseDelay = Math.min(
          LIVE_COUNTER_CATCH_UP_BURST_BASE_MS,
          liveCounterRefreshInterval(gain) ??
            LIVE_COUNTER_CATCH_UP_BURST_BASE_MS,
        )
        const remainingMs = LIVE_COUNTER_CATCH_UP_DURATION_MS - elapsedMs
        timer = window.setTimeout(
          animate,
          Math.min(
            remainingMs,
            liveCounterBurstDelay(baseDelay, animationBurstIndex++),
          ),
        )
      }
      animate()
    }

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [count, gain, generatedAt])

  return displayCount
}

function LiveCounter({ count, gain }: { count: number; gain: number }) {
  return (
    <span
      className={`inline-flex items-center gap-[7px] text-[12px] ${MUTED}`}
      title={`Estimated live total, paced by ${gain.toLocaleString('en-US')} tweets streamed in the last 24 hours`}
    >
      <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#2acf80]" />
      <span className="tabular-nums">
        {count.toLocaleString('en-US')} tweets
      </span>
    </span>
  )
}

function ArchiveOverview({
  stats,
  generatedDate,
  failures,
}: {
  stats: PortalData['stats']
  generatedDate: string
  failures: Pick<
    PortalData['failures'],
    'liveAnalytics' | 'memberCount' | 'joinedThisWeek' | 'corpusRange'
  >
}) {
  const count = useLiveTweetCount({
    count: stats.totalTweets,
    gain: stats.streamedLast24Hours,
    generatedAt: stats.generatedAt,
  })

  return (
    <>
      <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[30px] font-semibold" style={SERIF}>
          Today on the archive
        </h2>
        {!failures.liveAnalytics && (
          <span className="flex items-baseline gap-3">
            <LiveCounter count={count} gain={stats.streamedLast24Hours} />
            <span className={`text-[12.5px] ${MUTED}`}>{generatedDate}</span>
          </span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Tweets archived"
          value={
            failures.liveAnalytics
              ? 'Unavailable'
              : count.toLocaleString('en-US')
          }
          note={
            failures.liveAnalytics
              ? 'Tweet totals are temporarily unavailable.'
              : `+${stats.streamedLast24Hours.toLocaleString('en-US')} streamed in the last 24h`
          }
          noteClass={
            failures.liveAnalytics
              ? undefined
              : 'text-[#16a34a] dark:text-[#2acf80]'
          }
        />
        <StatCard
          label="Community members"
          value={
            failures.memberCount
              ? 'Unavailable'
              : stats.accountCount.toLocaleString('en-US')
          }
          note={
            failures.memberCount
              ? 'Member count is temporarily unavailable.'
              : failures.joinedThisWeek
                ? 'Recent upload count is temporarily unavailable.'
                : stats.joinedThisWeek > 0
                  ? `${stats.joinedThisWeek} upload${stats.joinedThisWeek === 1 ? '' : 's'} this week`
                  : 'volunteered archives'
          }
        />
        <StatCard
          label="Corpus span"
          value={
            failures.corpusRange
              ? 'Unavailable'
              : `${stats.firstYear}–${stats.currentYear}`
          }
          note={
            failures.corpusRange
              ? 'Corpus range is temporarily unavailable.'
              : `${stats.currentYear - stats.firstYear} years of discourse`
          }
        />
      </div>
    </>
  )
}

function LiveStreamHeading({
  stats,
  unavailable,
}: {
  stats: PortalData['stats']
  unavailable: boolean
}) {
  const count = useLiveTweetCount({
    count: stats.totalTweets,
    gain: stats.streamedLast24Hours,
    generatedAt: stats.generatedAt,
  })
  return (
    <div className="mb-1.5 flex items-baseline gap-3">
      <h1 className="text-[26px] font-semibold" style={SERIF}>
        Live stream
      </h1>
      {!unavailable && (
        <LiveCounter count={count} gain={stats.streamedLast24Hours} />
      )}
    </div>
  )
}

export default function Portal({
  data,
  view,
  isMember = true,
  embedded = false,
  digestPreview = null,
}: {
  data: PortalData
  view: PortalView
  isMember?: boolean
  embedded?: boolean
  digestPreview?: DigestPreview | null
}) {
  const { stats, trends } = data

  // ---- live stream state -------------------------------------------------
  const [visible, setVisible] = useState<PortalTweet[]>(data.initialStream)
  const [streamUnavailable, setStreamUnavailable] = useState(
    data.failures.initialStream,
  )
  const seenIds = useRef<Set<string>>(
    new Set(data.initialStream.map((t) => t.id)),
  )
  const updateCursor = useRef(newestCursor(data.initialStream))
  const pageCursor = useRef(oldestPageCursor(data.initialStream))
  const loadingMoreRef = useRef(false)
  const loadMoreTarget = useRef<HTMLDivElement>(null)
  const [hasMore, setHasMore] = useState(
    !data.failures.initialStream && data.initialStream.length >= 30,
  )
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
          [...current, ...older].sort(comparePortalTweetChronology),
        )
      }
      pageCursor.current = nextCursor
      const canLoadMore = nextHasMore && nextCursor !== null
      setHasMore(canLoadMore)
      capturePostHogEvent('portal_stream_loaded_more', {
        loaded_tweet_count: older.length,
        has_more: canLoadMore,
      })
    } catch {
      // Keep the sentinel active so scrolling can retry after a network hiccup.
    } finally {
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [hasMore, view])

  useEffect(() => {
    const controller = new AbortController()
    let polling = false
    const poll = async () => {
      if (polling) return
      polling = true
      try {
        const params = new URLSearchParams()
        if (updateCursor.current) {
          params.set('after', updateCursor.current.observedAt)
          params.set('afterId', updateCursor.current.id)
        }
        const res = await fetch(`/api/portal/stream?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!res.ok) {
          setStreamUnavailable(true)
          return
        }
        setStreamUnavailable(false)
        const { tweets, updateCursor: nextUpdateCursor } =
          (await res.json()) as {
            tweets: PortalTweet[]
            updateCursor?: { observedAt: string; id: string } | null
          }
        const responseCursor = nextUpdateCursor ?? newestCursor(tweets)
        if (responseCursor) updateCursor.current = responseCursor
        const fresh = tweets
          .filter((t) => !seenIds.current.has(t.id))
          .sort(
            (a, b) =>
              new Date(a.observedAt).getTime() -
                new Date(b.observedAt).getTime() || compareTweetIds(a.id, b.id),
          )
        if (fresh.length > 0) {
          fresh.forEach((t) => seenIds.current.add(t.id))
          setVisible((current) =>
            view === 'home'
              ? selectHomepageStream([...fresh, ...current], 30)
              : [...fresh, ...current].sort(comparePortalTweetChronology),
          )
        }
      } catch {
        if (!controller.signal.aborted) setStreamUnavailable(true)
        // network hiccup; try again next poll
      } finally {
        polling = false
      }
    }
    void poll()
    const interval = window.setInterval(
      () => void poll(),
      PORTAL_STREAM_POLL_INTERVAL_MS,
    )
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [view])

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

  const Root = embedded ? 'div' : 'main'

  return (
    <Root className="min-h-screen bg-zinc-100/80 dark:bg-transparent">
      {/* ------------------------------------------------ Home ---------- */}
      {view === 'home' && (
        <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6">
          <ArchiveOverview
            stats={stats}
            generatedDate={generatedDate}
            failures={data.failures}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <div className="flex h-full min-h-0 flex-col gap-4 lg:overflow-hidden">
              <div
                className={`${CARD} flex min-h-[420px] flex-col lg:h-[420px] lg:min-h-[420px] lg:flex-none lg:overflow-hidden lg:[contain:size]`}
              >
                <PanelHeader
                  title="Live stream"
                  live
                  action={{
                    label: 'Open firehose',
                    href: '/stream',
                    analyticsDestination: 'live_stream',
                  }}
                />
                <div
                  role="region"
                  aria-label="Live tweet stream"
                  tabIndex={0}
                  className="flex max-h-[420px] flex-col overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60 lg:max-h-none lg:min-h-0 lg:flex-1 [&::-webkit-scrollbar]:hidden"
                >
                  {visible.slice(0, HOME_LIVE_STREAM_LIMIT).map((t, i) => (
                    <TweetCard
                      key={t.id}
                      tweet={t}
                      compact
                      noClamp
                      animate={i === 0}
                      clickable
                      origin="home"
                      returnTo="/"
                    />
                  ))}
                  {visible.length === 0 && streamUnavailable && (
                    <PanelUnavailable message="Live stream is temporarily unavailable." />
                  )}
                  {visible.length === 0 && !streamUnavailable && (
                    <div
                      className={`px-4 py-8 text-center text-[13px] ${MUTED}`}
                    >
                      Waiting for the firehose…
                    </div>
                  )}
                </div>
              </div>

              {(recentBanger ||
                historicalBanger ||
                data.failures.recentBangers ||
                data.failures.historicalBangers) && (
                <div className="grid grid-cols-1 gap-4">
                  {(recentBanger || data.failures.recentBangers) && (
                    <div
                      className={`${CARD} flex min-w-0 flex-col overflow-hidden lg:min-h-[320px]`}
                    >
                      <PanelHeader
                        title="Banger of the moment"
                        action={{
                          label: 'Recent bangers',
                          href: BANGERS_WEEK_HREF,
                          analyticsDestination: 'recent_bangers',
                        }}
                      />
                      {recentBanger ? (
                        <div className="flex flex-1 flex-col [&>article]:flex-1">
                          <TweetCard
                            tweet={recentBanger}
                            collapsible
                            clickable
                            origin="home"
                            returnTo="/"
                          />
                        </div>
                      ) : (
                        <PanelUnavailable message="Recent bangers are temporarily unavailable." />
                      )}
                    </div>
                  )}

                  {(historicalBanger || data.failures.historicalBangers) && (
                    <div
                      className={`${CARD} flex min-w-0 flex-col overflow-hidden lg:min-h-[320px]`}
                    >
                      <PanelHeader
                        title="Historical Banger"
                        action={{
                          label: 'All-time bangers',
                          href: BANGERS_ALL_TIME_HREF,
                          analyticsDestination: 'all_time_bangers',
                        }}
                      />
                      {historicalBanger ? (
                        <div className="flex flex-1 flex-col [&>article]:flex-1">
                          <TweetCard
                            tweet={historicalBanger}
                            collapsible
                            showDate
                            clickable
                            origin="home"
                            returnTo="/"
                          />
                        </div>
                      ) : (
                        <PanelUnavailable message="Historical bangers are temporarily unavailable." />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {digestPreview ? (
                <Link
                  href={digestPreview.href}
                  onClick={() =>
                    captureDashboardDestination('daily_digest', 'card', false)
                  }
                  className="group rounded-[4px] border border-blue-200 bg-blue-50 px-5 py-5 transition-colors hover:border-brand/60 dark:border-blue-900 dark:bg-blue-950/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-bold">
                      Latest Daily Digest
                    </span>
                    <span className="text-[12px] font-semibold text-brand">
                      Read →
                    </span>
                  </div>
                  <p
                    className={`mt-2 line-clamp-3 text-[13px] leading-5 ${MUTED}`}
                  >
                    {digestPreview.executiveSummary}
                  </p>
                  <div className={`mt-3 text-[11.5px] ${MUTED}`}>
                    {digestPreview.digestDate} · {digestPreview.storyCount}{' '}
                    stories ·{' '}
                    {digestPreview.storyTitles.slice(0, 3).join(' · ')}
                  </div>
                </Link>
              ) : null}
              <div className={`${CARD} flex flex-col`}>
                <PanelHeader
                  title="Trending terms · 7 days"
                  action={{
                    label: isMember ? 'Trends explorer' : 'Sign in for Trends',
                    href: isMember ? '/trends' : signInHref('/trends'),
                    analyticsDestination: 'trends',
                  }}
                />
                <div className="flex flex-1 flex-col justify-evenly px-4 pb-3 pt-2">
                  {data.failures.trends ? (
                    <PanelUnavailable message="Trending terms are temporarily unavailable." />
                  ) : weeklyBars.length > 0 ? (
                    <div
                      className={`flex items-center gap-2 pb-1 text-[9px] font-medium uppercase tracking-wide ${MUTED}`}
                    >
                      <span className="w-[82px]" />
                      <span className="w-[46px] text-right">Tweets</span>
                      <span className="flex-1">Volume</span>
                      <span className="w-[46px] text-right">Change</span>
                    </div>
                  ) : null}
                  {!data.failures.trends &&
                    weeklyBars.map((b) => (
                      <div
                        key={b.term}
                        className="flex items-center gap-2 py-[6px]"
                      >
                        <span className="w-[82px] truncate text-[12px] font-semibold">
                          {b.term}
                        </span>
                        <span className="w-[46px] text-right text-[11px] tabular-nums text-muted-foreground">
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
                          className={`w-[46px] text-right text-[11px] font-bold tabular-nums ${
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
                  {!data.failures.trends && weeklyBars.length === 0 && (
                    <div className={`py-8 text-center text-[13px] ${MUTED}`}>
                      No watchlist activity in the last seven days.
                    </div>
                  )}
                </div>
              </div>
              <div className={CARD}>
                <PanelHeader
                  title="Featured research"
                  action={{
                    label: 'All research',
                    href: '/research',
                    analyticsDestination: 'research',
                  }}
                />
                <div className="flex flex-col">
                  {data.failures.research ? (
                    <PanelUnavailable message="Featured research is temporarily unavailable." />
                  ) : (
                    data.research.slice(0, 4).map((post) => (
                      <a
                        key={post.url}
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          captureDashboardDestination(
                            'research_article',
                            'list',
                            true,
                          )
                        }
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
                    ))
                  )}
                  {!data.failures.research && data.research.length === 0 && (
                    <a
                      href={RESEARCH_SOURCE.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        captureDashboardDestination(
                          'research_article',
                          'list',
                          true,
                        )
                      }
                      className={`px-4 py-6 text-center text-[13px] ${MUTED} hover:text-brand`}
                    >
                      Read the latest research at {RESEARCH_SOURCE.name} →
                    </a>
                  )}
                </div>
              </div>
              <a
                href={ARCHIVE_EXPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  captureDashboardDestination('data_export', 'card', true)
                }
                className={`${CARD} group flex items-center gap-3 px-4 py-4 transition-colors hover:border-brand/60`}
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[4px] border border-zinc-200 bg-zinc-50 text-brand dark:border-[#2a2a2e] dark:bg-[#121214]">
                  <FaDatabase className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold">
                    Export the archive
                  </span>
                  <span
                    className={`mt-0.5 block text-[12px] leading-snug ${MUTED}`}
                  >
                    Download the latest public Parquet release
                  </span>
                </span>
                <span className="flex-shrink-0 text-[12px] font-semibold text-brand">
                  Download →
                </span>
              </a>
              <a
                href={COMMUNITY_BUILDS_URL}
                onClick={() =>
                  captureDashboardDestination('community_builds', 'card', false)
                }
                className={`${CARD} group flex items-center gap-3 px-4 py-4 transition-colors hover:border-brand/60`}
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[4px] border border-zinc-200 bg-zinc-50 text-brand dark:border-[#2a2a2e] dark:bg-[#121214]">
                  <FaUsers className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold">
                    Community Builds
                  </span>
                  <span
                    className={`mt-0.5 block text-[12px] leading-snug ${MUTED}`}
                  >
                    Projects made with Community Archive data
                  </span>
                </span>
                <span className="flex-shrink-0 text-[12px] font-semibold text-brand">
                  Explore →
                </span>
              </a>
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
              <LiveStreamHeading
                stats={stats}
                unavailable={data.failures.liveAnalytics}
              />
              <div className={`mb-3.5 text-[13px] ${MUTED}`}>
                Tweets arriving from the browser-extension firehose, as
                contributors read their timelines.
              </div>
              <div className={`${CARD} overflow-hidden`}>
                {visible.map((t, i) => (
                  <TweetCard
                    key={t.id}
                    tweet={t}
                    animate={i === 0}
                    showArchivedBadge
                    origin="stream"
                    returnTo="/stream"
                  />
                ))}
                {visible.length === 0 && streamUnavailable && (
                  <PanelUnavailable message="Live stream is temporarily unavailable." />
                )}
                {visible.length === 0 && !streamUnavailable && (
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
              {data.failures.trends ? (
                <>
                  <h2 className="mb-3 text-[18px] font-semibold" style={SERIF}>
                    Trends in ideas
                  </h2>
                  <div className={CARD}>
                    <PanelUnavailable message="Trends are temporarily unavailable." />
                  </div>
                </>
              ) : (
                <TrendsView trends={trends} risers={risers} fallers={fallers} />
              )}
            </div>
          </div>
        </div>
      )}
    </Root>
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
