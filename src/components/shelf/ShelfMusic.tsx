'use client'

import Image from 'next/image'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Disc3, Podcast, Youtube } from 'lucide-react'
import { cn } from '@/utils/tailwind'
import { hasCover } from '@/lib/shelf/bento'
import { shelfStatus } from '@/lib/shelf/labels'
import {
  musicSleeves,
  musicSource,
  musicTracks,
  musicYears,
  type MusicSort,
} from '@/lib/shelf/music'
import type { ShelfItem, ShelfPerson } from '@/lib/shelf/types'
import { ShelfFacepile } from './ShelfFacepile'
import { ShelfMarks, ShelfTweetCount } from './ShelfMarks'

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'
// The same lift as the grid's tiles.
const LIFT =
  'transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgb(0_0_0/0.22)] hover:ring-1 hover:ring-border active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100'
/** Rows before "Show more". */
const FIRST_TRACKS = 40

/** "Listened" goes without saying in a music view; only another status is worth a word. */
const musicStatus = (item: ShelfItem) =>
  item.relation === 'experienced' ? null : shelfStatus(item)

/** Who made it; failing that, where it plays, with YouTube shown as its mark. */
export function workSource(item: ShelfItem): ReactNode {
  if (item.creator) return item.creator
  const source = musicSource(item.url)
  if (source !== 'YouTube') return source
  return (
    <Youtube
      role="img"
      aria-label="YouTube"
      className="inline-block h-3.5 w-3.5 shrink-0 align-[-0.2em]"
    />
  )
}

/** A line of parts, dot-separated, leaving out the empty ones. */
export function Byline({
  parts,
  className,
}: {
  parts: ReactNode[]
  className?: string
}) {
  const shown = parts.filter((part) => part != null && part !== '')
  if (!shown.length) return null
  return (
    <span className={className}>
      {shown.map((part, index) => (
        <Fragment key={index}>
          {index ? ' · ' : null}
          {part}
        </Fragment>
      ))}
    </span>
  )
}

/** The artist, or where it plays when there is none; then what the member did with it. */
const byline = (item: ShelfItem) => [workSource(item), musicStatus(item)]

function useCover(item: ShelfItem) {
  const [failed, setFailed] = useState(false)
  return {
    cover: hasCover(item) && !failed ? item.coverPath : null,
    onError: () => setFailed(true),
  }
}

/**
 * A work the member came back to, as a square sleeve. Without art the title is
 * set large on the sleeve, the artist under it, like type on a plain record.
 */
function Sleeve({
  item,
  people,
  onOpen,
}: {
  item: ShelfItem
  people: Record<string, ShelfPerson>
  onOpen: (item: ShelfItem) => void
}) {
  const { cover, onError } = useCover(item)
  const status = musicStatus(item)
  const meta = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
      <ShelfMarks marks={item.marks} size={12} tone={!cover} />
      <ShelfTweetCount count={item.evidenceTweetIds.length} size={12} />
      <ShelfFacepile
        ids={item.echoAccountIds}
        people={people}
        max={3}
        size={18}
        ring={cover ? 'ring-black/30' : 'ring-muted'}
      />
    </span>
  )
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={[item.label, item.creator].filter(Boolean).join(', ')}
      className={cn(
        'group relative isolate aspect-square w-full overflow-hidden rounded-md bg-muted text-left shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] [container-type:inline-size]',
        LIFT,
        FOCUS,
      )}
    >
      {cover ? (
        <>
          <Image
            unoptimized
            src={cover}
            alt=""
            fill
            sizes="(min-width: 1024px) 200px, 50vw"
            className="object-cover"
            onError={onError}
          />
          <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 border-t border-white/10 bg-black/50 px-3 py-2.5 text-white backdrop-blur-md backdrop-saturate-150">
            <span className="line-clamp-2 text-sm font-semibold leading-snug">
              {item.label}
            </span>
            <Byline
              parts={byline(item)}
              className="truncate text-xs text-white/75"
            />
            {meta}
          </span>
        </>
      ) : (
        <span className="absolute inset-0 flex flex-col p-[9cqw]">
          <span className="line-clamp-4 text-[clamp(1rem,11.5cqw,1.75rem)] font-bold leading-[1.08] tracking-tight [overflow-wrap:anywhere] [text-wrap:balance]">
            {item.label}
          </span>
          {item.creator ? (
            <span className="mt-[4cqw] truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {item.creator}
            </span>
          ) : null}
          <span className="mt-auto flex flex-col gap-1.5 text-muted-foreground">
            {status ? (
              <span className="text-xs font-semibold text-foreground/80">
                {status}
              </span>
            ) : null}
            {meta}
          </span>
        </span>
      )}
    </button>
  )
}

