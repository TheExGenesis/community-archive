'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

export type PortalView = 'home' | 'stream' | 'notes'

const STREAM_PER_MIN = 22

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
  initialArticleId,
}: {
  data: PortalData
  view: PortalView
  initialArticleId?: string
}) {
  const { stats, trends } = data

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

  // ---- derived trend views ----------------------------------------------
  const weeklyRanked = useMemo(
    () => [...trends.weekly].sort((a, b) => b.last7 - a.last7),
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

  const atlas = PORTAL_TOOLS.find((t) => t.name === 'Strand Atlas')
  const bangers = PORTAL_TOOLS.find((t) => t.name === 'Bangers')

  // Random top banger. Rendered with index 0 first, then re-picked on mount
  // so server and client HTML agree (no hydration mismatch).
  const [bangerIdx, setBangerIdx] = useState(0)
  useEffect(() => {
    if (data.bangers.length > 1) {
      setBangerIdx(Math.floor(Math.random() * data.bangers.length))
    }
  }, [data.bangers.length])
  const banger = data.bangers[bangerIdx] ?? null

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
          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-[26px] font-semibold" style={SERIF}>
              The archive today
            </h1>
            <span className="flex items-baseline gap-3">
              <LiveCounter count={liveCount} />
              <span className={`text-[12.5px] ${MUTED}`}>{generatedDate}</span>
            </span>
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
                  {weeklyBars.map((b) => (
                    <div
                      key={b.term}
                      className="flex items-center gap-3 py-[5px]"
                    >
                      <span className="w-[130px] truncate text-[13px] font-semibold">
                        {b.term}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-[#26262a]">
                        <div
                          className="h-full rounded bg-brand"
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

              {banger && (
                <div className={CARD}>
                  <PanelHeader
                    title="Banger of the moment"
                    action={
                      bangers
                        ? {
                            label: 'More bangers',
                            href: bangers.link,
                            external: true,
                          }
                        : undefined
                    }
                  />
                  <TweetRow tweet={banger} showDate />
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
              {atlas && (
                <a
                  href={atlas.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${CARD} group overflow-hidden transition-colors hover:border-brand/60`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={atlas.image}
                    alt={`${atlas.name} preview`}
                    loading="lazy"
                    className="aspect-[2/1] w-full border-b border-zinc-200 object-cover dark:border-[#26262a]"
                  />
                  <div className="flex items-start gap-2.5 px-4 py-3">
                    <span className="mt-0.5 flex-shrink-0 text-[15px] text-brand">
                      {atlas.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
                        {atlas.name}
                        <FaExternalLinkAlt className="h-2.5 w-2.5 flex-shrink-0 text-zinc-900 opacity-0 transition-opacity group-hover:opacity-70 dark:text-white" />
                      </span>
                      <span
                        className={`mt-0.5 block text-[12px] leading-snug ${MUTED}`}
                      >
                        {atlas.description}
                      </span>
                    </span>
                  </div>
                </a>
              )}

              <div className={`${CARD} flex flex-1 flex-col`}>
                <PanelHeader
                  title="AI field notes"
                  action={{ label: 'All notes', href: '/notes' }}
                />
                <div className="flex flex-1 flex-col">
                  {PORTAL_ARTICLES.slice(0, 3).map((a) => (
                    <Link
                      key={a.id}
                      href={`/notes?article=${a.id}`}
                      className="flex flex-1 flex-col justify-center border-b border-zinc-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-zinc-50 dark:border-[#202023] dark:hover:bg-[#1f1f23]"
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
                      <div className={`mt-1 text-[12px] ${MUTED}`}>
                        {a.meta}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
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
              <div className="mb-1.5 flex items-center justify-between">
                <h1 className="text-[26px] font-semibold" style={SERIF}>
                  Live stream
                </h1>
                <span className="flex items-center gap-3">
                  <LiveCounter count={liveCount} />
                  <Chip active={paused} onClick={() => setPaused((p) => !p)}>
                    {paused ? '▶ Resume' : '❚❚ Pause'}
                  </Chip>
                </span>
              </div>
              <div className={`mb-3.5 text-[13px] ${MUTED}`}>
                Tweets arriving from the browser-extension firehose, as
                contributors read their timelines.
              </div>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {[
                  'all',
                  ...Array.from(new Set(visible.map((t) => t.username))).slice(
                    0,
                    5,
                  ),
                ].map((h) => (
                  <Chip
                    key={h}
                    active={streamFilter === h}
                    onClick={() => setStreamFilter(h)}
                  >
                    {h === 'all' ? 'All accounts' : `@${h}`}
                  </Chip>
                ))}
              </div>
              <div className={`${CARD} overflow-hidden`}>
                {visible
                  .filter(
                    (t) =>
                      streamFilter === 'all' || t.username === streamFilter,
                  )
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
            <div id="trends" className="scroll-mt-32">
              <TrendsView trends={trends} risers={risers} fallers={fallers} />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Notes --------- */}
      {view === 'notes' && <NotesView initialArticleId={initialArticleId} />}
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
            {fmtDelta(m.deltaPct)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field notes view
// ---------------------------------------------------------------------------

function NotesView({ initialArticleId }: { initialArticleId?: string }) {
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
