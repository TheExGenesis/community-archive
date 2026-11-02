'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Clock, ExternalLink, Heart, Play, ThumbsDown, ThumbsUp } from 'lucide-react'
import { tweetPermalinkHref, userProfileHref } from '@/lib/navigation'
import { decodeTweetText } from '@/lib/tweetText'
import {
  tubeShard,
  tubeThumbnail,
  timeAgo,
  upNext,
  type TubeComment,
  type TubeDetail,
} from '@/lib/tube'
import { useTube } from './TubeProvider'
import { usePlaylists, type TubePlaylist } from './usePlaylists'
import { TubeStatus, VideoList } from './VideoCards'

const STANCE: Record<string, string> = {
  strong: 'Strongly recommends',
  rec: 'Recommends',
  ref: 'Mentions',
  neg: 'Critical',
}

const shardCache = new Map<number, Promise<Record<string, TubeDetail>>>()

function loadDetail(id: string, shards: number): Promise<TubeDetail | undefined> {
  const k = tubeShard(id, shards)
  if (!shardCache.has(k)) {
    shardCache.set(
      k,
      fetch(`/tube/c/${k}.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    )
  }
  return shardCache.get(k)!.then((d) => d[id])
}

export function TubeWatch({ id }: { id: string }) {
  const { data, byId, state, watched, setLiked, setDisliked, setLater } = useTube()
  const params = useSearchParams()
  const playlists = usePlaylists()
  const [playing, setPlaying] = useState(false)
  const [detail, setDetail] = useState<TubeDetail | null | undefined>(undefined)

  const video = byId.get(id)

  useEffect(() => {
    setPlaying(false)
    setDetail(undefined)
    document.getElementById('tube-scroll')?.scrollTo({ top: 0 })
  }, [id])

  useEffect(() => {
    if (!data || !video) return
    let live = true
    loadDetail(id, data.shards)
      .then((d) => live && setDetail(d ?? null))
      .catch(() => live && setDetail(null))
    return () => {
      live = false
    }
  }, [data, video, id])

  if (!data) return <TubeStatus />
  if (!video)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        That video isn’t in CA Tube.{' '}
        <a className="underline" href={`https://www.youtube.com/watch?v=${id}`}>
          Open it on YouTube
        </a>
        .
      </p>
    )

  const liked = state.liked.includes(id)
  const disliked = state.disliked.includes(id)
  const later = state.later.includes(id)
  const listId = params.get('list') ?? undefined
  const playlist = listId ? playlists?.find((p) => p.id === listId) : undefined

  const play = () => {
    setPlaying(true)
    watched(id)
  }

  return (
    <div className="mx-auto grid max-w-[1700px] gap-6 px-4 pb-16 pt-4 sm:px-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          {playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
              title={video.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="h-full w-full"
            />
          ) : (
            <button
              type="button"
              onClick={play}
              aria-label="Play"
              className="group h-full w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tubeThumbnail(id, state.frames)}
                alt=""
                className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
              />
              <span className="absolute left-1/2 top-1/2 flex h-14 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-[#e8553f] text-white shadow-lg transition-transform group-hover:scale-110">
                <Play className="h-7 w-7 fill-current" />
              </span>
            </button>
          )}
        </div>

        <h1 className="mt-4 text-xl font-semibold leading-snug">{video.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="mr-auto">
            <div className="text-sm font-medium">{video.channel}</div>
            <div className="text-xs text-muted-foreground">
              {video.n} CA sharers · shared {yearRange(video.first, video.last)}
            </div>
          </div>
          <div className="flex overflow-hidden rounded-full bg-muted">
            <button
              type="button"
              onClick={() => setLiked(id, !liked)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-foreground/10"
            >
              <ThumbsUp className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
              {liked ? 'Liked' : 'Like'}
            </button>
            <span className="my-2 w-px bg-border" />
            <button
              type="button"
              onClick={() => setDisliked(id, !disliked)}
              aria-label="Not for me"
              title="Not for me: show less like this"
              className="px-3 py-2 hover:bg-foreground/10"
            >
              <ThumbsDown className={`h-4 w-4 ${disliked ? 'fill-current' : ''}`} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setLater(id, !later)}
            className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-foreground/10"
          >
            <Clock className="h-4 w-4" />
            {later ? 'Saved' : 'Watch later'}
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-foreground/10"
          >
            <ExternalLink className="h-4 w-4" /> YouTube
          </a>
        </div>

        <div className="mt-4 rounded-xl bg-muted p-4 text-sm">
          <div className="font-medium">
            {video.likes.toLocaleString()} likes across sharing tweets · last shared{' '}
            {timeAgo(video.last)}
            {video.type ? ` · ${video.type}` : ''}
            {video.ev === false ? ' · dated' : ''}
          </div>
          {detail?.summary && <p className="mt-2 leading-relaxed">{detail.summary}</p>}
          {detail?.why && (
            <p className="mt-2 leading-relaxed text-muted-foreground">{detail.why}</p>
          )}
          {(video.cat || video.tags?.length) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {video.cat && (
                <Tag href={`/tube?cat=${encodeURIComponent(video.cat)}`}>{video.cat}</Tag>
              )}
              {video.sub && video.cat && (
                <Tag
                  href={`/tube?cat=${encodeURIComponent(video.cat)}&sub=${encodeURIComponent(video.sub)}`}
                >
                  {video.sub}
                </Tag>
              )}
              {video.tags?.map((t) => (
                <Tag key={t} href={`/tube?q=${encodeURIComponent(t)}`}>
                  #{t}
                </Tag>
              ))}
            </div>
          )}
        </div>

        <Comments detail={detail} total={video.n} />
      </section>

      <aside className="min-w-0 space-y-6">
        {playlist && <PlaylistPanel playlist={playlist} activeId={id} />}
        <div>
          <h2 className="mb-2 text-sm font-semibold">Shared by the same people</h2>
          <VideoList videos={upNext(data, video, state)} />
        </div>
      </aside>
    </div>
  )
}

function PlaylistPanel({ playlist, activeId }: { playlist: TubePlaylist; activeId: string }) {
  const { byId } = useTube()
  const videos = playlist.ids.flatMap((id) => byId.get(id) ?? [])
  const at = videos.findIndex((v) => v.id === activeId)
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-muted px-4 py-3">
        <Link href={`/tube/playlists#${playlist.id}`} className="font-semibold hover:underline">
          {playlist.title}
        </Link>
        <div className="text-xs text-muted-foreground">
          {at + 1} / {videos.length}
        </div>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        <VideoList videos={videos} list={playlist.id} activeId={activeId} numbered />
      </div>
    </div>
  )
}

