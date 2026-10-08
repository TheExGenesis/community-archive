'use client'

import Image from 'next/image'
import { useEffect, useState, type CSSProperties } from 'react'
import { cn } from '@/utils/tailwind'
import {
  shelfMonogram,
  shelfTileHue,
  shelfTileKind,
  type ShelfTileKind,
} from '@/lib/shelf/labels'
import type { ShelfItem } from '@/lib/shelf/types'

type CoverItem = Pick<
  ShelfItem,
  | 'workKey'
  | 'row'
  | 'label'
  | 'creator'
  | 'medium'
  | 'coverPath'
  | 'imageSource'
>

const SERIF = 'var(--font-petrona), Georgia, "Times New Roman", serif'
/** Paper, dimmed in dark mode so a row of pages does not glare. */
const PAPER =
  'bg-[hsl(var(--tile-h)_26%_93%)] dark:bg-[hsl(var(--tile-h)_14%_80%)]'
const FADE =
  'transition-opacity duration-300 ease-out motion-reduce:transition-none'

/**
 * A work's cover. The drawn tile always renders first, so a shelf never shows
 * empty boxes while covers load through the proxy; the image fades in over it
 * and is dropped again if it fails. Favicons sit inside the tile as an app
 * icon instead of being stretched into a cover.
 */
export function ShelfCover({
  item,
  width,
  height,
  compact = false,
  className,
}: {
  item: CoverItem
  width: number
  height: number
  /** Thumbnail use: no source badge. */
  compact?: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    setFailed(false)
    setLoaded(false)
  }, [item.coverPath])

  const image = item.coverPath && !failed ? item.coverPath : null
  const isIcon = item.imageSource === 'favicon'
  const kind: ShelfTileKind = isIcon ? 'app' : shelfTileKind(item)
  const markLoaded = (img: HTMLImageElement | null) => {
    // Cached images can finish before hydration attaches onLoad.
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }

  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-sm', className)}
      style={{ width, height }}
    >
      <ShelfTile
        kind={kind}
        hue={shelfTileHue(item.workKey)}
        letter={shelfMonogram(item.label)}
        width={width}
        height={height}
        icon={
          image && isIcon ? (
            <Image
              unoptimized
              ref={markLoaded}
              src={image}
              alt=""
              fill
              sizes="64px"
              className={cn('object-contain', FADE, !loaded && 'opacity-0')}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          ) : null
        }
        iconLoaded={!!image && isIcon && loaded}
      />
      {image && !isIcon ? (
        <div
          className={cn(
            'absolute inset-0 bg-muted',
            FADE,
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        >
          <Image
            unoptimized
            ref={markLoaded}
            src={image}
            alt=""
            fill
            sizes={`${width}px`}
            className="object-cover"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
          {item.imageSource === 'youtube' && !compact ? (
            <span className="absolute bottom-1 right-1 rounded-sm bg-background/90 px-1 py-px text-[10px] font-medium leading-tight text-foreground">
              YouTube
            </span>
          ) : null}
        </div>
      ) : null}
      {/* Edge drawn over the image too, so light covers keep their shape. */}
      <span className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-inset ring-foreground/10" />
    </div>
  )
}

/**
 * The drawn object for a medium. Only a monogram is printed on it: the
 * caption or the drawer already carries the full title.
 */
