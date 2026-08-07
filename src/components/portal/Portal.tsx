'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PortalData, PortalTweet, TermWeek } from '@/lib/portal/types'
import { PORTAL_ARTICLES } from './articles'
import { TweetRow, formatCount } from './TweetRow'

type ViewId = 'overview' | 'stream' | 'search' | 'trends' | 'weather' | 'notes'

const NAV: [ViewId, string][] = [
  ['overview', 'Overview'],
  ['stream', 'Stream'],
  ['search', 'Search'],
  ['trends', 'Trends'],
  ['weather', 'Weather'],
  ['notes', 'Field Notes'],
]

const STREAM_PER_MIN = 22
const CARD =
  'rounded-md border border-zinc-200 bg-white dark:border-[#26262a] dark:bg-[#1b1b1e]'
const MUTED = 'text-zinc-500 dark:text-[#a7a7b4]'
const FAINT = 'text-zinc-400 dark:text-[#6d6d78]'
const BODY = 'text-zinc-700 dark:text-[#d9d9de]'
const SERIF = {
  fontFamily: 'var(--font-petrona), Georgia, serif',
} as const

const compact = (n: number) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)

const fmtDelta = (d: number | null) =>
  d === null ? 'new' : `${d >= 0 ? '+' : '−'}${Math.abs(d)}%`

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
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[12.5px] font-semibold transition-colors ${
        active
          ? 'border-brand bg-brand/15 text-blue-600 dark:text-blue-300'
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
}: {
  title: string
  action?: { label: string; onClick: () => void }
  live?: boolean
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-[#26262a]">
      <div className="flex items-center gap-2">
        {live && (
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#2acf80]" />
        )}
        <span className="text-[13px] font-bold">{title}</span>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-[12.5px] font-semibold text-brand hover:underline"
        >
          {action.label} →
        </button>
      )}
    </div>
  )
}

