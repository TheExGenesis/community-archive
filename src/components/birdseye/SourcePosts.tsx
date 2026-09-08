'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TweetCard } from '@/components/TweetCard'
import type { PortalTweet } from '@/lib/portal/types'

type SourceTweet = PortalTweet & { threadId?: string }

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
  const [tweets, setTweets] = useState<SourceTweet[]>([])
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
        tweets: SourceTweet[]
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
  const threads = new Map<string, SourceTweet[]>()
  for (const tweet of tweets) {
    const key = tweet.threadId ?? tweet.id
    threads.set(key, [...(threads.get(key) ?? []), tweet])
  }
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
        Posts by @{username} and cited replies in their conversations. Quoted
        posts appear inside the quoting tweet. Some sources may no longer be
        available.
      </p>
      {Array.from(threads.entries()).map(([threadId, posts]) => (
        <div
          key={threadId}
          role="group"
          aria-label={
            posts.length > 1
              ? `Reply thread · ${posts.length} posts`
              : 'Source post'
          }
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          {posts.length > 1 && (
            <p className="border-b border-border/50 bg-muted/25 px-4 py-2 text-xs font-semibold text-muted-foreground">
              Reply thread · {posts.length} posts
            </p>
          )}
          {posts.map((tweet, index) => (
            <div
              id={`source-${tweet.id}`}
              key={tweet.id}
              className={
                posts.length > 1
                  ? 'relative ml-5 border-l-2 border-brand/25 pl-2'
                  : ''
              }
            >
              {posts.length > 1 && (
                <span
                  aria-hidden="true"
                  className="absolute -left-[5px] top-5 h-2 w-2 rounded-full bg-brand/60"
                />
              )}
              <p className="px-4 pt-2 text-[11px] text-muted-foreground">
                {index > 0 && <span className="mr-2 text-brand">↳</span>}
                {tweet.username.toLowerCase() === username.toLowerCase()
                  ? `By @${username}`
                  : `Conversation context · @${tweet.username}`}
              </p>
              <TweetCard tweet={tweet} noClamp showDate showExternalLink />
            </div>
          ))}
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
