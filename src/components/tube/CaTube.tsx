'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CARD, FAINT, MUTED, SERIF } from '@/components/portal/styles'
import { tweetPermalinkHref, userProfileHref } from '@/lib/navigation'
import {
  EMPTY_TUBE_STATE,
  rankTube,
  tubeThumbnail,
  upNext,
  type TubeData,
  type TubeState,
  type TubeTab,
  type TubeVideo,
} from '@/lib/tube'

const DATA_URL = '/tube/videos.json'
const STORAGE_KEY = 'ca-tube:v1'
const PAGE = 48

const TABS: { id: TubeTab; label: string; hint: string }[] = [
  { id: 'foryou', label: 'For you', hint: 'Learns from what you watch and like, in this browser only.' },
  { id: 'top', label: 'Most shared', hint: 'Shared by the most distinct accounts.' },
  { id: 'recent', label: 'Recently shared', hint: 'Ordered by the latest share.' },
  { id: 'deep', label: 'Deep cuts', hint: 'Two or three sharers, lots of love per share.' },
]

function loadState(): TubeState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...EMPTY_TUBE_STATE, ...JSON.parse(raw) } : EMPTY_TUBE_STATE
  } catch {
    return EMPTY_TUBE_STATE
  }
}

function saveState(state: TubeState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private windows can refuse storage; recommendations just reset.
  }
}

function toggle(list: string[], id: string, on: boolean): string[] {
  const rest = list.filter((x) => x !== id)
  return on ? [...rest, id].slice(-500) : rest
}

function year(epoch: number) {
  return new Date(epoch * 1000).getUTCFullYear()
}

function urlVideoId(): string | null {
  const v = new URLSearchParams(window.location.search).get('v')
  return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null
}