function Tag({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full bg-background px-2.5 py-1 text-xs hover:bg-background/70"
    >
      {children}
    </Link>
  )
}

function yearRange(a: number, b: number) {
  const y1 = new Date(a * 1000).getUTCFullYear()
  const y2 = new Date(b * 1000).getUTCFullYear()
  return y1 === y2 ? `in ${y1}` : `${y1}–${y2}`
}

function Comments({ detail, total }: { detail: TubeDetail | null | undefined; total: number }) {
  if (detail === undefined)
    return <div className="mt-8 h-24 animate-pulse rounded-xl bg-muted" />
  if (!detail?.comments.length) return null
  const n = detail.comments.length
  return (
    <div className="mt-8">
      <h2 className="mb-5 text-lg font-semibold">
        {n} {n === 1 ? 'tweet' : 'tweets'} from the Community Archive
        {total > n ? (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            (most liked, of {total} sharers)
          </span>
        ) : null}
      </h2>
      <ul className="space-y-6">
        {detail.comments.map((c) => (
          <CommentItem key={c.t} c={c} />
        ))}
      </ul>
    </div>
  )
}

/** Shortened t.co links become a small link marker; everything else is text. */
function TweetText({ text }: { text: string }) {
  const parts = decodeTweetText(text)
    .replace(/\s+(https?:\/\/t\.co\/\w+)/g, ' $1')
    .trim()
    .split(/(https?:\/\/t\.co\/\w+)/g)
  return (
    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
      {parts.map((p, i) =>
        /^https?:\/\/t\.co\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noreferrer"
            className="text-[#e8553f] hover:underline"
          >
            ▶ link
          </a>
        ) : (
          p
        ),
      )}
    </p>
  )
}

function CommentItem({ c }: { c: TubeComment }) {
  return (
    <li className="flex gap-3">
      <Link href={userProfileHref(c.u)} className="shrink-0">
        {c.av ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.av}
            alt=""
            loading="lazy"
            className="h-10 w-10 rounded-full bg-muted object-cover"
            onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {(c.n || c.u || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <Link href={userProfileHref(c.u)} className="font-semibold hover:underline">
            {c.n || `@${c.u}`}
          </Link>
          {c.n && <span className="text-muted-foreground">@{c.u}</span>}
          <span className="text-muted-foreground">· {timeAgo(c.c)}</span>
          {c.ru && <span className="text-muted-foreground">· replying to @{c.ru}</span>}
        </div>
        <TweetText text={c.x} />
        <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" /> {c.f.toLocaleString()}
          </span>
          {c.st && <span>{STANCE[c.st]}</span>}
          <Link href={tweetPermalinkHref(c.t)} className="hover:text-foreground hover:underline">
            View tweet
          </Link>
        </div>
      </div>
    </li>
  )
}
