'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatNumber } from '@/lib/formatNumber'
import { tweetPermalinkHref } from '@/lib/navigation'
import {
  PROFILE_MEDIA_PAGE_LIMIT,
  type ProfileMediaPageState,
} from '@/lib/metaTwitter/profileMediaPagination'
import type { ArchiveMediaItem } from '@/lib/metaTwitter/types'

const mergeMedia = (
  current: ArchiveMediaItem[],
  incoming: ArchiveMediaItem[],
) => {
  const seen = new Set(current.map((item) => item.media_url))
  return [
    ...current,
    ...incoming.filter((item) => {
      if (seen.has(item.media_url)) return false
      seen.add(item.media_url)
      return true
    }),
  ]
}

export function ProfileMediaGallery({
  accountId,
  initialMedia,
  mediaCount,
  onOpenChange,
  returnTo,
  year,
}: {
  accountId: string
  initialMedia: ArchiveMediaItem[]
  mediaCount: number
  onOpenChange: (open: boolean) => void
  returnTo: string
  year: number | null
}) {
  const [media, setMedia] = useState(initialMedia)
  const [nextOffset, setNextOffset] = useState<number | null>(
    initialMedia.length < mediaCount ? initialMedia.length : null,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialRequestStarted = useRef(false)

  const loadMore = useCallback(async () => {
    if (nextOffset === null || isLoading) return
    setIsLoading(true)
    setError(null)
    const params = new URLSearchParams({
      limit: String(PROFILE_MEDIA_PAGE_LIMIT),
      offset: String(nextOffset),
    })
    if (year !== null) params.set('year', String(year))
    try {
      const response = await fetch(
        `/api/profile/${encodeURIComponent(accountId)}/media?${params}`,
      )
      if (!response.ok) throw new Error('Profile media request failed')
      const page = (await response.json()) as ProfileMediaPageState
      if (!Array.isArray(page.media)) {
        throw new Error('Profile media response was invalid')
      }
      setMedia((current) => mergeMedia(current, page.media))
      setNextOffset(page.nextOffset)
    } catch {
      setError('More photos could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }, [accountId, isLoading, nextOffset, year])

  useEffect(() => {
    if (initialRequestStarted.current || nextOffset === null) return
    initialRequestStarted.current = true
    void loadMore()
  }, [loadMore, nextOffset])

  const remaining = Math.max(0, mediaCount - media.length)

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Profile media</DialogTitle>
          <DialogDescription>
            Showing {formatNumber(media.length)} of {formatNumber(mediaCount)}{' '}
            archived photos. Open one to view its post.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((item) => (
            <Link
              key={item.media_url}
              href={tweetPermalinkHref(item.tweet_id, 'profile', returnTo)}
              className="relative aspect-square overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image
                src={item.media_url}
                alt="Archived post media"
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
                className="object-cover transition-transform hover:scale-[1.02]"
              />
            </Link>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}
        {nextOffset !== null && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoading}
            className="mx-auto rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:cursor-wait disabled:opacity-60"
          >
            {isLoading
              ? 'Loading more photos…'
              : error
                ? 'Retry loading photos'
                : `Load ${formatNumber(Math.min(PROFILE_MEDIA_PAGE_LIMIT, remaining))} more photos`}
          </button>
        )}
      </DialogContent>
    </Dialog>
  )
}