/** The art at the start of a row, or the medium's icon on a plain square. */
function Thumb({ item }: { item: ShelfItem }) {
  const { cover, onError } = useCover(item)
  const Icon = item.format === 'podcast' ? Podcast : Disc3
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-muted text-muted-foreground">
      {cover ? (
        <Image
          unoptimized
          src={cover}
          alt=""
          fill
          sizes="40px"
          className="object-cover"
          onError={onError}
        />
      ) : (
        <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      )}
    </span>
  )
}

/** One line of the tracklist: art, title, artist, marks, how often and when. */
function Track({
  item,
  people,
  onOpen,
}: {
  item: ShelfItem
  people: Record<string, ShelfPerson>
  onOpen: (item: ShelfItem) => void
}) {
  return (
    <li className="break-inside-avoid border-b border-border/60">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted',
          FOCUS,
        )}
      >
        <Thumb item={item} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{item.label}</span>
          <Byline
            parts={byline(item)}
            className="truncate text-xs text-muted-foreground"
          />
        </span>
        <span className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground">
          <ShelfMarks marks={item.marks} size={13} />
          <ShelfTweetCount count={item.evidenceTweetIds.length} size={12} />
          <ShelfFacepile
            ids={item.echoAccountIds}
            people={people}
            max={2}
            size={18}
            ring="ring-background"
            className="hidden sm:inline-flex"
          />
          <span className="w-[4.75rem] text-right tabular-nums">
            {musicYears(item)}
          </span>
        </span>
      </button>
    </li>
  )
}

/**
 * Music, set apart from the grid: art is square and listening repeats, so the
 * works the member came back to most stand as sleeves, and everything else is
 * a tracklist that says who made it, how often they tweeted about it and when.
 */
/** The order of a medium's own view: what they came back to most, or what they tweeted about last. */
export function SortToggle({
  sort,
  onChange,
}: {
  sort: MusicSort
  onChange: (sort: MusicSort) => void
}) {
  return (
    <div
      role="group"
      aria-label="Order"
      className="mb-2 flex justify-end gap-1 text-sm"
    >
      {(
        [
          ['most', 'Most tweeted'],
          ['latest', 'Latest'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={sort === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-full px-3 py-1 font-medium transition-colors',
            sort === value
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground',
            FOCUS,
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function ShelfMusic({
  items,
  people,
  onOpen,
}: {
  items: ShelfItem[]
  people: Record<string, ShelfPerson>
  onOpen: (item: ShelfItem) => void
}) {
  const [sort, setSort] = useState<MusicSort>('most')
  const [showAll, setShowAll] = useState(false)
  const sleeves = useMemo(() => musicSleeves(items), [items])
  const tracks = useMemo(
    () => musicTracks(items, sleeves, sort),
    [items, sleeves, sort],
  )
  if (!items.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nothing here yet.
      </p>
    )
  const shown = showAll ? tracks : tracks.slice(0, FIRST_TRACKS)
  return (
    <div className="flex flex-col gap-8">
      {sleeves.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {sleeves.map((item) => (
            <Sleeve
              key={item.workKey}
              item={item}
              people={people}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}
      {tracks.length ? (
        <div>
          {tracks.length > 1 ? (
            <SortToggle sort={sort} onChange={setSort} />
          ) : null}
          <ul className="lg:columns-2 lg:gap-10">
            {shown.map((item) => (
              <Track
                key={item.workKey}
                item={item}
                people={people}
                onOpen={onOpen}
              />
            ))}
          </ul>
          {tracks.length > shown.length ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={cn(
                  'h-9 rounded-full border border-border px-5 text-sm font-medium hover:bg-muted',
                  FOCUS,
                )}
              >
                Show {tracks.length - shown.length} more
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
