'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortalData, PortalTweet } from '@/lib/portal/types'
import {
  comparePortalTweetChronology,
  selectHomepageStream,
} from '@/lib/portal/stream'
import { PORTAL_STREAM_POLL_INTERVAL_MS } from './live'
import { capturePostHogEvent } from '@/lib/posthog'
type PortalView = 'home' | 'stream'
function compareTweetIds(left: string, right: string): number {
  return left.length - right.length || left.localeCompare(right)
}

function newestCursor(tweets: PortalTweet[]) {
  return tweets.reduce<{ observedAt: string; id: string } | null>(
    (latest, tweet) => {
      if (!latest) return { observedAt: tweet.observedAt, id: tweet.id }
      const timeDiff =
        new Date(tweet.observedAt).getTime() -
        new Date(latest.observedAt).getTime()
      if (
        timeDiff > 0 ||
        (timeDiff === 0 && compareTweetIds(tweet.id, latest.id) > 0)
      ) {
        return { observedAt: tweet.observedAt, id: tweet.id }
      }
      return latest
    },
    null,
  )
}

function oldestPageCursor(tweets: PortalTweet[]) {
  const oldest = [...tweets].sort(comparePortalTweetChronology).at(-1)
  return oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null
}

export function usePortalStream(
  data: Pick<PortalData, 'initialStream'> & {
    failures: Pick<PortalData['failures'], 'initialStream'>
  },
  view: PortalView,
) {
  // ---- live stream state -------------------------------------------------
  const [visible, setVisible] = useState<PortalTweet[]>(data.initialStream)
  const [streamUnavailable, setStreamUnavailable] = useState(
    data.failures.initialStream,
  )
  const seenIds = useRef<Set<string>>(
    new Set(data.initialStream.map((t) => t.id)),
  )
  const updateCursor = useRef(newestCursor(data.initialStream))
  const pageCursor = useRef(oldestPageCursor(data.initialStream))
  const loadingMoreRef = useRef(false)
  const loadMoreTarget = useRef<HTMLDivElement>(null)
  const [hasMore, setHasMore] = useState(
    !data.failures.initialStream && data.initialStream.length >= 30,
  )
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const loadMore = useCallback(async () => {
    if (
      view !== 'stream' ||
      !hasMore ||
      loadingMoreRef.current ||
      !pageCursor.current
    ) {
      return
    }
    loadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const params = new URLSearchParams({
        before: pageCursor.current.createdAt,
        beforeId: pageCursor.current.id,
      })
      const res = await fetch(`/api/portal/stream?${params.toString()}`)
      if (!res.ok) return
      const {
        tweets,
        nextCursor,
        hasMore: nextHasMore,
      } = (await res.json()) as {
        tweets: PortalTweet[]
        nextCursor: { createdAt: string; id: string } | null
        hasMore: boolean
      }
      const older = tweets.filter((tweet) => !seenIds.current.has(tweet.id))
      older.forEach((tweet) => seenIds.current.add(tweet.id))
      if (older.length > 0) {
        setVisible((current) =>
          [...current, ...older].sort(comparePortalTweetChronology),
        )
      }
      pageCursor.current = nextCursor
      const canLoadMore = nextHasMore && nextCursor !== null
      setHasMore(canLoadMore)
      capturePostHogEvent('portal_stream_loaded_more', {
        loaded_tweet_count: older.length,
        has_more: canLoadMore,
      })
    } catch {
      // Keep the sentinel active so scrolling can retry after a network hiccup.
    } finally {
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [hasMore, view])

  useEffect(() => {
    const controller = new AbortController()
    let polling = false
    const applyHead = (tweets: PortalTweet[], nextHasMore: boolean) => {
      const head = [...tweets].sort(comparePortalTweetChronology)
      updateCursor.current = newestCursor(head)
      pageCursor.current = oldestPageCursor(head)
      if (view === 'stream') {
        setHasMore(nextHasMore && pageCursor.current !== null)
      }
      setVisible((current) => {
        const next =
          view === 'home'
            ? selectHomepageStream([...head, ...current], 30)
            : head
        seenIds.current = new Set(next.map((tweet) => tweet.id))
        return next
      })
    }
    const fetchHead = async () => {
      const response = await fetch('/api/portal/stream', {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!response.ok) return false
      const payload = (await response.json()) as {
        tweets: PortalTweet[]
        hasMore?: boolean
      }
      applyHead(payload.tweets, payload.hasMore ?? false)
      return true
    }
    const poll = async () => {
      if (polling) return
      polling = true
      try {
        const params = new URLSearchParams()
        const requestedHead = updateCursor.current === null
        if (updateCursor.current) {
          params.set('after', updateCursor.current.observedAt)
          params.set('afterId', updateCursor.current.id)
        }
        const res = await fetch(`/api/portal/stream?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!res.ok) {
          setStreamUnavailable(true)
          return
        }
        setStreamUnavailable(false)
        const {
          tweets,
          updateCursor: nextUpdateCursor,
          hasMore: nextHasMore,
          backlogTruncated,
        } = (await res.json()) as {
          tweets: PortalTweet[]
          updateCursor?: { observedAt: string; id: string } | null
          hasMore?: boolean
          backlogTruncated?: boolean
        }
        if (requestedHead) {
          applyHead(tweets, nextHasMore ?? false)
          return
        }
        if (backlogTruncated) {
          if (!(await fetchHead())) setStreamUnavailable(true)
          return
        }
        const responseCursor = nextUpdateCursor ?? newestCursor(tweets)
        if (responseCursor) updateCursor.current = responseCursor
        const fresh = tweets
          .filter((t) => !seenIds.current.has(t.id))
          .sort(
            (a, b) =>
              new Date(a.observedAt).getTime() -
                new Date(b.observedAt).getTime() || compareTweetIds(a.id, b.id),
          )
        if (fresh.length > 0) {
          fresh.forEach((t) => seenIds.current.add(t.id))
          setVisible((current) =>
            view === 'home'
              ? selectHomepageStream([...fresh, ...current], 30)
              : [...fresh, ...current].sort(comparePortalTweetChronology),
          )
        }
      } catch {
        if (!controller.signal.aborted) setStreamUnavailable(true)
        // network hiccup; try again next poll
      } finally {
        polling = false
      }
    }
    void poll()
    const interval = window.setInterval(
      () => void poll(),
      PORTAL_STREAM_POLL_INTERVAL_MS,
    )
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [view])

  useEffect(() => {
    if (view !== 'stream' || !hasMore) return
    const target = loadMoreTarget.current
    if (!target) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore()
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loadMore, view])

  return { visible, streamUnavailable, loadMoreTarget, isLoadingMore, hasMore }
}
