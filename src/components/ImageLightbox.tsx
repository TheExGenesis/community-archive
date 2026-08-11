'use client'

import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/utils/tailwind'

interface ImageLightboxProps {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  imageClassName?: string
  sizes?: string
}

export default function ImageLightbox({
  src,
  alt,
  width = 1200,
  height = 800,
  className,
  imageClassName,
  sizes,
}: ImageLightboxProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative block cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
            className,
          )}
          aria-label={`Enlarge ${alt.toLowerCase()}`}
        >
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            sizes={sizes}
            className={imageClassName}
          />
        </button>
      </DialogTrigger>
      <DialogContent className="w-auto max-w-[96vw] border-0 bg-transparent p-0 shadow-none [&>button:hover]:bg-black/90 [&>button]:right-2 [&>button]:top-2 [&>button]:rounded-full [&>button]:bg-black/70 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-100">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <DialogDescription className="sr-only">
          Enlarged image. Press Escape or click outside the image to close.
        </DialogDescription>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes="96vw"
          className="h-auto max-h-[92vh] w-[min(96vw,1200px)] max-w-[96vw] rounded-md object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}
