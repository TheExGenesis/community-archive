'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/utils/tailwind'

export interface LightboxImage {
  src: string
  alt: string
  width?: number
  height?: number
  /** Permalink of the post the image belongs to, shown as "View post". */
  href?: string
}

interface ImageLightboxProps {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  imageClassName?: string
  sizes?: string
  /** Overlay drawn on the thumbnail only, e.g. a media-kind label. */
  badge?: ReactNode
  /** Accessible name for the thumbnail; defaults to "Enlarge <alt>". */
  label?: string
  /** Sibling images to step through with ←/→; this thumbnail opens at `index`. */
  gallery?: LightboxImage[]
  index?: number
}

const isEditable = (target: EventTarget) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** Previews render larger than the media's own size, within the viewport. */
const PREVIEW_SCALE = 1.25

const previewWidth = (image: LightboxImage, hasFooter: boolean) => {
  const width = image.width ?? 1200
  const aspect = width / (image.height ?? 800)
  const maxHeight = hasFooter ? '(92vh - 2.5rem)' : '92vh'
  // Width alone sets the size, so the height cap is expressed as a width too.
  return `min(${Math.round(width * PREVIEW_SCALE)}px, 96vw, 1500px, calc(${maxHeight} * ${aspect.toFixed(4)}))`
}

const navButtonClass =
  'absolute top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'

export default function ImageLightbox({
  src,
  alt,
  width = 1200,
  height = 800,
  className,
  imageClassName,
  sizes,
  badge,
  label,
  gallery,
  index = 0,
}: ImageLightboxProps) {
  const images = gallery?.length ? gallery : [{ src, alt, width, height }]
  const [current, setCurrent] = useState(index)
  const contentRef = useRef<HTMLDivElement>(null)
  // Clamp in case the gallery shrank while this thumbnail stayed mounted.
  const position = Math.min(Math.max(current, 0), images.length - 1)
  const image = images[position]
  const hasPrevious = position > 0
  const hasNext = position < images.length - 1
  const isGallery = images.length > 1
  const hasFooter = isGallery || Boolean(image.href)

  // Stops at either end rather than wrapping, so "6 / 6" reads as the end.
  const step = (delta: -1 | 1) =>
    setCurrent(Math.min(Math.max(position + delta, 0), images.length - 1))

  const handleKeyDown = (event: KeyboardEvent) => {
    if (
      !isGallery ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isEditable(event.target)
    ) {
      return
    }
    if (event.key === 'ArrowLeft') step(-1)
    else if (event.key === 'ArrowRight') step(1)
    else return
    // Portaled events still bubble through the React tree to the card behind.
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div className="contents" onClick={(event) => event.stopPropagation()}>
      <Dialog
        onOpenChange={(open) => {
          if (open) setCurrent(index)
        }}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            className={cn(
              'relative block cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
              className,
            )}
            aria-label={label ?? `Enlarge ${alt.toLowerCase()}`}
          >
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              sizes={sizes}
              className={imageClassName}
            />
            {badge}
          </button>
        </DialogTrigger>
        <DialogContent
          ref={contentRef}
          onKeyDown={handleKeyDown}
          // Focus the dialog itself so the first arrow press doesn't light up
          // whichever nav button Radix would otherwise focus. w-max: centred
          // at left-1/2, an auto width would shrink-wrap to half the viewport.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
          className="w-max max-w-[96vw] gap-2 border-0 bg-transparent p-0 shadow-none focus:outline-none [&>button:hover]:bg-black/90 [&>button]:right-2 [&>button]:top-2 [&>button]:rounded-full [&>button]:bg-black/70 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-100"
        >
          <DialogTitle className="sr-only">{image.alt}</DialogTitle>
          <DialogDescription className="sr-only">
            {isGallery
              ? 'Use the left and right arrow keys to move between images. '
              : 'Enlarged image. '}
            Press Escape or click outside the image to close.
          </DialogDescription>
          <div className="relative">
            <Image
              key={image.src}
              src={image.src}
              alt={image.alt}
              width={image.width ?? 1200}
              height={image.height ?? 800}
              sizes="96vw"
              style={{ width: previewWidth(image, hasFooter) }}
              className="h-auto rounded-md object-contain"
            />
            {hasPrevious && (
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous image"
                className={cn(navButtonClass, 'left-2')}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next image"
                className={cn(navButtonClass, 'right-2')}
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
          {hasFooter && (
            <div className="flex items-center justify-between gap-4 text-sm text-white">
              {isGallery && (
                <p className="tabular-nums text-white/80">
                  <span aria-hidden="true">
                    {position + 1} / {images.length}
                  </span>
                  <span className="sr-only" aria-live="polite">
                    Image {position + 1} of {images.length}
                  </span>
                </p>
              )}
              {image.href && (
                <Link
                  href={image.href}
                  className="ml-auto font-semibold underline-offset-2 hover:underline"
                >
                  View post
                </Link>
              )}
            </div>
          )}
          {/* Warm the neighbours at the same srcset size so stepping is instant. */}
          {[-1, 1].map((offset) => {
            const neighbour = images[position + offset]
            return (
              neighbour && (
                <Image
                  key={offset}
                  src={neighbour.src}
                  alt=""
                  aria-hidden="true"
                  width={neighbour.width ?? 1200}
                  height={neighbour.height ?? 800}
                  sizes="96vw"
                  loading="eager"
                  className="hidden"
                />
              )
            )
          })}
        </DialogContent>
      </Dialog>
    </div>
  )
}