export function CaTube() {
  const [data, setData] = useState<TubeData | null>(null)
  const [error, setError] = useState(false)
  const [state, setState] = useState<TubeState>(EMPTY_TUBE_STATE)
  const [tab, setTab] = useState<TubeTab>('foryou')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [seed, setSeed] = useState(1)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    setState(loadState())
    setSeed(Math.floor(Math.random() * 1e9))
    setCurrent(urlVideoId())
    const onPop = () => setCurrent(urlVideoId())
    window.addEventListener('popstate', onPop)
    fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true))
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const update = useCallback((fn: (s: TubeState) => TubeState) => {
    setState((s) => {
      const next = fn(s)
      saveState(next)
      return next
    })
  }, [])

  const open = useCallback(
    (id: string | null) => {
      setCurrent(id)
      const url = id ? `/tube?v=${id}` : '/tube'
      window.history.pushState(null, '', url)
      window.scrollTo({ top: 0 })
      if (id) update((s) => ({ ...s, watched: toggle(s.watched, id, true) }))
    },
    [update],
  )

  const byId = useMemo(
    () => new Map(data?.videos.map((v) => [v.id, v]) ?? []),
    [data],
  )

  // Rank once per tab/seed; liking or watching re-ranks on the next visit to
  // the grid rather than reshuffling cards under the cursor.
  const ranked = useMemo(
    () => (data ? rankTube(data, state, tab, seed) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, tab, seed, current === null, state.hidden],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ranked
    return ranked.filter(
      (v) =>
        v.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q),
    )
  }, [ranked, query])

  const video = current ? byId.get(current) : undefined

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => open(null)}
            className="text-left text-3xl tracking-tight text-zinc-900 dark:text-white"
            style={SERIF}
          >
            CA Tube
          </button>
          <p className={`mt-1 max-w-2xl text-sm ${MUTED}`}>
            {data
              ? `${data.videos.length.toLocaleString()} YouTube videos shared by at least two Community Archive accounts.`
              : 'YouTube videos the Community Archive keeps sharing.'}{' '}
            No login, no algorithmic thumbnails: recommendations live in your
            browser and every thumbnail is a frame from mid-video.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE)
            if (current) open(null)
          }}
          placeholder="Search titles and channels"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-[#33333a] dark:bg-[#1b1b1e] dark:text-white sm:w-72"
        />
      </header>

      {error && (
        <p className={`text-sm ${MUTED}`}>Could not load the video list.</p>
      )}
      {!data && !error && <p className={`text-sm ${MUTED}`}>Loading…</p>}

      {data && video && (
        <Watch
          video={video}
          next={upNext(data, video, state)}
          state={state}
          onOpen={open}
          onLike={(on) =>
            update((s) => ({ ...s, liked: toggle(s.liked, video.id, on) }))
          }
          onHide={() => {
            update((s) => ({ ...s, hidden: toggle(s.hidden, video.id, true) }))
            open(null)
          }}
        />
      )}

      {data && !video && (
        <>
          <nav className="mb-2 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id)
                  setLimit(PAGE)
                }}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  tab === t.id
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-[#232327] dark:text-[#d9d9de] dark:hover:bg-[#2c2c31]'
                }`}
              >
                {t.label}
              </button>
            ))}
            {tab === 'foryou' && (
              <button
                type="button"
                onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
                className={`px-2 text-sm underline-offset-2 hover:underline ${MUTED}`}
              >
                Shuffle
              </button>
            )}
          </nav>
          <p className={`mb-4 text-xs ${FAINT}`}>
            {TABS.find((t) => t.id === tab)?.hint}
            {tab === 'foryou' &&
              ` ${state.watched.length} watched · ${state.liked.length} liked.`}
            {tab === 'foryou' &&
              (state.watched.length > 0 || state.hidden.length > 0) && (
                <button
                  type="button"
                  className="ml-2 underline underline-offset-2"
                  onClick={() => update(() => EMPTY_TUBE_STATE)}
                >
                  Forget my history
                </button>
              )}
          </p>
          <Grid videos={filtered.slice(0, limit)} state={state} onOpen={open} />
          {filtered.length > limit && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className="rounded-full bg-zinc-100 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-200 dark:bg-[#232327] dark:text-[#d9d9de]"
              >
                Show more
              </button>
            </div>
          )}
          {filtered.length === 0 && (
            <p className={`text-sm ${MUTED}`}>Nothing matches “{query}”.</p>
          )}
          <p className={`mt-12 text-xs ${FAINT}`}>
            Built from links in archived tweets. The full list, with
            co-sharing neighbours, is{' '}
            <a href={DATA_URL} className="underline underline-offset-2">
              one JSON file
            </a>
            ; point your Claude at it and make your own.
          </p>
        </>
      )}
    </main>
  )
}

function Grid({
  videos,
  state,
  onOpen,
  compact = false,
}: {
  videos: TubeVideo[]
  state: TubeState
  onOpen: (id: string) => void
  compact?: boolean
}) {
  const watched = new Set(state.watched)
  return (
    <ul
      className={
        compact
          ? 'grid gap-4'
          : 'grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      }
    >
      {videos.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => onOpen(v.id)}
            className={`group w-full text-left ${compact ? 'flex gap-3' : ''}`}
          >
            <div
              className={`relative aspect-video overflow-hidden rounded-lg bg-zinc-200 dark:bg-[#232327] ${
                compact ? 'w-40 shrink-0' : 'w-full'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tubeThumbnail(v.id)}
                alt=""
                loading="lazy"
                className={`h-full w-full object-cover transition-transform group-hover:scale-[1.03] ${
                  watched.has(v.id) ? 'opacity-50' : ''
                }`}
              />
              {watched.has(v.id) && (
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  watched
                </span>
              )}
            </div>
            <div className={compact ? 'min-w-0' : 'mt-2'}>
              <div className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-white">
                {v.title}
              </div>
              <div className={`mt-0.5 truncate text-xs ${MUTED}`}>{v.channel}</div>
              <div className={`text-xs ${FAINT}`}>
                {v.n} sharers · since {year(v.first)}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Watch({
  video,
  next,
  state,
  onOpen,
  onLike,
  onHide,
}: {
  video: TubeVideo
  next: TubeVideo[]
  state: TubeState
  onOpen: (id: string) => void
  onLike: (on: boolean) => void
  onHide: () => void
}) {
  const liked = state.liked.includes(video.id)
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section>
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            key={video.id}
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
        <h2 className="mt-4 text-xl text-zinc-900 dark:text-white" style={SERIF}>
          {video.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span className={MUTED}>{video.channel}</span>
          <button
            type="button"
            onClick={() => onLike(!liked)}
            className={`rounded-full px-3 py-1 ${
              liked
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-700 dark:bg-[#232327] dark:text-[#d9d9de]'
            }`}
          >
            {liked ? 'Liked' : 'Like'}
          </button>
          <button
            type="button"
            onClick={onHide}
            className={`rounded-full bg-zinc-100 px-3 py-1 dark:bg-[#232327] ${MUTED}`}
          >
            Not for me
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noreferrer"
            className={`underline-offset-2 hover:underline ${MUTED}`}
          >
            Open on YouTube
          </a>
        </div>
        <div className={`${CARD} mt-6 p-4`}>
          <div className={`mb-3 text-xs ${FAINT}`}>
            Shared by {video.n} accounts between {year(video.first)} and{' '}
            {year(video.last)}
          </div>
          <ul className="space-y-2 text-sm">
            {video.ex.map(([tweetId, username, likes]) => (
              <li key={tweetId} className="flex items-baseline justify-between gap-3">
                <Link
                  href={userProfileHref(username)}
                  className="truncate text-zinc-800 hover:underline dark:text-[#d9d9de]"
                >
                  @{username || 'unknown'}
                </Link>
                <Link
                  href={tweetPermalinkHref(tweetId)}
                  className={`shrink-0 text-xs hover:underline ${MUTED}`}
                >
                  {likes.toLocaleString()} likes · view tweet
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <aside>
        <h3 className={`mb-3 text-xs uppercase tracking-wide ${FAINT}`}>
          Shared by the same people
        </h3>
        <Grid videos={next} state={state} onOpen={onOpen} compact />
      </aside>
    </div>
  )
}