export default function Portal({ data }: { data: PortalData }) {
  const { stats, trends, weather } = data
  const [view, setView] = useState<ViewId>('overview')
  const [articleId, setArticleId] = useState<string | null>(null)

  // ---- live stream state -------------------------------------------------
  const holdBack = Math.min(8, data.initialStream.length)
  const [stream, setStream] = useState<{
    visible: PortalTweet[]
    queue: PortalTweet[]
    ticks: number
  }>(() => ({
    visible: data.initialStream.slice(holdBack),
    queue: data.initialStream.slice(0, holdBack).reverse(),
    ticks: 0,
  }))
  const { visible, ticks } = stream
  const [paused, setPaused] = useState(false)
  const [streamFilter, setStreamFilter] = useState('all')
  const seenIds = useRef<Set<string>>(
    new Set(data.initialStream.map((t) => t.id)),
  )

  useEffect(() => {
    if (paused) return
    const interval = setInterval(
      () => {
        setStream((s) => {
          if (s.queue.length === 0) return s
          const [next, ...rest] = s.queue
          return {
            visible: [next, ...s.visible].slice(0, 40),
            queue: rest,
            ticks: s.ticks + 1,
          }
        })
      },
      Math.max(800, 60_000 / STREAM_PER_MIN),
    )
    return () => clearInterval(interval)
  }, [paused])

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/portal/stream')
        if (!res.ok) return
        const { tweets } = (await res.json()) as { tweets: PortalTweet[] }
        const fresh = tweets
          .filter((t) => !seenIds.current.has(t.id))
          .sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )
        if (fresh.length > 0) {
          fresh.forEach((t) => seenIds.current.add(t.id))
          setStream((s) => ({ ...s, queue: [...s.queue, ...fresh] }))
        }
      } catch {
        // network hiccup; try again next poll
      }
    }, 45_000)
    return () => clearInterval(poll)
  }, [])

  const liveCount = (stats.totalTweets + ticks).toLocaleString('en-US')

  const go = useCallback((v: ViewId) => {
    setView(v)
    setArticleId(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }, [])

  // ---- derived trend views ----------------------------------------------
  const weeklyRanked = useMemo(
    () => [...trends.weekly].sort((a, b) => b.last7 - a.last7),
    [trends.weekly],
  )
  const weeklyBars = weeklyRanked.slice(0, 6)
  const maxWeekly = Math.max(...weeklyBars.map((w) => w.last7), 1)
  const withDelta = useMemo(
    () =>
      trends.weekly.filter((w) => w.deltaPct !== null && w.prev7 >= 5) as (TermWeek & {
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
    <div className="min-h-screen">
      {/* Portal nav bar */}
      <div className="sticky top-16 z-40 border-b border-zinc-200 bg-background/90 backdrop-blur-md dark:border-[#26262a]">
        <div className="mx-auto flex h-12 max-w-[1320px] items-center gap-5 px-4 sm:px-6">
          <div className="flex flex-1 gap-0.5 overflow-x-auto">
            {NAV.map(([id, label]) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={`whitespace-nowrap rounded px-3 py-[7px] text-[13px] transition-colors ${
                  view === id
                    ? 'bg-zinc-200/70 font-bold text-foreground dark:bg-[#26262a]'
                    : `font-semibold ${MUTED} hover:text-foreground`
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className={`hidden flex-shrink-0 items-center gap-[7px] text-[12px] sm:flex ${MUTED}`}
          >
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#2acf80]" />
            <span className="tabular-nums">{liveCount} tweets</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ Overview ------ */}
      {view === 'overview' && (
        <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6">
          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[26px] font-semibold" style={SERIF}>
              The archive today
            </h1>
            <span className={`text-[12.5px] ${MUTED}`}>{generatedDate}</span>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Tweets archived"
              value={stats.totalTweets.toLocaleString('en-US')}
              note={`+${stats.streamedToday.toLocaleString('en-US')} streamed today`}
              noteClass="text-[#16a34a] dark:text-[#2acf80]"
            />
            <StatCard
              label="Contributing accounts"
              value={stats.accountCount.toLocaleString('en-US')}
              note={
                stats.joinedThisWeek > 0
                  ? `${stats.joinedThisWeek} upload${stats.joinedThisWeek === 1 ? '' : 's'} this week`
                  : 'volunteered archives'
              }
            />
            <StatCard
              label="Liked tweets"
              value={compact(stats.totalLikes)}
              note="across the corpus"
            />
            <StatCard
              label="Corpus span"
              value={`${stats.firstYear}–${stats.currentYear}`}
              note={`${stats.currentYear - stats.firstYear} years of discourse`}
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.45fr_1fr]">
            <div className="flex flex-col gap-4">
              <div className={CARD}>
                <PanelHeader
                  title="Live stream"
                  live
                  action={{ label: 'Open firehose', onClick: () => go('stream') }}
                />
                <div className="flex flex-col">
                  {visible.slice(0, 5).map((t, i) => (
                    <TweetRow key={t.id} tweet={t} compact animate={i === 0} />
                  ))}
                  {visible.length === 0 && (
                    <div className={`px-4 py-8 text-center text-[13px] ${MUTED}`}>
                      Waiting for the firehose…
                    </div>
                  )}
                </div>
              </div>

              <div className={CARD}>
                <PanelHeader
                  title="Trending terms · 7 days"
                  action={{ label: 'Trends explorer', onClick: () => go('trends') }}
                />
                <div className="flex flex-col px-4 pb-3 pt-2">
                  {weeklyBars.map((b) => (
                    <div key={b.term} className="flex items-center gap-3 py-[5px]">
                      <span className="w-[130px] truncate text-[13px] font-semibold">
                        {b.term}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-[#26262a]">
                        <div
                          className={`h-full rounded ${
                            (b.deltaPct ?? 0) >= 0
                              ? 'bg-brand'
                              : 'bg-zinc-400 dark:bg-[#52525c]'
                          }`}
                          style={{ width: `${(b.last7 / maxWeekly) * 100}%` }}
                        />
                      </div>
                      <span
                        className={`w-[52px] text-right text-[12px] font-bold tabular-nums ${
                          (b.deltaPct ?? 0) >= 0
                            ? 'text-[#16a34a] dark:text-[#2acf80]'
                            : 'text-[#dc2626] dark:text-[#f87171]'
                        }`}
                      >
                        {fmtDelta(b.deltaPct)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className={`${CARD} p-4`}>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[13px] font-bold">Memetic weather</span>
                  <button
                    onClick={() => go('weather')}
                    className="text-[12.5px] font-semibold text-brand hover:underline"
                  >
                    Full report →
                  </button>
                </div>
                <div
                  className="mb-2 text-[18px] font-semibold leading-snug"
                  style={SERIF}
                >
                  {weather.headline}
                </div>
                <div className={`text-[13px] leading-relaxed ${MUTED}`}>
                  {weather.summary}
                </div>
                <div className="mt-3.5 grid grid-cols-2 gap-2">
                  {weather.gauges.map((g) => (
                    <div
                      key={g.key}
                      className="rounded border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-[#26262a] dark:bg-[#121214]"
                    >
                      <div
                        className={`text-[10.5px] font-bold uppercase tracking-wider ${MUTED}`}
                      >
                        {g.label}
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-1.5">
                        <span className="text-[17px] font-extrabold tabular-nums">
                          {g.value}
                        </span>
                        <span
                          className="text-[10.5px] font-extrabold uppercase tracking-wide"
                          style={{ color: g.color }}
                        >
                          {g.tag}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={CARD}>
                <PanelHeader title="Field notes" />
                <div className="flex flex-col">
                  {PORTAL_ARTICLES.slice(0, 3).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setView('notes')
                        setArticleId(a.id)
                        window.scrollTo({ top: 0 })
                      }}
                      className="border-b border-zinc-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-zinc-50 dark:border-[#202023] dark:hover:bg-[#1f1f23]"
                    >
                      <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-brand">
                        {a.tag}
                      </div>
                      <div
                        className="text-[15.5px] font-semibold leading-snug"
                        style={SERIF}
                      >
                        {a.title}
                      </div>
                      <div className={`mt-1 text-[12px] ${MUTED}`}>{a.meta}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Stream -------- */}
      {view === 'stream' && (
        <div className="mx-auto max-w-[820px] px-4 py-6 sm:px-6">
          <div className="mb-1.5 flex items-center justify-between">
            <h1 className="text-[26px] font-semibold" style={SERIF}>
              Live stream
            </h1>
            <Chip active={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? '▶ Resume' : '❚❚ Pause'}
            </Chip>
          </div>
          <div className={`mb-3.5 text-[13px] ${MUTED}`}>
            Tweets arriving from the browser-extension firehose, as contributors
            read their timelines.
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {['all', ...Array.from(new Set(visible.map((t) => t.username))).slice(0, 5)].map(
              (h) => (
                <Chip
                  key={h}
                  active={streamFilter === h}
                  onClick={() => setStreamFilter(h)}
                >
                  {h === 'all' ? 'All accounts' : `@${h}`}
                </Chip>
              ),
            )}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            {visible
              .filter((t) => streamFilter === 'all' || t.username === streamFilter)
              .slice(0, 14)
              .map((t, i) => (
                <TweetRow
                  key={t.id}
                  tweet={t}
                  animate={streamFilter === 'all' && i === 0}
                  showArchivedBadge
                />
              ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Search -------- */}
      {view === 'search' && <SearchView totalTweets={stats.totalTweets} />}

      {/* ------------------------------------------------ Trends -------- */}
      {view === 'trends' && (
        <TrendsView trends={trends} risers={risers} fallers={fallers} />
      )}

      {/* ------------------------------------------------ Weather ------- */}
      {view === 'weather' && <WeatherView data={data} />}

      {/* ------------------------------------------------ Notes --------- */}
      {view === 'notes' && (
        <NotesView
          articleId={articleId}
          openArticle={(id) => {
            setArticleId(id)
            window.scrollTo({ top: 0 })
          }}
          close={() => setArticleId(null)}
        />
      )}
    </div>
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
// Search view
// ---------------------------------------------------------------------------

function SearchView({ totalTweets }: { totalTweets: number }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PortalTweet[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [sort, setSort] = useState<'top' | 'new' | 'old'>('top')

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/portal/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        const { tweets } = (await res.json()) as { tweets: PortalTweet[] }
        setResults(tweets)
        setSearched(true)
      } catch {
        // aborted or failed; keep prior results
      } finally {
        setLoading(false)
      }
    }, 450)
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [query])

  const sorted = useMemo(() => {
    const r = [...results]
    if (sort === 'top') r.sort((a, b) => b.likes - a.likes)
    if (sort === 'new')
      r.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    if (sort === 'old')
      r.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
    return r
  }, [results, sort])

  const countLabel = loading
    ? 'searching…'
    : searched
      ? `${results.length}${results.length === 20 ? '+' : ''} matches`
      : `search ${compact(totalTweets)} tweets`

  return (
    <div className="mx-auto max-w-[820px] px-4 py-6 sm:px-6">
      <h1 className="mb-1.5 text-[26px] font-semibold" style={SERIF}>
        Search the corpus
      </h1>
      <div className={`mb-4 text-[13px] ${MUTED}`}>
        Full-text search over {compact(totalTweets)} tweets from volunteered
        archives.
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tweets, e.g. “egregore”, “touch grass”, “ai agents”…"
        className={`w-full rounded-md border border-zinc-300 bg-white px-4 py-3 text-[15px] outline-none transition-colors focus:border-brand dark:border-[#2c2c30] dark:bg-[#1b1b1e]`}
      />
      <div className="my-3.5 flex items-center justify-between">
        <div className="flex gap-1.5">
          {(
            [
              ['top', 'Top'],
              ['new', 'Newest'],
              ['old', 'Oldest'],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} active={sort === id} onClick={() => setSort(id)}>
              {label}
            </Chip>
          ))}
        </div>
        <span className={`text-[12.5px] tabular-nums ${MUTED}`}>{countLabel}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {sorted.map((t) => (
          <div key={t.id} className={`${CARD} overflow-hidden`}>
            <TweetRow tweet={t} showDate />
          </div>
        ))}
      </div>
      {searched && !loading && results.length === 0 && (
        <div className={`py-10 text-center text-[14px] ${MUTED}`}>
          No tweets match “{query.trim()}” in the archive.
        </div>
      )}
      {!searched && !loading && (
        <div className={`py-10 text-center text-[14px] ${FAINT}`}>
          Results appear as you type. Try “egregore”, “vibecamp”, or “touch
          grass”.
        </div>
      )}
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
    Object.fromEntries(
      trends.series.map((s, i) => [s.term, i < 4]),
    ),
  )

  const activeSeries = trends.series.filter((s) => enabled[s.term])
  const maxVal = Math.max(
    5,
    ...activeSeries.flatMap((s) => s.perYear),
  )
  const niceMax = Math.ceil(maxVal / 3) * 3

  const W = 800
  const H = 270
  const X0 = 44
  const X1 = 760
  const Y0 = 244
  const Y1 = 24
  const xs = trends.years.map(
    (_, i) =>
      X0 + (i * (X1 - X0)) / Math.max(trends.years.length - 1, 1),
  )
  const yOf = (v: number) => Y0 - (v / niceMax) * (Y0 - Y1)
  const gridVals = [0, niceMax / 3, (2 * niceMax) / 3, niceMax]

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6">
      <h1 className="mb-1.5 text-[26px] font-semibold" style={SERIF}>
        Trends in ideas
      </h1>
      <div className={`mb-4 text-[13px] ${MUTED}`}>
        Term frequency per 100k tweets, {trends.years[0]}–
        {trends.years[trends.years.length - 1]}. An ngram viewer for the
        vocabulary of one corner of the internet. Recomputed daily from the full
        corpus.
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {trends.series.map((s) => (
          <Chip
            key={s.term}
            active={!!enabled[s.term]}
            onClick={() =>
              setEnabled((e) => ({ ...e, [s.term]: !e[s.term] }))
            }
          >
            <span
              className="h-[9px] w-[9px] rounded-full"
              style={{ background: s.color, opacity: enabled[s.term] ? 1 : 0.35 }}
            />
            {s.term}
          </Chip>
        ))}
      </div>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            {fmtDelta(m.deltaPct)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Weather view
// ---------------------------------------------------------------------------

function WeatherView({ data }: { data: PortalData }) {
  const { weather } = data
  const issued = new Date(weather.issuedAt)
  const issuedLabel = `${issued.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })}, ${String(issued.getUTCHours()).padStart(2, '0')}:${String(
    issued.getUTCMinutes(),
  ).padStart(2, '0')} UTC`

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
      <h1 className="mb-1.5 text-[26px] font-semibold" style={SERIF}>
        Memetic weather report
      </h1>
      <div className={`mb-4 text-[13px] ${MUTED}`}>
        Issued {issuedLabel} · derived daily from the live corpus
      </div>

      <div className={`${CARD} mb-4 px-7 py-6`}>
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-brand">
          Bulletin
        </div>
        <div
          className="mb-4 text-[21px] font-semibold leading-normal"
          style={SERIF}
        >
          {weather.headline}.
        </div>
        <div className={`flex flex-col gap-3 text-[14.5px] leading-[1.7] ${BODY}`}>
          <p>
            <strong className="text-foreground">Synopsis.</strong>{' '}
            {weather.synopsis}
          </p>
          <p>
            <strong className="text-foreground">Outlook.</strong>{' '}
            {weather.outlookText}
          </p>
          <p>
            <strong className="text-foreground">Advisories.</strong>{' '}
            {weather.advisoriesText}
          </p>
        </div>
      </div>

      <div className={`${CARD} mb-4 p-5`}>
        <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.1em] text-brand">
          Instruments
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
          {weather.gauges.map((g) => (
            <div key={g.key}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[13px] font-bold">{g.label}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[16px] font-extrabold tabular-nums">
                    {g.value}
                  </span>
                  <span
                    className="text-[10.5px] font-extrabold uppercase tracking-wide"
                    style={{ color: g.color }}
                  >
                    {g.tag}
                  </span>
                </span>
              </div>
              <div className="h-[9px] overflow-hidden rounded-[5px] bg-zinc-100 dark:bg-[#26262a]">
                <div
                  className="h-full rounded-[5px]"
                  style={{ width: `${g.value}%`, background: g.color }}
                />
              </div>
              <div className={`mt-1 text-[12px] leading-snug ${MUTED}`}>
                {g.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={CARD}>
          <PanelHeader title="⚠ Active advisories" />
          {weather.advisories.map((a) => (
            <div
              key={a.title}
              className="border-b border-zinc-100 px-4 py-2.5 last:border-b-0 dark:border-[#202023]"
            >
              <div className="text-[13px] font-bold text-[#b45309] dark:text-[#fbbf24]">
                {a.title}
              </div>
              <div className={`mt-0.5 text-[12.5px] leading-normal ${MUTED}`}>
                {a.body}
              </div>
            </div>
          ))}
        </div>
        <div className={CARD}>
          <PanelHeader title="5-day discourse outlook" />
          {weather.outlook.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2 last:border-b-0 dark:border-[#202023]"
            >
              <span className={`w-9 text-[12px] font-bold ${MUTED}`}>{d.day}</span>
              <span className="text-[16px]">{d.icon}</span>
              <span className={`flex-1 text-[13px] ${BODY}`}>{d.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field notes view
// ---------------------------------------------------------------------------

function NotesView({
  articleId,
  openArticle,
  close,
}: {
  articleId: string | null
  openArticle: (id: string) => void
  close: () => void
}) {
  const article = PORTAL_ARTICLES.find((a) => a.id === articleId)

  if (article) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
        <button
          onClick={close}
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
          <div className={`flex flex-col gap-4 text-[15.5px] leading-[1.75] ${BODY}`}>
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
        Field notes
      </h1>
      <div className={`mb-[18px] text-[13px] ${MUTED}`}>
        Short essays from inside the archive: how ideas enter the canon, mutate,
        and fade.
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {PORTAL_ARTICLES.map((a) => (
          <button
            key={a.id}
            onClick={() => openArticle(a.id)}
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
