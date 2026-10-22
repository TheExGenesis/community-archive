'use client'

import Image from 'next/image'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { CalendarDays, ChevronDown, Play } from 'lucide-react'
import { cn } from '@/utils/tailwind'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BENTO_ROWS,
  bentoTiles,
  hasCover,
  inPeriod,
  pickFavourites,
  shelfChips,
  shelfYears,
  type BentoTile,
  type ShelfPeriod,
} from '@/lib/shelf/bento'
import {
  shelfOwnerName,
  shelfFormatLabel,
  shelfRowTitle,
  shelfStatus,
  shelfWorkKeyPrefix,
  shelfWorkSlug,
  youtubeId,
} from '@/lib/shelf/labels'
import type {
  Shelf,
  ShelfItem,
  ShelfPerson,
  ShelfRowKey,
} from '@/lib/shelf/types'
import { ShelfFacepile } from './ShelfFacepile'
import { ShelfItemDrawer } from './ShelfItemDrawer'
import { ShelfMarks, ShelfTweetCount } from './ShelfMarks'
import { ShelfMusic } from './ShelfMusic'
import { ShelfPosters, ShelfVideos } from './ShelfVideos'
import { ShelfCredits, ShelfList } from './ShelfView'

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'
// Every tile lifts a little on hover and settles on press, so it reads as something to open.
const LIFT =
  'transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgb(0_0_0/0.22)] hover:ring-1 hover:ring-border active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100'
// One surface for every tile; the faces, not a tint, mark a conversation.
const SURFACE =
  'rounded-md bg-muted text-left shadow-[0_1px_2px_hsl(var(--foreground)/0.06)]'
/** Work tiles shown before "Show all". Favourites and conversation tiles always show. */
const FIRST_PAGE = 40
/** Tools and links show their most tweeted entries until expanded. */
const LIST_PREVIEW = 18

/** 'all', 'echoed', 'common', or a chip key: a row ("books") or a row's format ("watching:tv"). */
type Filter = string

const matchesChip = (item: ShelfItem, key: string) => {
  const [row, format] = key.split(':')
  return item.row === row && (!format || item.format === format)
}
/** The member's own words for a tile, with the tweet's photo when it has one. */
type Quote = { text: string; image: string | null }
type Scale = 'lg' | 'md' | 'sm'

const scaleOf = (tile: BentoTile<ShelfItem>): Scale =>
  tile.kind === 'favourite' ? 'lg' : tile.cols * tile.rows > 1 ? 'md' : 'sm'

/**
 * A work without a cover, or while its cover loads: a quiet tile that names
 * it. The real covers carry the colour; this one says what and whose.
 */
function TileArt({
  item,
  tile,
  quote,
  pillRoom,
}: {
  item: ShelfItem
  tile: BentoTile<ShelfItem>
  quote: Quote | undefined
  /** A cover tile keeps its status pill in the corner; leave room for it while the cover loads. */
  pillRoom: boolean
}) {
  // A favourite without a picture lies one row high and is set like any wide tile.
  const large = tile.kind === 'favourite' && tile.rows > 1
  // A tall tile with a quoted photo gives its top part to the photo.
  const photo = quote?.image && tile.rows > 1 ? quote.image : null
  // Lines that fit above the meta line, by the tile's shape.
  const clamp = photo
    ? 'line-clamp-2'
    : large
      ? 'line-clamp-6'
      : tile.rows >= 2
        ? 'line-clamp-5'
        : tile.cols === 2
          ? 'line-clamp-2'
          : 'line-clamp-3'
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 flex flex-col bg-muted"
    >
      {photo ? <QuotePhoto src={photo} /> : null}
      <span
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1.5 p-3 pb-10 sm:p-4 sm:pb-11',
          !photo && pillRoom && 'pt-9 sm:pt-10',
        )}
      >
        <span
          className={cn(
            'font-semibold leading-snug text-foreground [overflow-wrap:anywhere]',
            clamp,
            large
              ? 'text-xl'
              : tile.cols * tile.rows > 1
                ? 'text-[15px]'
                : 'text-sm',
          )}
        >
          {item.label}
        </span>
        {item.creator && (tile.rows > 1 || tile.cols > 1) ? (
          <span className="truncate text-xs text-muted-foreground">
            {item.creator}
          </span>
        ) : null}
        {quote && tile.rows > 1 ? (
          <span
            className={cn(
              'mt-2 text-[13px] leading-relaxed text-muted-foreground',
              photo ? 'line-clamp-2' : 'line-clamp-4',
            )}
          >
            “{quote.text}”
          </span>
        ) : null}
      </span>
    </span>
  )
}

