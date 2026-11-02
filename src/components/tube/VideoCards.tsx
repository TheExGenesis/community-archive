'use client'

import Link from 'next/link'
import { tubeThumbnail, timeAgo, type TubeVideo } from '@/lib/tube'
import { useTube } from './TubeProvider'

export function watchHref(id: string, list?: string): string {
  return `/tube/watch/${id}${list ? `?list=${encodeURIComponent(list)}` : ''}`
}

function Thumb({ v, className }: { v: TubeVideo; className: string }) {
  const { state } = useTube()
  const seen = state.history.some((h) => h.id === v.id)
  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-xl bg-muted ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tubeThumbnail(v.id, state.frames)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      {seen && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-[#e8553f]" aria-label="watched" />
      )}
    </div>
  )
}

function Meta({ v }: { v: TubeVideo }) {
  return (
    <div className="text-xs text-muted-foreground">
      {v.n} sharers · {timeAgo(v.last)}
      {v.type ? ` · ${v.type}` : ''}
    </div>
  )
}

export function VideoGrid({ videos, list }: { videos: TubeVideo[]; list?: string }) {
  return (
    <ul className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {videos.map((v) => (
        <li key={v.id}>
          <Link href={watchHref(v.id, list)} className="group block">
            <Thumb v={v} className="w-full" />
            <div className="mt-3 pr-2">
              <h3 className="line-clamp-2 text-sm font-medium leading-snug">
                {v.title}
              </h3>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {v.channel}
              </div>
              <Meta v={v} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function VideoList({
  videos,
  list,
  activeId,
  numbered = false,
}: {
  videos: TubeVideo[]
  list?: string
  activeId?: string
  numbered?: boolean
}) {
  return (
    <ul className="space-y-2">
      {videos.map((v, i) => (
        <li key={v.id}>
          <Link
            href={watchHref(v.id, list)}
            className={`group flex gap-2 rounded-lg p-1 ${
              v.id === activeId ? 'bg-muted' : 'hover:bg-muted/50'
            }`}
          >
            {numbered && (
              <span className="w-5 shrink-0 self-center text-center text-xs text-muted-foreground">
                {i + 1}
              </span>
            )}
            <Thumb v={v} className="w-40 shrink-0 rounded-lg" />
            <div className="min-w-0 py-0.5">
              <h4 className="line-clamp-2 text-sm font-medium leading-snug">{v.title}</h4>
              <div className="mt-1 truncate text-xs text-muted-foreground">{v.channel}</div>
              <Meta v={v} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function TubeStatus() {
  const { data, error } = useTube()
  if (error)
    return <p className="p-6 text-sm text-muted-foreground">Could not load the video list.</p>
  if (!data) return <GridSkeleton />
  return null
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 p-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i}>
          <div className="aspect-video animate-pulse rounded-xl bg-muted" />
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function PageTitle({ children, sub }: { children: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  )
}