function ShelfTile({
  kind,
  hue: h,
  letter,
  width,
  height,
  icon,
  iconLoaded,
}: {
  kind: ShelfTileKind
  hue: number
  letter: string
  width: number
  height: number
  icon: React.ReactNode
  iconLoaded: boolean
}) {
  const m = Math.min(width, height)
  const glyph = (size: number, style?: CSSProperties) => (
    <span
      className="font-semibold leading-none"
      style={{
        fontFamily: SERIF,
        fontSize: Math.max(9, Math.round(size)),
        ...style,
      }}
    >
      {letter}
    </span>
  )
  const fill = 'absolute inset-0'

  switch (kind) {
    case 'book': {
      const spine = Math.max(5, Math.round(width * 0.1))
      const gilt = 'hsl(43 45% 70% / 0.55)'
      return (
        <div
          aria-hidden="true"
          className={fill}
          style={{
            background: `hsl(${h} 30% 31%)`,
            color: `hsl(${h} 32% 86%)`,
          }}
        >
          <span
            className="absolute inset-y-0 left-0"
            style={{
              width: spine,
              background: `linear-gradient(to bottom, transparent 9%, ${gilt} 9%, ${gilt} 10.5%, transparent 10.5%, transparent 89.5%, ${gilt} 89.5%, ${gilt} 91%, transparent 91%), hsl(${h} 30% 23%)`,
              boxShadow: `1px 0 0 hsl(${h} 30% 19%)`,
            }}
          />
          <span
            className="absolute flex items-center justify-center border-[3px] border-double"
            style={{
              left: spine + (width - spine) * 0.22,
              right: (width - spine) * 0.22,
              top: '20%',
              aspectRatio: '4 / 5',
              borderColor: `hsl(${h} 32% 86% / 0.5)`,
            }}
          >
            {glyph(width * 0.24)}
          </span>
        </div>
      )
    }
    case 'page':
      return (
        <div
          aria-hidden="true"
          className={cn(fill, PAPER)}
          style={{ '--tile-h': h, color: `hsl(${h} 30% 24%)` } as CSSProperties}
        >
          <span
            className="absolute inset-x-0 top-0"
            style={{
              height: Math.max(3, Math.round(m * 0.04)),
              background: `hsl(${h} 42% 42%)`,
            }}
          />
          <span
            className="absolute"
            style={{
              inset: `${Math.round(m * 0.18)}px ${Math.round(width * 0.1)}px ${Math.round(m * 0.12)}px`,
              backgroundImage: `repeating-linear-gradient(to bottom, hsl(${h} 30% 24% / 0.16) 0 1.5px, transparent 1.5px ${Math.max(6, Math.round(m * 0.085))}px)`,
            }}
          >
            <span
              className={cn('absolute left-0 top-0 pr-[0.12em]', PAPER)}
              style={{ lineHeight: 0.85 }}
            >
              {glyph(m * 0.36, { lineHeight: 0.85, display: 'block' })}
            </span>
          </span>
        </div>
      )
    case 'screen': {
      const button = Math.round(m * 0.34)
      return (
        <div
          aria-hidden="true"
          className={fill}
          style={{
            background: `radial-gradient(ellipse at 50% 42%, hsl(${h} 32% 30%), hsl(${h} 30% 11%) 75%)`,
            color: 'hsl(0 0% 100% / 0.75)',
          }}
        >
          <span
            className="absolute left-1/2 top-[44%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-current"
            style={{ width: button, height: button }}
          >
            <span
              className="ml-[8%] bg-current"
              style={{
                width: button * 0.34,
                height: button * 0.38,
                clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
              }}
            />
          </span>
          <span className="absolute bottom-[14%] left-[7%]">
            {glyph(m * 0.17)}
          </span>
          <span className="absolute inset-x-[7%] bottom-[8%] h-[2px] bg-white/20">
            <span className="block h-full w-[38%] bg-white/60" />
          </span>
        </div>
      )
    }
    case 'record': {
      const disc = Math.round(m * 0.84)
      return (
        <div
          aria-hidden="true"
          className={fill}
          style={{ background: `hsl(${h} 30% 36%)` }}
        >
          <span
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{
              width: disc,
              height: disc,
              background:
                'repeating-radial-gradient(circle at center, hsl(0 0% 8%) 0 2px, hsl(0 0% 13%) 2px 3px)',
            }}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: disc * 0.38,
                height: disc * 0.38,
                background: `hsl(${h} 55% 64%)`,
                color: `hsl(${h} 40% 15%)`,
              }}
            >
              {glyph(disc * 0.17)}
            </span>
          </span>
        </div>
      )
    }
    case 'game':
      return (
        <div
          aria-hidden="true"
          className={fill}
          style={{ background: `hsl(${h} 36% 30%)` }}
        >
          <span
            className="absolute inset-x-0 top-0"
            style={{
              height: '15%',
              background: `repeating-linear-gradient(90deg, hsl(${h} 36% 22%) 0 3px, hsl(${h} 36% 26%) 3px 6px)`,
            }}
          />
          <span
            className="absolute inset-x-[13%] bottom-[12%] top-[25%] flex items-center justify-center rounded-sm"
            style={{
              background: `hsl(${h} 30% 88%)`,
              color: `hsl(${h} 35% 22%)`,
            }}
          >
            {glyph(width * 0.3)}
          </span>
        </div>
      )
    case 'app': {
      const chip = Math.round(m * 0.48)
      return (
        <div
          aria-hidden="true"
          className={cn(
            fill,
            'flex items-center justify-center',
            'bg-[hsl(var(--tile-h)_26%_90%)] dark:bg-[hsl(var(--tile-h)_16%_20%)]',
          )}
          style={{ '--tile-h': h } as CSSProperties}
        >
          <span
            className="relative flex items-center justify-center overflow-hidden shadow-sm"
            style={{
              width: chip,
              height: chip,
              borderRadius: '22%',
              background: iconLoaded ? 'hsl(0 0% 100%)' : `hsl(${h} 42% 40%)`,
              color: 'hsl(0 0% 100%)',
            }}
          >
            {iconLoaded ? null : glyph(chip * 0.5)}
            {icon ? <span className="absolute inset-[16%]">{icon}</span> : null}
          </span>
        </div>
      )
    }
    case 'card': {
      const line = Math.max(6, Math.round(m * 0.09))
      return (
        <div
          aria-hidden="true"
          className={cn(
            fill,
            'bg-[hsl(var(--tile-h)_22%_86%)] dark:bg-[hsl(var(--tile-h)_16%_20%)]',
          )}
          style={{ '--tile-h': h } as CSSProperties}
        >
          <span
            className={cn('absolute inset-[13%] -rotate-2 shadow-sm', PAPER)}
            style={{ color: `hsl(${h} 30% 24%)` }}
          >
            <span className="absolute left-[10%] top-[7%]">
              {glyph(m * 0.2)}
            </span>
            <span className="absolute inset-x-0 top-[36%] h-px bg-[hsl(4_60%_58%/0.6)]" />
            <span
              className="absolute inset-x-0 bottom-[6%] top-[36%]"
              style={{
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${line}px, hsl(210 50% 60% / 0.25) ${line}px ${line + 1}px)`,
              }}
            />
          </span>
        </div>
      )
    }
  }
}
