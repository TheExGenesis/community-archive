'use client'

import type { ReactNode } from 'react'
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
import { PORTAL_STREAM_POLL_INTERVAL_MS } from './live'
import {
  comparePortalTweetChronology,
  selectHomepageStream,
} from '@/lib/portal/stream'
import { BANGERS_ALL_TIME_HREF, BANGERS_WEEK_HREF } from '@/lib/portal/bangers'
import { capturePostHogEvent } from '@/lib/posthog'
import type { DigestPreview } from '@/lib/digest/types'
import ExtensionInstallPrompt from '@/components/ExtensionInstallPrompt'
import { CHROME_EXTENSION_URL } from '@/lib/browserExtension'
import { PUBLIC_PORTAL_PREVIEW_LIMIT } from '@/lib/portal/access'

export type PortalView = 'home' | 'stream'

const HOME_LIVE_STREAM_LIMIT = PUBLIC_PORTAL_PREVIEW_LIMIT
const ARCHIVE_EXPORT_URL = '/docs#bulk-dump'
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

function LiveCounter({ count }: { count: number }) {
  return (
    <span
      className={`inline-flex items-center gap-[7px] text-[12px] ${MUTED}`}
      title="Archived tweet total from the latest corpus snapshot"
    >
      <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#2acf80]" />
      <span className="tabular-nums">
        {count.toLocaleString('en-US')} tweets
      </span>
    </span>
  )
}

