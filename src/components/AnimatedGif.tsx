'use client'

import { useEffect, useRef, useState } from 'react'

interface AnimatedGifProps {
  /** Silent looping MP4 that Twitter serves for the GIF. */
  videoUrl: string
  /** Still thumbnail shown until the video is ready, or if it never loads. */
  poster: string
  alt: string
  width: number
  height: number
  className?: string
}

/**
 * Plays a Twitter animated GIF once it scrolls into view.
 *
 * Twitter's video CDN rejects requests that carry another site's Referer, and
 * a media element cannot opt out of sending one, so the clip is fetched
 * without a referrer and played from a blob URL.
 */
export default function AnimatedGif({
  videoUrl,
  poster,
  alt,
  width,
  height,
  className,
}: AnimatedGifProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [visible, setVisible] = useState(false)
  const [src, setSrc] = useState<string>()

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    fetch(videoUrl, {
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GIF video ${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {
        // Keep the still thumbnail.
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [visible, videoUrl])

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      aria-label={alt}
      width={width}
      height={height}
      autoPlay
      loop
      muted
      playsInline
      className={className}
    />
  )
}
