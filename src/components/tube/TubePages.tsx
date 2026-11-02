'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Play } from 'lucide-react'
import { isHiddenGem, tubeThumbnail, type TubeVideo } from '@/lib/tube'
import { useTube } from './TubeProvider'
import { usePlaylists } from './usePlaylists'
import { PageTitle, TubeStatus, VideoGrid, watchHref } from './VideoCards'

const WRAP = 'px-4 pb-16 pt-6 sm:px-6'

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>
}

export function TubeLibrary({ kind }: { kind: 'liked' | 'history' | 'later' }) {
  const { data, byId, state, clearHistory } = useTube()
  if (!data) return <TubeStatus />
  const ids =
    kind === 'history'
      ? state.history.map((h) => h.id)
      : kind === 'liked'
        ? state.liked
        : state.later
  const videos = [...ids].reverse().flatMap((id) => byId.get(id) ?? [])
  const copy = {
    liked: ['Liked', 'Videos you liked. Likes steer the Best for you ranking.', 'Nothing liked yet.'],
    history: ['History', 'What you opened, newest first.', 'Nothing watched yet.'],
    later: ['Watch later', 'Saved for later. Watching one removes it.', 'Nothing saved yet.'],
  }[kind]
  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4">
        <PageTitle sub={`${copy[1]} Stored only in this browser.`}>{copy[0]}</PageTitle>
        {kind === 'history' && videos.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="shrink-0 rounded-full bg-muted px-4 py-2 text-sm hover:bg-muted/70"
          >
            Clear history
          </button>
        )}
      </div>
      {videos.length ? <VideoGrid videos={videos} /> : <Empty>{copy[2]}</Empty>}
    </div>
  )
}

export function TubeCategories() {
  const { data } = useTube()
  const tree = useMemo(() => {
    const cats = new Map<string, Map<string, number>>()
    for (const v of data?.videos ?? []) {
      if (!v.cat) continue
      const subs = cats.get(v.cat) ?? new Map<string, number>()
      if (v.sub) subs.set(v.sub, (subs.get(v.sub) ?? 0) + 1)
      cats.set(v.cat, subs)
    }
    return Array.from(cats.entries())
      .map(([cat, subs]) => ({
        cat,
        total: (data?.videos ?? []).filter((v) => v.cat === cat).length,
        subs: Array.from(subs.entries()).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]),
      }))
      .sort((a, b) => b.total - a.total)
  }, [data])
  const channels = useMemo(() => {
    const counts = new Map<string, number>()
    for (const v of data?.videos ?? []) counts.set(v.channel, (counts.get(v.channel) ?? 0) + 1)
    return Array.from(counts.entries()).filter(([c, n]) => c && n >= 5).sort((a, b) => b[1] - a[1])
  }, [data])

  if (!data) return <TubeStatus />
  return (
    <div className={WRAP}>
      <PageTitle>Categories</PageTitle>
      <div className="mb-8 flex flex-wrap gap-2">
        {[
          ['Recently shared', '/tube?sort=recent'],
          ['Hidden gems', '/tube?gems=1'],
          ['Most shared', '/tube?sort=shared'],
          ['All videos', '/tube'],
        ].map(([label, href]) => (
          <Link key={href} href={href} className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium hover:bg-muted/70">
            {label}
          </Link>
        ))}
      </div>
      {tree.length > 0 && (
        <div className="columns-1 gap-8 sm:columns-2 xl:columns-3">
          {tree.map(({ cat, total, subs }) => (
            <section key={cat} className="mb-8 break-inside-avoid">
              <Link
                href={`/tube?cat=${encodeURIComponent(cat)}`}
                className="flex items-baseline justify-between border-b border-border pb-2 font-semibold hover:underline"
              >
                {cat} <span className="text-sm font-normal text-muted-foreground">{total}</span>
              </Link>
              <ul className="mt-2 space-y-1">
                {subs.map(([sub, n]) => (
                  <li key={sub}>
                    <Link
                      href={`/tube?cat=${encodeURIComponent(cat)}&sub=${encodeURIComponent(sub)}`}
                      className="flex justify-between text-sm text-muted-foreground first-letter:uppercase hover:text-foreground"
                    >
                      <span className="first-letter:uppercase">{sub}</span>
                      <span>{n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <section className="break-inside-avoid">
        <h2 className="mb-3 border-b border-border pb-2 font-semibold">Channels the archive returns to</h2>
        <div className="flex flex-wrap gap-2">
          {channels.map(([c, n]) => (
            <Link
              key={c}
              href={`/tube?q=${encodeURIComponent(c)}`}
              className="rounded-full bg-muted px-3 py-1 text-sm hover:bg-muted/70"
            >
              {c} <span className="text-muted-foreground">{n}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

export function TubePlaylists() {
  const { data, byId } = useTube()
  const playlists = usePlaylists()
  if (!data || !playlists) return <TubeStatus />
  const sections = Array.from(new Set(playlists.map((p) => p.section)))
  return (
    <div className={WRAP}>
      <PageTitle sub="Ordered lists built from what the archive keeps sharing.">Playlists</PageTitle>
      {sections.map((section) => (
        <section key={section} className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">{section}</h2>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {playlists
              .filter((p) => p.section === section)
              .map((p) => {
                const videos = p.ids.flatMap((id) => byId.get(id) ?? [])
                if (!videos.length) return null
                return (
                  <li key={p.id} id={p.id}>
                    <PlaylistCard id={p.id} title={p.title} blurb={p.blurb} videos={videos} />
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function PlaylistCard({
  id,
  title,
  blurb,
  videos,
}: {
  id: string
  title: string
  blurb: string
  videos: TubeVideo[]
}) {
  const { state } = useTube()
  return (
    <Link href={watchHref(videos[0].id, id)} className="group block">
      <div className="relative">
        <div className="absolute inset-x-3 -top-1.5 h-3 rounded-t-xl bg-muted-foreground/30" />
        <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tubeThumbnail(videos[0].id, state.frames)} alt="" loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
            {videos.length} videos
          </span>
          <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-4 w-4 fill-current" /> Play all
          </span>
        </div>
      </div>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{blurb}</p>
    </Link>
  )
}

export function TubeSettings() {
  const { state, setFrames, forgetAll } = useTube()
  return (
    <div className={`${WRAP} max-w-2xl`}>
      <PageTitle>Settings</PageTitle>
      <label className="flex cursor-pointer items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <div className="font-medium">Show video frames instead of thumbnails</div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Uploaders design thumbnails to grab attention. With this on, every video shows a frame
            YouTube takes from the middle of the video, so you see what it actually looks like.
          </p>
        </div>
        <input
          type="checkbox"
          checked={state.frames}
          onChange={(e) => setFrames(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-brand"
        />
      </label>
      <div className="flex items-start justify-between gap-6 pt-6">
        <div>
          <div className="font-medium">Forget me</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Clears history, likes, dislikes and watch later from this browser. Nothing is stored
            anywhere else.
          </p>
        </div>
        <button
          type="button"
          onClick={forgetAll}
          className="shrink-0 rounded-full bg-muted px-4 py-2 text-sm hover:bg-muted/70"
        >
          Clear all
        </button>
      </div>
    </div>
  )
}

export function TubeAboutStats() {
  const { data } = useTube()
  if (!data) return null
  const gems = data.videos.filter(isHiddenGem).length
  return (
    <p>
      Right now that is <strong>{data.videos.length.toLocaleString()} videos</strong>, {gems} of
      them hidden gems, with tweets up to{' '}
      {new Date(data.generated * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}.
    </p>
  )
}
