'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useNearViewport } from '@/hooks/useNearViewport'
import { PiArrowSquareOut, PiArticle } from 'react-icons/pi'
import type { TweetLinkPreview } from '@/lib/linkPreviewTypes'

// Share only in-flight reads, not policy-sensitive results across later visits.
const pendingPreviews = new Map<string, Promise<TweetLinkPreview[]>>()
function loadPreviews(tweetId: string) {
  const pending = pendingPreviews.get(tweetId)
  if (pending) return pending
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10_000)
  const request = fetch(
    `/api/tweets/${encodeURIComponent(tweetId)}/link-previews`,
    { signal: controller.signal },
  )
    .then(async (response) => {
      if (!response.ok) return []
      const body = (await response.json()) as { previews?: TweetLinkPreview[] }
      return Array.isArray(body.previews) ? body.previews : []
    })
    .catch(() => [])
    .finally(() => {
      window.clearTimeout(timeout)
      pendingPreviews.delete(tweetId)
    })
  pendingPreviews.set(tweetId, request)
  return request
}

export function TweetLinkPreviews({
  tweetId,
  compact = false,
}: {
  tweetId: string
  compact?: boolean
}) {
  const { ref, visible } = useNearViewport()
  const [result, setResult] = useState<{
    tweetId: string
    previews: TweetLinkPreview[]
  }>({ tweetId, previews: [] })
  const previews = result.tweetId === tweetId ? result.previews : []
  useEffect(() => {
    if (!visible) return
    let current = true
    void loadPreviews(tweetId).then((previews) => {
      if (current) setResult({ tweetId, previews })
    })
    return () => {
      current = false
    }
  }, [tweetId, visible])

  return (
    <div ref={ref} className={previews.length ? 'mt-2 space-y-2' : 'min-h-px'}>
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
                unoptimized
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