/** The tile's bottom line: how much the member tweeted about it, and who else did. */
function TileMeta({
  item,
  people,
  max,
  size = 18,
  status,
}: {
  item: ShelfItem
  people: Record<string, ShelfPerson>
  max: number
  size?: number
  /** On a tile without a cover the status sits here, so every title starts at the top. */
  status?: ReactNode
}) {
  const count = item.evidenceTweetIds.length
  if (!status && count < 2 && !(max && item.echoAccountIds.length)) return null
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
      {status}
      {/* What the member did sits left; how much talk there was, theirs and others', right. */}
      <span className="ml-auto flex items-center gap-2">
        <ShelfTweetCount count={count} />
        {max ? (
          <ShelfFacepile
            ids={item.echoAccountIds}
            people={people}
            max={max}
            size={size}
            ring="ring-black/30"
          />
        ) : null}
      </span>
    </span>
  )
}

function WorkTile({
  tile,
  quote,
  people,
  madeBy,
  onOpen,
}: {
  tile: BentoTile<ShelfItem>
  quote: Quote | undefined
  people: Record<string, ShelfPerson>
  /** Badge on the member's own work ("By Garrison"). */
  madeBy: string | null
  onOpen: (item: ShelfItem) => void
}) {
  const { item } = tile
  const scale = scaleOf(tile)
  const icon = item.imageSource === 'favicon'
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [item.coverPath])
  const image = item.coverPath && !failed && !icon ? item.coverPath : null
  const showImage = !!image && loaded
  const titleSize = {
    lg: 'text-lg sm:text-xl',
    md: 'text-sm sm:text-[15px]',
    sm: 'text-[13px]',
  }[scale]
  // What the member did with it ("Read", "Watched"), or "By Garrison" on their own work.
  const status = item.row === 'made' ? madeBy : shelfStatus(item)
  // The pill's text already says "Recommended" when that is the status.
  const pillMarks =
    status === 'Recommended'
      ? item.marks.filter((m) => m !== 'recommended')
      : item.marks
  // Only a work that plays gets a play button: a YouTube link, never a film's poster.
  const video = !!youtubeId(item.url)
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={item.label}
      style={{ gridColumn: `span ${tile.cols}`, gridRow: `span ${tile.rows}` }}
      className={cn(
        'group relative isolate overflow-hidden',
        SURFACE,
        LIFT,
        FOCUS,
      )}
    >
      <TileArt item={item} tile={tile} quote={quote} pillRoom={!!image} />
      {image ? (
        <Image
          unoptimized
          src={image}
          alt=""
          fill
          sizes={tile.cols > 1 ? '320px' : '160px'}
          className={cn(
            'object-cover transition-[opacity,transform] duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
          ref={(img) => {
            // Cached images can finish before hydration attaches onLoad.
            if (img?.complete && img.naturalWidth > 0) setLoaded(true)
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      {showImage && video ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 z-[5] flex items-center justify-center',
            scale === 'sm' ? 'pb-8' : 'pb-12',
          )}
        >
          {/* Sized to the tile, so a small video does not wear a giant button. */}
          <span
            className={cn(
              'flex items-center justify-center rounded-full bg-black/35 ring-1 ring-white/25 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none',
              { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-12 w-12' }[scale],
            )}
          >
            <Play
              className={cn(
                'ml-0.5 fill-white text-white',
                { sm: 'h-2.5 w-2.5', md: 'h-3.5 w-3.5', lg: 'h-4 w-4' }[scale],
              )}
              strokeWidth={0}
            />
          </span>
        </span>
      ) : null}
      {image && (status || pillMarks.length) ? (
        // Everything about the member's own relation to the work, together: what
        // they did, how they felt, whether they recommend it.
        <span
          className={cn(
            'absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5',
            showImage
              ? 'bg-black/45 text-white ring-1 ring-white/10 backdrop-blur-md'
              : 'bg-background/70 text-foreground/80',
          )}
        >
          {status}
          <ShelfMarks marks={pillMarks} size={12} tone={false} />
        </span>
      ) : null}
      {/* Caption: on an image it carries the title; on drawn art the title is already printed. */}
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 z-10 flex gap-1 rounded-b-md px-2.5 py-2 sm:px-3 sm:py-2.5',
          // Frosted glass on covers: the same contrast for white text over any image.
          // There the title sits left and the tweets and faces beside it, one row high.
          showImage
            ? 'items-end gap-x-2 border-t border-white/10 bg-black/50 text-white backdrop-blur-md backdrop-saturate-150'
            : 'flex-col text-foreground/80',
        )}
      >
        {showImage ? (
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className={cn(
                'line-clamp-2 font-semibold leading-snug',
                titleSize,
              )}
            >
              {item.label}
            </span>
            {item.creator && scale !== 'sm' ? (
              <span className="truncate text-xs text-white/75">
                {item.creator}
              </span>
            ) : null}
          </span>
        ) : null}
        <TileMeta
          item={item}
          people={people}
          // Narrow tiles keep the faces, two and smaller, so others' tweets still show.
          max={tile.cols === 1 ? 2 : scale === 'lg' ? 4 : 3}
          size={tile.cols === 1 ? 16 : 18}
          status={
            !image && (status || pillMarks.length) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-semibold leading-5 text-foreground/80">
                {status}
                <ShelfMarks marks={pillMarks} size={12} tone={false} />
              </span>
            ) : null
          }
        />
      </span>
    </button>
  )
}

