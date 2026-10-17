'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/utils/tailwind'
import {
  COVER_ROWS,
  SHELF_COVER_SIZE,
  shelfHost,
  shelfRowTitle,
  shelfTweetCount,
} from '@/lib/shelf/labels'
import type { Shelf, ShelfItem, ShelfRow } from '@/lib/shelf/types'
import { ShelfCover } from './ShelfCover'
import { ShelfItemDrawer } from './ShelfItemDrawer'
import { ShelfMarks } from './ShelfMarks'

const FOCUS =
  'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card'

function ItemMeta({ item }: { item: ShelfItem }) {
  const count = shelfTweetCount(item)
  if (!item.marks.length && !count) return null
  return (
    <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
      <ShelfMarks marks={item.marks} />
      {count ? <span>{count}</span> : null}
    </span>
  )
}

/** Rows show this many works until the reader asks for the rest. */
export const SHELF_ROW_PREVIEW = 12

function LedgeItem({
  item,
  w,
  h,
  onOpen,
  ledge,
}: {
  item: ShelfItem
  w: number
  h: number
  onOpen: (item: ShelfItem) => void
  /** Draw this item's piece of the ledge (wrapped layout). */
  ledge?: boolean
}) {
  return (
    <li className="relative" style={{ width: Math.max(w, 116) }}>
      {ledge ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-2.5 h-1.5 border-t border-border bg-muted"
          style={{ top: h }}
        />
      ) : null}
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={cn('group relative flex w-full flex-col text-left', FOCUS)}
      >
        <span className="flex items-end justify-center" style={{ height: h }}>
          <ShelfCover
            item={item}
            width={w}
            height={h}
            className="transition-transform duration-150 ease-out group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
          />
        </span>
        <span className="mt-4 line-clamp-2 text-sm font-medium leading-snug [overflow-wrap:anywhere] group-hover:underline group-hover:underline-offset-2">
          {item.label}
        </span>
        {item.creator ? (
          <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {item.creator}
          </span>
        ) : null}
        <ItemMeta item={item} />
      </button>
    </li>
  )
}

/**
 * One medium as a shelf: covers standing on a ledge. A long row shows its
 * first works on one scrolling ledge; "Show all" stacks the rest on as many
 * ledges as they need.
 */
