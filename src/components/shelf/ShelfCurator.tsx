'use client'

import { Check, EyeOff, PanelRight, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/utils/tailwind'
import {
  SHELF_COVER_SIZE,
  shelfRowTitle,
  shelfTweetCount,
} from '@/lib/shelf/labels'
import { chunkKeys, rangeBetween, toggleKeys } from '@/lib/shelf/select'
import {
  SHELF_ROWS,
  shelfDecisionFor,
  type Shelf,
  type ShelfDecision,
  type ShelfItem,
  type ShelfRowKey,
  type ShelfStatus,
} from '@/lib/shelf/types'
import { ShelfCover } from './ShelfCover'
import { ShelfItemDrawer } from './ShelfItemDrawer'
import { ShelfMarks } from './ShelfMarks'
import { ShelfCredits } from './ShelfView'

type Notice = { message: string; undo?: () => void; error?: boolean }

type Tab = 'review' | 'approved' | 'hidden'
const TAB_LABEL: Record<Tab, string> = {
  review: 'To review',
  approved: 'On your shelf',
  hidden: 'Hidden',
}
/** Changed items go back to review: they are off the public shelf. */
const tabOf = (status: ShelfStatus): Tab =>
  status === 'pending' || status === 'changed' ? 'review' : status

const flatten = (shelf: Shelf) => shelf.rows.flatMap((row) => row.items)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Review tiles are the public covers scaled down, so rows keep their shapes,
 * but never narrower than the hover actions need.
 */
const TILE_MIN_WIDTH = 96
const tileSize = (row: ShelfRowKey) => {
  const { w, h } = SHELF_COVER_SIZE[row]
  const scale = Math.max(0.7, TILE_MIN_WIDTH / w)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}
const TILE_SELECTOR = '[data-shelf-tile]'

async function send(
  accountId: string,
  workKeys: string[],
  status: ShelfDecision,
  title?: string,
) {
  // The API takes at most 500 keys per call.
  for (const chunk of chunkKeys(workKeys)) {
    const response = await fetch('/api/shelf/curation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: accountId,
        work_keys: chunk,
        status,
        ...(title === undefined ? {} : { title }),
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(
        typeof body?.error === 'string'
          ? body.error
          : 'Could not save. Try again.',
      )
    }
  }
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** The tile to focus after the given ones leave the view. */
function tileAfter(keys: Set<string>) {
  const tiles = Array.from(
    document.querySelectorAll<HTMLElement>(TILE_SELECTOR),
  )
  let last = -1
  tiles.forEach((tile, index) => {
    if (keys.has(tile.dataset.shelfTile ?? '')) last = index
  })
  if (last < 0) return null
  const rest = (tile: HTMLElement) => !keys.has(tile.dataset.shelfTile ?? '')
  return (
    tiles.slice(last + 1).find(rest) ??
    tiles.slice(0, last).reverse().find(rest) ??
    null
  )?.dataset.shelfTile
}

/** Arrow keys move between tiles as a grid, across rows. */
function moveFocus(from: HTMLElement, key: string) {
  const tiles = Array.from(
    document.querySelectorAll<HTMLElement>(TILE_SELECTOR),
  )
  const index = tiles.indexOf(from)
  if (index < 0) return false
  let next: HTMLElement | undefined
  if (key === 'ArrowRight') next = tiles[index + 1]
  else if (key === 'ArrowLeft') next = tiles[index - 1]
  else {
    const here = from.getBoundingClientRect()
    const down = key === 'ArrowDown'
    const candidates = tiles
      .map((tile) => ({ tile, rect: tile.getBoundingClientRect() }))
      .filter(({ rect }) =>
        down ? rect.top > here.top + 4 : rect.top < here.top - 4,
      )
    if (!candidates.length) return false
    const lineTop = down
      ? Math.min(...candidates.map(({ rect }) => rect.top))
      : Math.max(...candidates.map(({ rect }) => rect.top))
    next = candidates
      .filter(({ rect }) => Math.abs(rect.top - lineTop) < 4)
      .sort(
        (a, b) =>
          Math.abs(a.rect.left - here.left) - Math.abs(b.rect.left - here.left),
      )[0]?.tile
  }
  if (!next) return false
  next.focus()
  next.scrollIntoView({ block: 'nearest' })
  return true
}

/**
 * Owner curation: nothing is public until it is approved here. Covers are a
 * dense grid; clicking selects, and the bar at the bottom approves or hides
 * the selection in one call.
 */
export function ShelfCurator({ shelf }: { shelf: Shelf }) {
  const router = useRouter()
  const accountId = shelf.accountId
  const [items, setItems] = useState(() => flatten(shelf))
  useEffect(() => setItems(flatten(shelf)), [shelf])

  const counts = useMemo(() => {
    const result: Record<Tab, number> = { review: 0, approved: 0, hidden: 0 }
    for (const item of items) result[tabOf(item.status)] += 1
    return result
  }, [items])
  const [tab, setTab] = useState<Tab>(() =>
    counts.review ? 'review' : 'approved',
  )
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>()

  const announce = useCallback((next: Notice) => {
    clearTimeout(noticeTimer.current)
    setNotice(next)
    noticeTimer.current = setTimeout(() => setNotice(null), 10_000)
  }, [])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  const switchTab = (next: Tab) => {
    setTab(next)
    setSelected(new Set())
    anchor.current = null
  }

  const patch = (keys: Set<string>, update: Partial<ShelfItem>) =>
    setItems((current) =>
      current.map((item) =>
        keys.has(item.workKey) ? { ...item, ...update } : item,
      ),
    )

  /** Set a status optimistically, then offer to undo it. */
  async function changeStatus(
    targets: ShelfItem[],
    status: ShelfDecision,
    message: string,
  ) {
    if (!targets.length || busy) return
    const before = new Map<ShelfStatus, string[]>()
    for (const item of targets)
      before.set(item.status, [
        ...(before.get(item.status) ?? []),
        item.workKey,
      ])
    const keys = new Set(targets.map((item) => item.workKey))
    const restore = () => {
      for (const [previous, workKeys] of Array.from(before))
        patch(new Set(workKeys), { status: previous })
    }
    // Keep the keyboard where it was: on the next tile still in view.
    const focusNext =
      document.activeElement instanceof HTMLElement &&
      keys.has(document.activeElement.dataset.shelfTile ?? '')
        ? tileAfter(keys)
        : undefined
    setBusy(true)
    patch(keys, { status })
    setSelected((current) => toggleKeys(current, Array.from(keys), false))
    if (focusNext)
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            `[data-shelf-tile="${CSS.escape(focusNext)}"]`,
          )
          ?.focus(),
      )
    try {
      await send(accountId, Array.from(keys), status)
      announce({
        message,
        undo: async () => {
          // An earlier approval of since-changed content cannot be restored;
          // those items return to review as pending.
          for (const [previous, workKeys] of Array.from(before))
            patch(new Set(workKeys), { status: shelfDecisionFor(previous) })
          try {
            for (const [previous, workKeys] of Array.from(before))
              await send(accountId, workKeys, shelfDecisionFor(previous))
            announce({ message: 'Undone.' })
          } catch (error) {
            patch(keys, { status })
            announce({ message: (error as Error).message, error: true })
          }
        },
      })
    } catch (error) {
      restore()
      // A batch can fail part way; reload what the server holds.
      if (keys.size > 500) router.refresh()
      announce({ message: (error as Error).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  async function rename(item: ShelfItem, title: string) {
    const next = title.trim()
    setRenaming(false)
    if (next === item.label || busy) return
    setBusy(true)
    const keys = new Set([item.workKey])
    if (next) patch(keys, { label: next, needsTitle: false })
    try {
      // The status is always written, so pass the current one.
      await send(accountId, [item.workKey], shelfDecisionFor(item.status), next)
      router.refresh()
      announce({
        message: next ? 'Renamed.' : 'Title reset.',
        undo: async () => {
          patch(keys, { label: item.label, needsTitle: item.needsTitle })
          try {
            await send(
              accountId,
              [item.workKey],
              shelfDecisionFor(item.status),
              item.label,
            )
            router.refresh()
            announce({ message: 'Undone.' })
          } catch (error) {
            announce({ message: (error as Error).message, error: true })
          }
        },
      })
    } catch (error) {
      patch(keys, { label: item.label, needsTitle: item.needsTitle })
      announce({ message: (error as Error).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  const rows = useMemo(
    () =>
      SHELF_ROWS.map((key) => ({
        key,
        items: items
          .filter((item) => item.row === key && tabOf(item.status) === tab)
          // Changed items lead their row: they were public and now are not.
          .sort(
            (a, b) =>
              Number(b.status === 'changed') - Number(a.status === 'changed'),
          ),
      })).filter((row) => row.items.length),
    [items, tab],
  )
  const inView = useMemo(() => rows.flatMap((row) => row.items), [rows])
  const picked = inView.filter((item) => selected.has(item.workKey))
  const open = items.find((item) => item.workKey === openKey) ?? null

  /** Verbs offered in a tab: never the one that would leave items in place. */
  const verbs = (from: Tab) => ({
    approve: from !== 'approved',
    hide: from !== 'hidden',
    review: from !== 'review',
  })
  const act = (targets: ShelfItem[], status: ShelfDecision) => {
    const one = targets.length === 1 ? `“${targets[0].label}”` : null
    const what = one ?? plural(targets.length, 'work')
    const message =
      status === 'approved'
        ? `Added ${what} to your shelf.`
        : status === 'hidden'
          ? `Hid ${what}.`
          : `Moved ${what} back to review.`
    return changeStatus(targets, status, message)
  }

  const onTileClick = (
    item: ShelfItem,
    order: string[],
    event: ReactMouseEvent,
  ) => {
    const on = !selected.has(item.workKey)
    if (event.shiftKey && anchor.current) {
      const range = rangeBetween(order, anchor.current, item.workKey)
      setSelected((current) => toggleKeys(current, range, true))
    } else {
      setSelected((current) => toggleKeys(current, [item.workKey], on))
    }
    anchor.current = item.workKey
  }

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.dataset.shelfTile) return
    if (event.key.startsWith('Arrow') && !event.altKey && !event.metaKey)
      if (moveFocus(target, event.key)) event.preventDefault()
  }

  // Letter shortcuts act on the selection, or on the focused tile.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (openKey || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return
      const key = event.key.toLowerCase()
      const focused =
        event.target instanceof HTMLElement
          ? event.target.dataset.shelfTile
          : undefined
      if (key === 'escape' && selected.size) {
        setSelected(new Set())
        return
      }
      if (key === 'o' && focused) {
        event.preventDefault()
        setOpenKey(focused)
        return
      }
      const status: ShelfDecision | null =
        key === 'a'
          ? 'approved'
          : key === 'h'
            ? 'hidden'
            : key === 'u'
              ? 'pending'
              : null
      if (!status) return
      const allowed = verbs(tab)
      if (
        (status === 'approved' && !allowed.approve) ||
        (status === 'hidden' && !allowed.hide) ||
        (status === 'pending' && !allowed.review)
      )
        return
      const targets = picked.length
        ? picked
        : inView.filter((item) => item.workKey === focused)
      if (!targets.length) return
      event.preventDefault()
      void act(targets, status)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const drawerActions = (item: ShelfItem) => {
    const allowed = verbs(tabOf(item.status))
    if (renaming)
      return (
        <RenameForm
          item={item}
          onRename={(title) => rename(item, title)}
          onCancel={() => setRenaming(false)}
        />
      )
    return (
      <div className="flex flex-wrap gap-2">
        {allowed.approve ? (
          <Button
            size="sm"
            className="h-8 px-3"
            disabled={busy}
            onClick={() => act([item], 'approved')}
          >
            Approve
          </Button>
        ) : null}
        {allowed.hide ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3"
            disabled={busy}
            onClick={() => act([item], 'hidden')}
          >
            Hide
          </Button>
        ) : null}
        {allowed.review ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-3"
            disabled={busy}
            onClick={() => act([item], 'pending')}
          >
            Back to review
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-3"
          disabled={busy}
          onClick={() => setRenaming(true)}
        >
          Rename
        </Button>
      </div>
    )
  }

  const allowed = verbs(tab)

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
        <Tabs value={tab} onValueChange={(value) => switchTab(value as Tab)}>
          <TabsList className="h-auto flex-wrap justify-start">
            {(['review', 'approved', 'hidden'] as const).map((status) => (
              <TabsTrigger key={status} value={status}>
                {TAB_LABEL[status]}
                <span className="ml-1.5 text-muted-foreground">
                  {counts[status]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {rows.length ? (
          <p className="hidden text-xs text-muted-foreground md:block">
            Click covers to select, Shift-click for a range. Keys:{' '}
            {allowed.approve ? <Kbd>A</Kbd> : null}
            {allowed.approve ? ' approve, ' : null}
            {allowed.hide ? <Kbd>H</Kbd> : null}
            {allowed.hide ? ' hide, ' : null}
            {allowed.review ? <Kbd>U</Kbd> : null}
            {allowed.review ? ' back to review, ' : null}
            <Kbd>O</Kbd> details.
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-6">
          {tab === 'review'
            ? counts.approved
              ? 'Everything has been reviewed.'
              : 'Nothing to review yet.'
            : tab === 'approved'
              ? 'Nothing is on your public shelf yet. Approve works under To review.'
              : 'Nothing is hidden.'}
        </p>
      ) : (
        <div className="divide-y divide-border" onKeyDown={onGridKeyDown}>
          {rows.map((row) => {
            const order = row.items.map((item) => item.workKey)
            const rowSelected = row.items.filter((item) =>
              selected.has(item.workKey),
            ).length
            const allSelected = rowSelected === row.items.length
            const { w, h } = tileSize(row.key)
            return (
              <section
                key={row.key}
                aria-labelledby={`curate-${row.key}`}
                className="px-4 py-5 sm:px-6"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h2
                    id={`curate-${row.key}`}
                    className="text-lg font-semibold"
                  >
                    {shelfRowTitle(row.key, null)}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {rowSelected
                      ? `${rowSelected} of ${row.items.length} selected`
                      : row.items.length}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {row.items.length > 1 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3"
                        onClick={() =>
                          setSelected((current) =>
                            toggleKeys(current, order, !allSelected),
                          )
                        }
                      >
                        {allSelected ? 'Clear selection' : 'Select all'}
                      </Button>
                    ) : null}
                    {tab === 'review' && row.items.length > 1 ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 px-3"
                        disabled={busy}
                        onClick={() =>
                          changeStatus(
                            row.items,
                            'approved',
                            `Added ${plural(row.items.length, 'work')} to ${shelfRowTitle(row.key, null)}.`,
                          )
                        }
                      >
                        Approve all {row.items.length}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <ul
                  className="mt-4 grid justify-between gap-x-4 gap-y-5"
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, ${Math.max(w, TILE_MIN_WIDTH)}px)`,
                  }}
                >
                  {row.items.map((item) => (
                    <CuratorTile
                      key={item.workKey}
                      item={item}
                      width={w}
                      height={h}
                      selected={selected.has(item.workKey)}
                      selecting={selected.size > 0}
                      busy={busy}
                      allowed={allowed}
                      onClick={(event) => onTileClick(item, order, event)}
                      onOpen={() => {
                        setRenaming(false)
                        setOpenKey(item.workKey)
                      }}
                      onAct={(status) => act([item], status)}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <ShelfCredits shelf={shelf} />

      <ShelfItemDrawer
        accountId={accountId}
        item={open}
        onClose={() => {
          setOpenKey(null)
          setRenaming(false)
        }}
        actions={open ? drawerActions(open) : null}
      />

      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-col items-center gap-2">
        <div role="status" aria-live="polite" className="flex justify-center">
          {notice ? (
            <div
              className={cn(
                'pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border bg-popover px-4 py-2.5 text-sm text-popover-foreground shadow-md',
                notice.error ? 'border-destructive' : 'border-border',
              )}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {notice.message}
              </span>
              {notice.undo ? (
                <button
                  type="button"
                  onClick={notice.undo}
                  className="shrink-0 rounded-sm font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Undo
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {picked.length ? (
          <div
            role="toolbar"
            aria-label="Selected works"
            className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-border bg-popover py-2 pl-4 pr-2 text-sm text-popover-foreground shadow-md"
          >
            <span className="mr-2 font-medium tabular-nums">
              {plural(picked.length, 'work')} selected
            </span>
            {allowed.approve ? (
              <Button
                size="sm"
                className="h-8 px-3"
                disabled={busy}
                onClick={() => act(picked, 'approved')}
              >
                Approve
              </Button>
            ) : null}
            {allowed.hide ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3"
                disabled={busy}
                onClick={() => act(picked, 'hidden')}
              >
                Hide
              </Button>
            ) : null}
            {allowed.review ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3"
                disabled={busy}
                onClick={() => act(picked, 'pending')}
              >
                Back to review
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-sm border border-border bg-muted px-1 font-sans text-[11px] text-foreground">
      {children}
    </kbd>
  )
}

const TILE_ACTION =
  'flex h-6 w-6 items-center justify-center rounded-full bg-popover/95 text-popover-foreground shadow-sm ring-1 ring-foreground/10 hover:bg-accent disabled:opacity-50'

/** One work in the review grid: the cover selects; actions show on hover. */
function CuratorTile({
  item,
  width,
  height,
  selected,
  selecting,
  busy,
  allowed,
  onClick,
  onOpen,
  onAct,
}: {
  item: ShelfItem
  width: number
  height: number
  selected: boolean
  selecting: boolean
  busy: boolean
  allowed: { approve: boolean; hide: boolean; review: boolean }
  onClick: (event: ReactMouseEvent) => void
  onOpen: () => void
  onAct: (status: ShelfDecision) => void
}) {
  const changed = item.status === 'changed'
  const count = shelfTweetCount(item)
  const tileWidth = Math.max(width, TILE_MIN_WIDTH)
  // Overlays sit on the cover, which is centred in the tile.
  const inset = (tileWidth - width) / 2 + 4
  return (
    <li className="group/tile relative" style={{ width: tileWidth }}>
      <button
        type="button"
        data-shelf-tile={item.workKey}
        aria-pressed={selected}
        aria-keyshortcuts="A H U O"
        onClick={onClick}
        className="flex w-full flex-col rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
      >
        <span
          className="relative flex w-full items-end justify-center"
          style={{ height }}
        >
          <span
            className={cn(
              'block rounded-sm transition-shadow duration-100 motion-reduce:transition-none',
              selected
                ? 'ring-2 ring-brand ring-offset-2 ring-offset-card'
                : changed
                  ? 'ring-2 ring-amber-500/80 ring-offset-2 ring-offset-card'
                  : null,
            )}
          >
            <ShelfCover item={item} width={width} height={height} compact />
          </span>
          <span
            aria-hidden="true"
            style={{ left: inset }}
            className={cn(
              'absolute top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-opacity',
              selected
                ? 'border-brand bg-brand text-brand-foreground'
                : 'border-white/90 bg-black/25 opacity-0 group-hover/tile:opacity-100',
              selecting && 'opacity-100',
            )}
          >
            {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
          </span>
        </span>
        <span className="mt-2 line-clamp-2 text-xs font-medium leading-snug [overflow-wrap:anywhere]">
          {item.label}
        </span>
        {changed ? (
          <span className="mt-0.5 text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-400">
            Changed since you approved it
          </span>
        ) : item.needsTitle ? (
          <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Title guessed; rename it
          </span>
        ) : null}
        {item.marks.length || count ? (
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShelfMarks marks={item.marks} />
            {count ? <span>{count}</span> : null}
          </span>
        ) : null}
        <span className="sr-only">
          {[item.creator, item.medium].filter(Boolean).join(', ')}
        </span>
      </button>
      {/* Pointer shortcuts; keyboard users have A, H, U and O on the tile. */}
      <div
        className="pointer-events-none absolute flex gap-1 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-focus-within/tile:opacity-100 group-hover/tile:pointer-events-auto group-hover/tile:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
        style={{ top: height - 28, right: inset }}
      >
        {allowed.approve ? (
          <button
            type="button"
            tabIndex={-1}
            disabled={busy}
            title="Approve"
            aria-label={`Approve ${item.label}`}
            className={TILE_ACTION}
            onClick={() => onAct('approved')}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {allowed.hide ? (
          <button
            type="button"
            tabIndex={-1}
            disabled={busy}
            title="Hide"
            aria-label={`Hide ${item.label}`}
            className={TILE_ACTION}
            onClick={() => onAct('hidden')}
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {allowed.review ? (
          <button
            type="button"
            tabIndex={-1}
            disabled={busy}
            title="Back to review"
            aria-label={`Move ${item.label} back to review`}
            className={TILE_ACTION}
            onClick={() => onAct('pending')}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          tabIndex={-1}
          title="Details and rename"
          aria-label={`Show details for ${item.label}`}
          className={TILE_ACTION}
          onClick={onOpen}
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  )
}

function RenameForm({
  item,
  onRename,
  onCancel,
}: {
  item: ShelfItem
  onRename: (title: string) => void
  onCancel: () => void
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onRename(String(new FormData(event.currentTarget).get('title') ?? ''))
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={`title-${item.key}`}>
        Title
      </label>
      <Input
        id={`title-${item.key}`}
        name="title"
        defaultValue={item.label}
        maxLength={200}
        autoFocus
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          // Close the form, not the drawer.
          event.stopPropagation()
          onCancel()
        }}
        className="h-9"
      />
      <span className="text-xs text-muted-foreground">
        Leave empty to use the generated title.
      </span>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-8 px-3">
          Save title
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-3"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