function TalkTile({
  tile,
  people,
  quote,
  onOpen,
}: {
  tile: BentoTile<ShelfItem>
  people: Record<string, ShelfPerson>
  /** The member's own words about the work, with the tweet's photo when it has one. */
  quote: Quote | undefined
  onOpen: (item: ShelfItem) => void
}) {
  const { item } = tile
  const n = item.echoAccountIds.length
  // Without a photo the tile is one row: a line of title, two of quote, the faces.
  const short = tile.rows === 1
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`${item.label}, ${n} other ${n === 1 ? 'member' : 'members'} tweeted about it`}
      style={{ gridColumn: `span ${tile.cols}`, gridRow: `span ${tile.rows}` }}
      className={cn(
        'group flex flex-col overflow-hidden',
        SURFACE,
        LIFT,
        FOCUS,
      )}
    >
      {quote?.image && !short ? <QuotePhoto src={quote.image} /> : null}
      <span
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          short ? 'gap-1.5 px-3 py-2.5 sm:px-4 sm:py-3' : 'gap-3 p-4 sm:p-5',
        )}
      >
        <span
          className={cn(
            'font-semibold leading-snug group-hover:underline group-hover:underline-offset-2',
            short
              ? 'truncate text-[15px]'
              : 'line-clamp-2 text-base sm:text-lg',
          )}
        >
          {item.label}
        </span>
        <span className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {quote ? (
            <span
              className={cn(
                'text-muted-foreground',
                short
                  ? 'line-clamp-2 text-[13px] leading-snug'
                  : cn(
                      'text-sm leading-relaxed',
                      quote.image ? 'line-clamp-2' : 'line-clamp-4',
                    ),
              )}
            >
              “{quote.text}”
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShelfFacepile
            ids={item.echoAccountIds}
            people={people}
            max={5}
            size={short ? 20 : 24}
            ring="ring-muted"
          />
          <span>tweeted about it</span>
        </span>
      </span>
    </button>
  )
}