export function ShelfLedge({
  row,
  title,
  onOpen,
  action,
}: {
  row: ShelfRow
  title: string
  onOpen: (item: ShelfItem) => void
  action?: ReactNode
}) {
  const { w, h } = SHELF_COVER_SIZE[row.key]
  const headingId = `shelf-row-${row.key}`
  const [expanded, setExpanded] = useState(false)
  const hidden = row.items.length - SHELF_ROW_PREVIEW
  const toggle =
    hidden > 0 ? (
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${headingId}-items`}
        onClick={() => setExpanded((value) => !value)}
        className={cn('text-sm font-medium text-brand hover:underline', FOCUS)}
      >
        {expanded ? 'Show fewer' : `Show all ${row.items.length}`}
      </button>
    ) : null
  return (
    <section aria-labelledby={headingId} className="py-5">
      <div className="flex items-baseline gap-2 px-4 sm:px-6">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        <span className="text-sm text-muted-foreground">
          {row.items.length}
        </span>
        {action || toggle ? (
          <div className="ml-auto flex items-baseline gap-4">
            {action}
            {toggle}
          </div>
        ) : null}
      </div>
      {expanded ? (
        <ul
          id={`${headingId}-items`}
          className="mt-3 flex flex-wrap gap-x-5 gap-y-8 px-4 pb-3 sm:px-6"
        >
          {row.items.map((item) => (
            <LedgeItem
              key={item.workKey}
              item={item}
              w={w}
              h={h}
              onOpen={onOpen}
              ledge
            />
          ))}
        </ul>
      ) : (
        <div className="mt-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin]">
          <div
            className="relative w-max min-w-full px-4 sm:px-6"
            style={{ '--ledge': `${h}px` } as CSSProperties}
          >
            {/* The ledge every cover stands on. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[var(--ledge)] h-1.5 border-t border-border bg-muted"
            />
            <ul id={`${headingId}-items`} className="relative flex gap-5">
              {row.items.slice(0, SHELF_ROW_PREVIEW).map((item) => (
                <LedgeItem
                  key={item.workKey}
                  item={item}
                  w={w}
                  h={h}
                  onOpen={onOpen}
                />
              ))}
              {hidden > 0 ? (
                <li style={{ width: Math.max(Math.round(w * 0.8), 96) }}>
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className={cn(
                      'flex w-full items-end justify-center rounded-sm border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                      FOCUS,
                    )}
                    style={{ height: h - 6 }}
                  >
                    <span className="pb-3 text-center leading-snug">
                      {hidden} more
                    </span>
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

/** Links and passing mentions: a compact list rather than covers. */
export function ShelfList({
  row,
  onOpen,
}: {
  row: ShelfRow
  onOpen: (item: ShelfItem) => void
}) {
  return (
    <ul className="grid gap-x-6 gap-y-1 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
      {row.items.map((item) => (
        <li key={item.workKey}>
          <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              'flex w-full flex-col py-2 text-left hover:underline hover:underline-offset-2',
              FOCUS,
            )}
          >
            <span className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">
              {item.label}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {shelfHost(item.url) ?? item.creator ?? item.medium}
              <ShelfMarks marks={item.marks} />
              {shelfTweetCount(item)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ShelfCredits({ shelf }: { shelf: Shelf }) {
  const openLibrary = shelf.rows.some((row) =>
    row.items.some(
      (item) => item.coverPath && item.imageSource === 'openlibrary',
    ),
  )
  if (!openLibrary) return null
  return (
    <p className="px-4 pb-5 text-xs text-muted-foreground sm:px-6">
      Cover:{' '}
      <a
        href="https://openlibrary.org"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Open Library
      </a>
    </p>
  )
}

/** The public shelf: approved items only, grouped by medium. */
export function ShelfView({
  shelf,
  ownerName,
}: {
  shelf: Shelf
  ownerName: string
}) {
  const [open, setOpen] = useState<ShelfItem | null>(null)
  const covers = shelf.rows.filter((row) => COVER_ROWS.includes(row.key))
  const links = shelf.rows.find((row) => row.key === 'links')
  const mentioned = shelf.rows.find((row) => row.key === 'mentioned')
  return (
    <>
      <div className="divide-y divide-border">
        {covers.map((row) => (
          <ShelfLedge
            key={row.key}
            row={row}
            title={shelfRowTitle(row.key, ownerName)}
            onOpen={setOpen}
          />
        ))}
        {links ? (
          <section aria-labelledby="shelf-row-links" className="py-5">
            <div className="flex items-baseline gap-2 px-4 sm:px-6">
              <h2 id="shelf-row-links" className="text-lg font-semibold">
                Links
              </h2>
              <span className="text-sm text-muted-foreground">
                {links.items.length}
              </span>
            </div>
            <div className="mt-2">
              <ShelfList row={links} onOpen={setOpen} />
            </div>
          </section>
        ) : null}
        {mentioned ? (
          <details className="group py-5">
            <summary
              className={cn(
                'mx-4 flex cursor-pointer list-none items-baseline gap-2 sm:mx-6 [&::-webkit-details-marker]:hidden',
                FOCUS,
              )}
            >
              <h2 className="text-lg font-semibold">Also mentioned</h2>
              <span className="text-sm text-muted-foreground">
                {mentioned.items.length}
              </span>
              <span className="text-sm text-brand group-open:hidden">Show</span>
              <span className="hidden text-sm text-brand group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2">
              <ShelfList row={mentioned} onOpen={setOpen} />
            </div>
          </details>
        ) : null}
      </div>
      <ShelfCredits shelf={shelf} />
      <ShelfItemDrawer
        accountId={shelf.accountId}
        item={open}
        onClose={() => setOpen(null)}
      />
    </>
  )
}
