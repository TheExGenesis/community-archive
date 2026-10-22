'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { Film, MessageCircle, Play, Tv } from 'lucide-react'
import { cn } from '@/utils/tailwind'
import { hasCover } from '@/lib/shelf/bento'
import { shelfStatus } from '@/lib/shelf/labels'
import { musicYears, sortWorks, type MusicSort } from '@/lib/shelf/music'
import type { ShelfItem, ShelfPerson } from '@/lib/shelf/types'
import { ShelfFacepile } from './ShelfFacepile'
import { ShelfMarks } from './ShelfMarks'
import { Byline, SortToggle, workSource } from './ShelfMusic'

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'

/** A video is a 16:9 thumbnail; a film or show is a 2:3 poster. */
type Shape = 'video' | 'poster'

const SHAPES = {
  video: {
    frame: 'aspect-video rounded-xl',
    title: 'text-[15px]',
    sizes: '(min-width: 1280px) 300px, (min-width: 640px) 45vw, 100vw',
    grid: 'grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-y-10',
    first: 24,
  },
  poster: {
    frame: 'aspect-[2/3] rounded-lg',
    title: 'text-sm',
    sizes: '(min-width: 1280px) 190px, (min-width: 640px) 25vw, 50vw',
    grid: 'grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 xl:gap-x-4 xl:gap-y-8',
    first: 30,
  },
} satisfies Record<Shape, Record<string, string | number>>

/** "Watched" goes without saying among videos and films; only another status is worth a word. */
const watchStatus = (item: ShelfItem) =>
  item.relation === 'experienced' ? null : shelfStatus(item)

/**
 * One video or film the way video sites and film diaries show them: the
 * picture with only a corner badge on it, the title under it, one quiet line
 * of who made it, what the member did with it and when.
 */
function PictureCard({
  item,
  shape,
  people,
  onOpen,
}: {
  item: ShelfItem
  shape: Shape
  people: Record<string, ShelfPerson>
  onOpen: (item: ShelfItem) => void
}) {
  const [failed, setFailed] = useState(false)
  const cover = hasCover(item) && !failed ? item.coverPath : null
  const tweets = item.evidenceTweetIds.length
  const look = SHAPES[shape]
  // The byline already says "Recommended" when that is the status.
  const badgeMarks =
    watchStatus(item) === 'Recommended'
      ? item.marks.filter((mark) => mark !== 'recommended')
      : item.marks
  const Placeholder =
    shape === 'video' ? Play : item.format === 'tv' ? Tv : Film
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={item.label}
        className={cn(
          'group flex w-full flex-col gap-3 rounded-xl text-left',
          FOCUS,
        )}
      >
        <span
          className={cn(
            'relative block w-full overflow-hidden bg-muted shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] transition-[transform,box-shadow] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_20px_-8px_rgb(0_0_0/0.22)] group-active:translate-y-0 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0',
            look.frame,
          )}
        >
          {cover ? (
            <Image
              unoptimized
              src={cover}
              alt=""
              fill
              sizes={look.sizes}
              className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              onError={() => setFailed(true)}
            />
          ) : (
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-muted-foreground/60"
            >
              <Placeholder className="h-8 w-8" strokeWidth={1.5} />
            </span>
          )}
          {/* Where video sites put the running time: the member's marks and how often they tweeted about it. */}
          {badgeMarks.length || tweets > 1 ? (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
              <ShelfMarks marks={badgeMarks} size={12} tone={false} />
              {tweets > 1 ? (
                <span className="inline-flex items-center gap-1">
                  <MessageCircle
                    aria-hidden="true"
                    className="h-3 w-3"
                    strokeWidth={2.5}
                  />
                  {tweets}
                  <span className="sr-only">tweets</span>
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-col gap-1 pr-1">
          <span
            className={cn(
              'line-clamp-2 font-semibold leading-snug text-foreground [overflow-wrap:anywhere]',
              look.title,
            )}
          >
            {item.label}
          </span>
          <Byline
            parts={[workSource(item), watchStatus(item), musicYears(item)]}
            className="truncate text-[13px] text-muted-foreground"
          />
          {item.echoAccountIds.length ? (
            <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <ShelfFacepile
                ids={item.echoAccountIds}
                people={people}
                max={3}
                size={18}
                ring="ring-background"
              />
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}

/** Every picture the same size in a calm grid, wide gaps between rows, the words under each. */
function ShelfPictures({
  items,
  shape,
  people,
  onOpen,
}: {
  items: ShelfItem[]
  shape: Shape
  people: Record<string, ShelfPerson>
  onOpen: (item: ShelfItem) => void
}) {
  const [sort, setSort] = useState<MusicSort>('most')
  const [showAll, setShowAll] = useState(false)
  const sorted = useMemo(() => sortWorks(items, sort), [items, sort])
  if (!items.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nothing here yet.
      </p>
    )
  const look = SHAPES[shape]
  const shown = showAll ? sorted : sorted.slice(0, look.first)
  return (
    <div>
      {sorted.length > 1 ? <SortToggle sort={sort} onChange={setSort} /> : null}
      <ul className={cn('mt-2 grid', look.grid)}>
        {shown.map((item) => (
          <PictureCard
            key={item.workKey}
            item={item}
            shape={shape}
            people={people}
            onOpen={onOpen}
          />
        ))}
      </ul>
      {sorted.length > shown.length ? (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={cn(
              'h-9 rounded-full border border-border px-5 text-sm font-medium hover:bg-muted',
              FOCUS,
            )}
          >
            Show {sorted.length - shown.length} more
          </button>
        </div>
      ) : null}
    </div>
  )
}

type ViewProps = {
  items: ShelfItem[]
  people: Record<string, ShelfPerson>
  onOpen: (item: ShelfItem) => void
}

/** Videos as video sites lay them out: 16:9 thumbnails. */
export function ShelfVideos(props: ViewProps) {
  return <ShelfPictures shape="video" {...props} />
}

/** Films and shows as a film diary lays them out: 2:3 posters. */
export function ShelfPosters(props: ViewProps) {
  return <ShelfPictures shape="poster" {...props} />
}