/** The photo from the quoted tweet: the top part of a tile, the words below it. */
function QuotePhoto({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <span className="relative block h-[44%] shrink-0 overflow-hidden bg-muted">
      <Image
        unoptimized
        src={src}
        alt=""
        fill
        sizes="320px"
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

/** When the member tweeted about a work: any time, the last 12 months, or a year. */
function PeriodMenu({
  period,
  years,
  onChange,
}: {
  period: ShelfPeriod
  years: { year: number; count: number }[]
  onChange: (period: ShelfPeriod) => void
}) {
  const label =
    period === 'any'
      ? 'Any time'
      : period === 'recent'
        ? 'Last 12 months'
        : String(period)
  const active = period !== 'any'
  const item = 'flex justify-between gap-6 py-2 tabular-nums'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
          active
            ? 'border-foreground bg-foreground text-background'
            : 'border-border bg-card text-foreground hover:border-foreground/40',
          FOCUS,
        )}
      >
        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-80 w-48 overflow-y-auto"
      >
        <DropdownMenuItem className={item} onSelect={() => onChange('any')}>
          Any time
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => onChange('recent')}>
          Last 12 months
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {years.map(({ year, count }) => (
          <DropdownMenuItem
            key={year}
            className={item}
            onSelect={() => onChange(year)}
          >
            <span>{year}</span>
            <span className="text-muted-foreground">{count}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Chip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-foreground hover:border-foreground/40',
        FOCUS,
      )}
    >
      {children}
      <span
        className={cn(
          'tabular-nums',
          active ? 'opacity-70' : 'text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  )
}

/**
 * The public shelf as one ranked grid: favourites in large tiles, the works
 * most other members tweeted about as conversation tiles, then everything
 * else by how much the member tweeted about it. Chips filter by medium, by
 * works other members also tweeted about, and (for a signed-in visitor) by
 * works the visitor tweeted about too. Each work opens at its own URL.
 */
export function ShelfBento({
  shelf,
  ownerName,
  people,
  quotes,
  viewer,
  shelfHref,
  initialKey,
}: {
  shelf: Shelf
  ownerName: string
  people: Record<string, ShelfPerson>
  /** The member's own words, by work key, for tiles that show a quote. */
  quotes: Record<string, Quote>
  /** A signed-in member who is not the owner. */
  viewer: ShelfPerson | null
  shelfHref: string
  initialKey?: string | null
}) {
  const items = useMemo(
    () =>
      shelf.rows
        .filter((row) => BENTO_ROWS.includes(row.key))
        .flatMap((row) => row.items),
    [shelf],
  )
  const all = useMemo(() => shelf.rows.flatMap((row) => row.items), [shelf])
  const favourites = useMemo(() => pickFavourites(items), [items])
  const [filter, setFilter] = useState<Filter>('all')
  const [period, setPeriod] = useState<ShelfPeriod>('any')
  const years = useMemo(() => shelfYears(items), [items])
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<ShelfItem | null>(
    () => (initialKey && all.find((item) => item.key === initialKey)) || null,
  )

  const common = viewer
    ? items.filter((item) => item.echoAccountIds.includes(viewer.accountId))
    : []
  const visible = items.filter(
    (item) =>
      inPeriod(item, period) &&
      (filter === 'all'
        ? true
        : filter === 'echoed'
          ? item.echoAccountIds.length > 0
          : filter === 'common'
            ? common.includes(item)
            : matchesChip(item, filter)),
  )
  const tiles = bentoTiles(
    visible,
    favourites.filter((item) => visible.includes(item)),
    (item) => !!quotes[item.workKey]?.image,
  )
  const firstWork = tiles.findIndex((tile) => tile.kind === 'work')
  const cut =
    showAll || firstWork < 0
      ? tiles.length
      : Math.min(tiles.length, firstWork + FIRST_PAGE)
  const hiddenCount = tiles.length - cut

  // A work's URL is the shelf's URL plus its slug, so a drawer can be shared
  // and the back button closes it.
  const openWork = useCallback(
    (item: ShelfItem) => {
      setOpen(item)
      window.history.pushState(null, '', `${shelfHref}/${shelfWorkSlug(item)}`)
    },
    [shelfHref],
  )
  const closeWork = useCallback(() => {
    setOpen(null)
    if (window.location.pathname !== shelfHref)
      window.history.pushState(null, '', shelfHref)
  }, [shelfHref])
  useEffect(() => {
    const sync = () => {
      const segment = window.location.pathname.slice(shelfHref.length + 1)
      const prefix = segment
        ? shelfWorkKeyPrefix(decodeURIComponent(segment))
        : null
      setOpen(
        prefix
          ? (all.find((item) => item.key.startsWith(prefix)) ?? null)
          : null,
      )
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [all, shelfHref])

  // The lists below the grid run most tweeted first.
  const rest = useMemo(
    () =>
      shelf.rows
        .filter((row) => !BENTO_ROWS.includes(row.key))
        .map((row) => ({
          ...row,
          items: [...row.items].sort(
            (a, b) => b.evidenceTweetIds.length - a.evidenceTweetIds.length,
          ),
        })),
    [shelf.rows],
  )
  const shortName = shelfOwnerName(ownerName) ?? ownerName
  const madeBy = shortName ? `By ${shortName}` : null
  const [openLists, setOpenLists] = useState<Set<ShelfRowKey>>(new Set())
  const chips = useMemo(() => shelfChips(items), [items])
  const echoed = items.filter((item) => item.echoAccountIds.length).length
  const choose = (next: Filter) => {
    setFilter(next)
    setShowAll(false)
  }

  return (
    <>
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-5 [scrollbar-width:none] sm:flex-wrap sm:px-6 [&::-webkit-scrollbar]:hidden">
        <Chip
          active={filter === 'all'}
          onClick={() => choose('all')}
          count={items.length}
        >
          All
        </Chip>
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            active={filter === chip.key}
            onClick={() => choose(chip.key)}
            count={chip.count}
          >
            {chip.format
              ? shelfFormatLabel(chip.format)
              : shelfRowTitle(chip.row, shortName)}
          </Chip>
        ))}
        {echoed ? (
          <Chip
            active={filter === 'echoed'}
            onClick={() => choose('echoed')}
            count={echoed}
          >
            Others tweeted too
          </Chip>
        ) : null}
        {viewer && common.length ? (
          <Chip
            active={filter === 'common'}
            onClick={() => choose('common')}
            count={common.length}
          >
            <ShelfFacepile
              ids={[viewer.accountId]}
              people={{ [viewer.accountId]: viewer }}
              max={1}
              size={18}
              ring="ring-transparent"
            />
            You tweeted these too
          </Chip>
        ) : null}
        <div className="ml-auto shrink-0 pl-2">
          <PeriodMenu
            period={period}
            years={years}
            onChange={(next) => {
              setPeriod(next)
              setShowAll(false)
            }}
          />
        </div>
      </div>

      {/* Rows are 0.78 of a column wide, so a book (1×2) keeps close to a cover's
          2:3 and a single tile is a little landscape, at every width. */}
      <div className="px-4 pb-6 pt-4 [container-type:inline-size] sm:px-6 sm:pb-8">
        {filter === 'listening:music' || filter === 'listening' ? (
          // Music has its own view: square sleeves, then a tracklist.
          <ShelfMusic
            key={String(period)}
            items={visible}
            people={people}
            onOpen={openWork}
          />
        ) : filter === 'watching:video' ? (
          // Videos have their own view too: one size of 16:9 thumbnail, the title under it.
          <ShelfVideos
            key={String(period)}
            items={visible}
            people={people}
            onOpen={openWork}
          />
        ) : filter === 'watching:film' || filter === 'watching:tv' ? (
          // Films and shows as posters, all one 2:3 size.
          <ShelfPosters
            key={String(period)}
            items={visible}
            people={people}
            onOpen={openWork}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 [grid-auto-flow:row_dense] [grid-auto-rows:calc((100cqw_-_0.75rem)/2*0.78)] sm:grid-cols-3 sm:gap-4 sm:[grid-auto-rows:calc((100cqw_-_2rem)/3*0.78)] md:grid-cols-4 md:[grid-auto-rows:calc((100cqw_-_3rem)/4*0.78)] lg:grid-cols-5 lg:[grid-auto-rows:calc((100cqw_-_4rem)/5*0.78)] xl:grid-cols-6 xl:[grid-auto-rows:calc((100cqw_-_5rem)/6*0.78)]">
              {tiles.slice(0, cut).map((tile) =>
                // A conversation with a cover draws like any cover tile; its faces sit in the caption.
                tile.kind === 'talk' && !hasCover(tile.item) ? (
                  <TalkTile
                    key={tile.item.workKey}
                    tile={tile}
                    people={people}
                    quote={quotes[tile.item.workKey]}
                    onOpen={openWork}
                  />
                ) : (
                  <WorkTile
                    key={tile.item.workKey}
                    tile={tile}
                    quote={quotes[tile.item.workKey]}
                    people={people}
                    madeBy={filter === 'made' ? null : madeBy}
                    onOpen={openWork}
                  />
                ),
              )}
            </div>
            {hiddenCount > 0 ? (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className={cn(
                    'h-9 rounded-full border border-border px-5 text-sm font-medium hover:bg-muted',
                    FOCUS,
                  )}
                >
                  Show {hiddenCount} more
                </button>
              </div>
            ) : null}
            {tiles.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing here yet.
              </p>
            ) : null}
          </>
        )}
      </div>

      {rest.length ? (
        <div className="divide-y divide-border border-t border-border">
          {rest.map((row) =>
            row.key === 'mentioned' ? (
              <details key={row.key} className="group py-5">
                <summary
                  className={cn(
                    'mx-4 flex cursor-pointer list-none items-baseline gap-2 rounded-sm sm:mx-6 [&::-webkit-details-marker]:hidden',
                    FOCUS,
                  )}
                >
                  <h2 className="text-lg font-semibold">Also mentioned</h2>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {row.items.length}
                  </span>
                  <span className="text-sm text-brand group-open:hidden">
                    Show
                  </span>
                  <span className="hidden text-sm text-brand group-open:inline">
                    Hide
                  </span>
                </summary>
                <div className="mt-3">
                  <ShelfList
                    row={
                      openLists.has(row.key)
                        ? row
                        : { ...row, items: row.items.slice(0, LIST_PREVIEW) }
                    }
                    onOpen={openWork}
                  />
                  {row.items.length > LIST_PREVIEW &&
                  !openLists.has(row.key) ? (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenLists((current) => new Set(current).add(row.key))
                      }
                      className={cn(
                        'mx-4 mt-3 rounded-sm text-sm font-medium text-brand hover:underline sm:mx-6',
                        FOCUS,
                      )}
                    >
                      Show all {row.items.length}
                    </button>
                  ) : null}
                </div>
              </details>
            ) : (
              <section
                key={row.key}
                aria-labelledby={`shelf-list-${row.key}`}
                className="py-5"
              >
                <div className="flex items-baseline gap-2 px-4 sm:px-6">
                  <h2
                    id={`shelf-list-${row.key}`}
                    className="text-lg font-semibold"
                  >
                    {shelfRowTitle(row.key, shortName)}
                  </h2>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {row.items.length}
                  </span>
                  {row.items.length > LIST_PREVIEW ? (
                    <button
                      type="button"
                      aria-expanded={openLists.has(row.key)}
                      onClick={() =>
                        setOpenLists((current) => {
                          const next = new Set(current)
                          if (next.has(row.key)) next.delete(row.key)
                          else next.add(row.key)
                          return next
                        })
                      }
                      className={cn(
                        'ml-auto rounded-sm text-sm font-medium text-brand hover:underline',
                        FOCUS,
                      )}
                    >
                      {openLists.has(row.key)
                        ? 'Show fewer'
                        : `Show all ${row.items.length}`}
                    </button>
                  ) : null}
                </div>
                <div className="mt-3">
                  <ShelfList
                    row={
                      openLists.has(row.key)
                        ? row
                        : { ...row, items: row.items.slice(0, LIST_PREVIEW) }
                    }
                    onOpen={openWork}
                  />
                </div>
              </section>
            ),
          )}
        </div>
      ) : null}
      <ShelfCredits shelf={shelf} />

      <ShelfItemDrawer
        accountId={shelf.accountId}
        item={open}
        onClose={closeWork}
        people={people}
        ownerName={ownerName}
        shareHref={open ? `${shelfHref}/${shelfWorkSlug(open)}` : null}
      />
    </>
  )
}
