'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TweetCard } from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'

export function SourcePosts({
  username,
  clusterId,
  total,
  excludeIds = [],
}: {
  username: string
  clusterId: string
  total: number
  excludeIds?: string[]
}) {
  const excluded = excludeIds.join(',')
  const [tweets, setTweets] = useState<PortalTweet[]>([])
  const [offset, setOffset] = useState<number | null>(total ? 0 : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sentinel = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  const controller = useRef<AbortController>()
  const load = useCallback(async () => {
    if (inFlight.current || offset === null) return
    inFlight.current = true
    const abort = new AbortController()
    controller.current = abort
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({
        username,
        cluster_id: clusterId,
        offset: String(offset),
      })
      if (excluded) query.set('exclude', excluded)
      const response = await fetch(`/api/birdseye/sources?${query}`, {
        signal: abort.signal,
        cache: 'no-store',
      })
      if (!response.ok) {
        if (response.status === 404) setTweets([])
        throw new Error(
          response.status === 404
            ? 'This Birdseye is no longer available.'
            : 'Source posts could not load. Please try again.',
        )
      }
      const result = (await response.json()) as {
        tweets: PortalTweet[]
        nextOffset: number | null
      }
      setTweets((previous) => [
        ...previous,
        ...result.tweets.filter(
          (tweet) => !previous.some((p) => p.id === tweet.id),
        ),
      ])
      setOffset(result.nextOffset)
    } catch (err) {
      if (!abort.signal.aborted)
        setError(err instanceof Error ? err.message : 'Please try again.')
    } finally {
      inFlight.current = false
      if (!abort.signal.aborted) setLoading(false)
    }
  }, [username, clusterId, offset, excluded])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!sentinel.current || error || offset === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load()
      },
      { rootMargin: '250px' },
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [load, error, offset])
  return (
    <section aria-label="Source posts" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-sans text-xl font-bold">
          {excluded ? 'More source posts' : 'Source posts'}
        </h3>
        <span className="text-xs text-muted-foreground">
          {total} cited posts
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Posts load a few at a time. Some cited posts may no longer be available.
      </p>
      {tweets.map((tweet) => (
        <div
          id={`source-${tweet.id}`}
          key={tweet.id}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <p className="px-4 pt-3 text-xs text-muted-foreground">
            {tweet.username.toLowerCase() === username.toLowerCase()
              ? `By @${username}`
              : `Conversation context · @${tweet.username}`}
          </p>
          <TweetCard tweet={tweet} noClamp showDate showExternalLink />
        </div>
      ))}
      <div ref={sentinel} className="py-4 text-center">
        {error && (
          <p role="alert" className="mb-3 text-sm text-muted-foreground">
            {error}
          </p>
        )}
        {offset !== null ? (
          <button
            disabled={loading}
            onClick={() => void load()}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {loading
              ? 'Loading posts…'
              : error
                ? 'Try again'
                : 'Load more posts'}
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {tweets.length
              ? 'You’ve reached the end of the sources.'
              : 'No source posts are currently available.'}
          </p>
        )}
      </div>
    </section>
  )
}
