'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { PiArrowSquareOut, PiArticle } from 'react-icons/pi'
import type { TweetLinkPreview } from '@/lib/linkPreviewTypes'

export function TweetLinkPreviews({
  tweetId,
  compact = false,
}: {
  tweetId: string
  compact?: boolean
}) {
  const [previews, setPreviews] = useState<TweetLinkPreview[]>([])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/tweets/${encodeURIComponent(tweetId)}/link-previews`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { previews: [] }
        return (await response.json()) as { previews?: TweetLinkPreview[] }
      })
      .then((body) => {
        if (Array.isArray(body.previews)) setPreviews(body.previews)
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return
      })
    return () => controller.abort()
  }, [tweetId])

  if (previews.length === 0) return null
  return (
    <div className="mt-2 space-y-2">
      {previews.map((preview) => (
        <a
          key={preview.urlHash}
          href={preview.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={`group flex overflow-hidden rounded-[6px] border border-zinc-200 bg-zinc-50 transition-colors hover:border-zinc-300 dark:border-[#303036] dark:bg-[#202023] dark:hover:border-[#45454d] ${compact ? 'min-h-16' : 'min-h-20'}`}
        >
          {preview.imageUrl && !compact ? (
            <div className="relative w-28 flex-none bg-muted sm:w-36">
              <Image
                src={`/api/link-preview/image?hash=${preview.urlHash}`}
                alt=""
                fill
                sizes="144px"
                className="object-cover"
              />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 p-2.5">
            <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-[#a7a7b4]">
              {preview.isXArticle ? (
                <PiArticle className="h-3.5 w-3.5" aria-hidden="true" />
              ) : null}
              <span>{preview.isXArticle ? 'X Article' : preview.siteName}</span>
              <PiArrowSquareOut
                className="ml-auto h-3.5 w-3.5 opacity-60"
                aria-hidden="true"
              />
            </div>
            <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-800 dark:text-zinc-100">
              {preview.title}
            </div>
            {!compact && preview.description ? (
              <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-zinc-500 dark:text-[#a7a7b4]">
                {preview.description}
              </div>
            ) : null}
          </div>
        </a>
      ))}
    </div>
  )
}
