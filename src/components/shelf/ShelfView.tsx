'use client'

import { Fragment, useState } from 'react'
import { cn } from '@/utils/tailwind'
import type { Shelf, ShelfItem, ShelfRow } from '@/lib/shelf/types'
import { ShelfTweetCount } from './ShelfMarks'

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** One work as a pill: its site icon when it has one, the name, and how often. */
function ShelfPill({
  item,
  onOpen,
}: {
  item: ShelfItem
  onOpen: (item: ShelfItem) => void
}) {
  const [failed, setFailed] = useState(false)
  const icon =
    item.imageSource === 'favicon' && item.coverPath && !failed
      ? item.coverPath
      : null
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      title={item.label}
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full bg-muted py-1.5 pr-3 text-sm transition-colors hover:bg-muted/60',
        icon ? 'pl-1.5' : 'pl-3',
        FOCUS,
      )}
    >
      {icon ? (
        // A 16–32px favicon; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon}
          alt=""
          className="h-5 w-5 shrink-0 rounded-[5px] object-contain"
          onError={() => setFailed(true)}
        />
      ) : null}
      <span className="max-w-[16rem] truncate">{item.label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        <ShelfTweetCount count={item.evidenceTweetIds.length} size={11} />
      </span>
    </button>
  )
}

/**
 * Tools, Wikipedia pages and passing mentions as compact pills. Marks and the
 * rest are in the drawer.
 */
export function ShelfList({
  row,
  onOpen,
}: {
  row: ShelfRow
  onOpen: (item: ShelfItem) => void
}) {
  return (
    <ul className="flex flex-wrap gap-2 px-4 sm:px-6">
      {row.items.map((item) => (
        <li key={item.workKey} className="min-w-0 max-w-full">
          <ShelfPill item={item} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  )
}

/** Sources whose covers the shelf shows, credited under the grid when used. */
const COVER_CREDITS: Record<string, { name: string; href: string }> = {
  openlibrary: { name: 'Open Library', href: 'https://openlibrary.org' },
  wikipedia: { name: 'Wikipedia', href: 'https://en.wikipedia.org' },
}

export function ShelfCredits({ shelf }: { shelf: Shelf }) {
  const used = Object.keys(COVER_CREDITS).filter((source) =>
    shelf.rows.some((row) =>
      row.items.some((item) => item.coverPath && item.imageSource === source),
    ),
  )
  if (!used.length) return null
  return (
    <p className="px-4 pb-5 text-xs text-muted-foreground sm:px-6">
      {used.length > 1 ? 'Covers' : 'Cover'}:{' '}
      {used.map((source, index) => (
        <Fragment key={source}>
          {index ? ', ' : null}
          <a
            href={COVER_CREDITS[source].href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {COVER_CREDITS[source].name}
          </a>
        </Fragment>
      ))}
    </p>
  )
}