/** Evergreen sidebar destinations. */
function UtilityLink({
  href,
  destination,
  title,
  note,
  action,
  icon,
}: {
  href: string
  destination: DashboardDestination
  title: string
  note: string
  action: string
  icon: ReactNode
}) {
  return (
    <a
      href={href}
      onClick={() => captureDashboardDestination(destination, 'card', false)}
      className={`${CARD} flex items-center gap-3 px-4 py-3 font-normal transition-colors hover:border-brand dark:hover:border-brand`}
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[4px] border border-zinc-200 bg-zinc-100 text-brand-icon dark:border-[#2a2a2e] dark:bg-[#121214]">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[12.5px] font-bold">{title}</span>
        <span className={`text-[11.5px] leading-snug ${MUTED}`}>{note}</span>
      </span>
      <span className="flex-shrink-0 text-[11.5px] font-semibold text-brand">
        {action} &rarr;
      </span>
    </a>
  )
}

function ArchiveMetric({
  value,
  label,
  note,
  noteClass,
  live = false,
  divider = false,
}: {
  value: string
  label: string
  note: string
  noteClass?: string
  live?: boolean
  divider?: boolean
}) {
  return (
    <span
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-zinc-200 py-1 dark:border-[#26262a] sm:py-0 ${
        divider ? 'sm:mr-7 sm:border-r sm:pr-7' : ''
      }`}
    >
      {live && (
        <span
          aria-hidden
          className="h-[7px] w-[7px] animate-pulse self-center rounded-full bg-[#2acf80]"
        />
      )}
      <span className="text-[20px] font-semibold tabular-nums" style={SERIF}>
        {value}
      </span>
      <span
        className={`text-[11px] font-bold uppercase tracking-[0.08em] ${MUTED}`}
      >
        {label}
      </span>
      <span className={`text-[12px] ${noteClass ?? MUTED}`}>{note}</span>
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
  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[30px] font-semibold" style={SERIF}>
          Today on the archive
        </h2>
        <span className={`text-[12.5px] ${MUTED}`}>{generatedDate}</span>
      </div>

      <div
        className={`${CARD} mb-4 flex flex-col px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center`}
      >
        <ArchiveMetric
          divider
          live={!failures.liveAnalytics}
          value={
            failures.liveAnalytics
              ? 'Unavailable'
              : stats.totalTweets.toLocaleString('en-US')
          }
          label="Tweets archived"
          note={
            failures.liveAnalytics
              ? 'Tweet totals are temporarily unavailable.'
              : `+${stats.streamedLast24Hours.toLocaleString('en-US')} in the last 24h`
          }
          noteClass={
            failures.liveAnalytics
              ? undefined
              : 'text-[#16a34a] dark:text-[#2acf80]'
          }
        />
        <ArchiveMetric
          divider
          value={
            failures.memberCount
              ? 'Unavailable'
              : stats.accountCount.toLocaleString('en-US')
          }
          label="Community members"
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
        <ArchiveMetric
          value={
            failures.corpusRange
              ? 'Unavailable'
              : `${stats.firstYear}\u2013${stats.currentYear}`
          }
          label="Corpus span"
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

/**
 * Lead story of the day. The digest is the one panel that changes wholesale
 * every morning, so it runs full width above the dashboard grid, marked by an
 * accent rule along its top edge rather than a filled surface.
 */
function DigestHero({ preview }: { preview: DigestPreview | null }) {
  if (!preview) {
    return (
      <div
        className={`${CARD} mb-4 border-t-2 border-dashed border-t-brand px-8 py-7 text-center dark:border-t-brand`}
      >
        <div
          className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${MUTED}`}
        >
          What happened yesterday
        </div>
        <p className="mt-2 text-[24px] font-medium" style={SERIF}>
          Today&rsquo;s edition is being assembled
        </p>
        <p
          className={`mx-auto mt-2 max-w-[520px] text-[13px] leading-normal ${MUTED}`}
        >
          Editions are written from a frozen 24-hour banger set and reviewed
          before publication. Yesterday&rsquo;s is still in the editorial lab.
        </p>
        <Link
          href={BANGERS_WEEK_HREF}
          onClick={() =>
            captureDashboardDestination('recent_bangers', 'card', false)
          }
          className="mt-3.5 inline-block text-[13px] font-semibold text-brand hover:underline"
        >
          Explore today&rsquo;s bangers &rarr;
        </Link>
      </div>
    )
  }

  const openDigest = () =>
    captureDashboardDestination('daily_digest', 'card', false)

  return (
    <div
      className={`${CARD} mb-4 border-t-2 border-t-brand px-6 pb-[30px] pt-7 dark:border-t-brand sm:px-8`}
    >
      <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <span className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            What happened yesterday
          </span>
          <span className={`text-[12px] tabular-nums ${MUTED}`}>
            {preview.digestDate} &middot; {preview.storyCount}{' '}
            {preview.storyCount === 1 ? 'story' : 'stories'}
            {preview.isPreview ? ' \u00b7 preview' : ''}
          </span>
        </span>
        <Link
          href={preview.href}
          onClick={openDigest}
          className="whitespace-nowrap text-[13px] font-semibold text-brand hover:underline"
        >
          Read the edition &rarr;
        </Link>
      </div>

      {preview.headline && (
        <h2
          className="mb-6 max-w-[22ch] text-[26px] font-medium leading-[1.2] tracking-[-0.01em] sm:text-[34px]"
          style={SERIF}
        >
          <Link
            href={preview.href}
            onClick={openDigest}
            className="font-medium text-foreground transition-colors hover:text-brand"
          >
            {preview.headline}
          </Link>
        </h2>
      )}

      {preview.stories.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {preview.stories.map((story, index) => (
            <div
              key={story.slug}
              className={`border-t border-zinc-200 pt-5 dark:border-[#26262a] ${
                index > 0 ? 'lg:border-l lg:pl-7' : ''
              } ${index < preview.stories.length - 1 ? 'lg:pr-7' : ''}`}
            >
              <div className="mb-2.5">
                <span className="inline-flex items-center rounded-full bg-brand/10 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-deep">
                  {story.tag}
                </span>
              </div>
              <Link
                href={`${preview.href}/${story.slug}`}
                onClick={openDigest}
                className="mb-1.5 block text-[15px] font-semibold leading-[1.35] transition-colors hover:text-brand"
              >
                {story.title}
              </Link>
              <p className={`m-0 text-[13.5px] leading-normal ${MUTED}`}>
                {story.blurb}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LiveStreamHeading({
  stats,
  unavailable,
}: {
  stats: PortalData['stats']
  unavailable: boolean
}) {
  return (
    <div className="mb-1.5 flex items-baseline gap-3">
      <h1 className="text-[26px] font-semibold" style={SERIF}>
        Live stream
      </h1>
      {!unavailable && <LiveCounter count={stats.totalTweets} />}
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
    isMember &&
      !data.failures.initialStream &&
      data.initialStream.length >= PUBLIC_PORTAL_PREVIEW_LIMIT,
  )
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const loadMore = useCallback(async () => {
    if (
      view !== 'stream' ||
      !isMember ||
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
  }, [hasMore, isMember, view])

  useEffect(() => {
    if (!isMember) return
    const controller = new AbortController()
    let polling = false
    const applyHead = (tweets: PortalTweet[], nextHasMore: boolean) => {
      const head = [...tweets].sort(comparePortalTweetChronology)
      updateCursor.current = newestCursor(head)
      pageCursor.current = oldestPageCursor(head)
      if (view === 'stream') {
        setHasMore(nextHasMore && pageCursor.current !== null)
      }
      setVisible((current) => {
        const next =
          view === 'home'
            ? selectHomepageStream([...head, ...current], 30)
            : head
        seenIds.current = new Set(next.map((tweet) => tweet.id))
        return next
      })
    }
    const fetchHead = async () => {
      const response = await fetch('/api/portal/stream', {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!response.ok) return false
      const payload = (await response.json()) as {
        tweets: PortalTweet[]
        hasMore?: boolean
      }
      applyHead(payload.tweets, payload.hasMore ?? false)
      return true
    }
    const poll = async () => {
      if (polling) return
      polling = true
      try {
        const params = new URLSearchParams()
        const requestedHead = updateCursor.current === null
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
        const {
          tweets,
          updateCursor: nextUpdateCursor,
          hasMore: nextHasMore,
          backlogTruncated,
        } = (await res.json()) as {
          tweets: PortalTweet[]
          updateCursor?: { observedAt: string; id: string } | null
          hasMore?: boolean
          backlogTruncated?: boolean
        }
        if (requestedHead) {
          applyHead(tweets, nextHasMore ?? false)
          return
        }
        if (backlogTruncated) {
          if (!(await fetchHead())) setStreamUnavailable(true)
          return
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
  }, [isMember, view])

  useEffect(() => {
    if (
      !isMember ||
      view !== 'stream' ||
      !hasMore ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }
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
  }, [hasMore, isMember, loadMore, view])

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

          <DigestHero preview={digestPreview} />

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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {(recentBanger || data.failures.recentBangers) && (
                    <div className={`${CARD} min-w-0 overflow-hidden`}>
                      <PanelHeader
                        title="Banger of the moment"
                        action={{
                          label: 'Recent bangers',
                          href: BANGERS_WEEK_HREF,
                          analyticsDestination: 'recent_bangers',
                        }}
                      />
                      {recentBanger ? (
                        <TweetCard
                          tweet={recentBanger}
                          collapsible
                          clickable
                          origin="home"
                          returnTo="/"
                        />
                      ) : (
                        <PanelUnavailable message="Recent bangers are temporarily unavailable." />
                      )}
                    </div>
                  )}

                  {(historicalBanger || data.failures.historicalBangers) && (
                    <div className={`${CARD} min-w-0 overflow-hidden`}>
                      <PanelHeader
                        title="Historical Banger"
                        action={{
                          label: 'All-time bangers',
                          href: BANGERS_ALL_TIME_HREF,
                          analyticsDestination: 'all_time_bangers',
                        }}
                      />
                      {historicalBanger ? (
                        <TweetCard
                          tweet={historicalBanger}
                          collapsible
                          showDate
                          clickable
                          origin="home"
                          returnTo="/"
                        />
                      ) : (
                        <PanelUnavailable message="Historical bangers are temporarily unavailable." />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
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
                            className="h-full rounded bg-chart-accent"
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
              <div className="flex flex-col gap-3">
                <UtilityLink
                  href={ARCHIVE_EXPORT_URL}
                  destination="data_export"
                  title="Bulk export paused"
                  note="Why the historical Parquet file is private"
                  action="Details"
                  icon={<FaDatabase className="h-[17px] w-[17px]" />}
                />
                <UtilityLink
                  href={COMMUNITY_BUILDS_URL}
                  destination="community_builds"
                  title="Community Builds"
                  note="Projects made with Community Archive data"
                  action="Explore"
                  icon={<FaUsers className="h-[17px] w-[17px]" />}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Stream -------- */}
      {view === 'stream' && (
        <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
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
            Tweets arriving from the{' '}
            <a
              href={CHROME_EXTENSION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand hover:underline"
            >
              browser extension
            </a>{' '}
            firehose, as contributors read their timelines.
          </div>
          <ExtensionInstallPrompt surface="stream" className="mb-3.5" />
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
          {!isMember && visible.length > 0 ? (
            <div className="py-5 text-center">
              <Link
                href={signInHref('/stream')}
                className="text-[12.5px] font-semibold text-brand hover:underline"
              >
                Log in to see more live-stream tweets
              </Link>
            </div>
          ) : (
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
          )}
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
