'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Quote } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import type { TweetData } from '@/components/TweetComponent'
import { formatNumber } from '@/lib/formatNumber'
import type {
  PortalMedia,
  PortalQuotedTweet,
  PortalTweet,
} from '@/lib/portal/types'

interface QuotingTweetsSidebarProps {
  tweets: TweetData[]
  totalCount: number
  targetTweet: TweetData
}

interface QuotesPageResponse {
  tweets: TweetData[]
  totalCount: number
  nextOffset: number | null
  error?: string
}

const PAGE_SIZE = 12

function portalMedia(media: TweetData['media']): PortalMedia[] {
  return (media ?? []).map((item) => ({
    url: item.media_url,
    type: item.media_type,
    width: item.width,
    height: item.height,
  }))
}

function quotedTweet(tweet: TweetData): PortalQuotedTweet {
  return {
    id: tweet.tweet_id,
    username: tweet.username,
    name: tweet.account_display_name,
    avatar: tweet.avatar_media_url,
    text: tweet.full_text,
    createdAt: tweet.created_at,
    likes: tweet.favorite_count,
    rts: tweet.retweet_count ?? 0,
    media: portalMedia(tweet.media),
  }
}

function portalTweet(tweet: TweetData, target: TweetData): PortalTweet {
  return {
    id: tweet.tweet_id,
    username: tweet.username,
    name: tweet.account_display_name,
    avatar: tweet.avatar_media_url,
    text: tweet.full_text,
    observedAt: tweet.created_at,
    createdAt: tweet.created_at,
    likes: tweet.favorite_count,
    rts: tweet.retweet_count ?? 0,
    media: portalMedia(tweet.media),
    quotedTweet: quotedTweet(target),
  }
}

function dedupeTweets(tweets: TweetData[]): TweetData[] {
  return Array.from(
    new Map(tweets.map((tweet) => [tweet.tweet_id, tweet])).values(),
  )
}

export default function QuotingTweetsSidebar({
  tweets: initialTweets,
  totalCount: initialTotalCount,
  targetTweet,
}: QuotingTweetsSidebarProps) {
  const [tweets, setTweets] = useState(initialTweets)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [nextOffset, setNextOffset] = useState<number | null>(
    initialTweets.length < initialTotalCount ? initialTweets.length : null,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)
  const requestControllerRef = useRef<AbortController | null>(null)

  const renderedTweets = useMemo(
    () => tweets.map((tweet) => portalTweet(tweet, targetTweet)),
    [targetTweet, tweets],
  )

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loadingRef.current) return

    const controller = new AbortController()
    requestControllerRef.current = controller
    loadingRef.current = true
    setIsLoading(true)
    setLoadError(null)

    try {
      const response = await fetch(
        `/api/tweets/${encodeURIComponent(targetTweet.tweet_id)}/quotes?offset=${nextOffset}&limit=${PAGE_SIZE}`,
        { signal: controller.signal },
      )
      const body = (await response
        .json()
        .catch(() => null)) as QuotesPageResponse | null
      if (!response.ok || !body || !Array.isArray(body.tweets)) {
        throw new Error(body?.error || 'Could not load more archived quotes')
      }

      setTweets((current) => dedupeTweets([...current, ...body.tweets]))
      setTotalCount(body.totalCount)
      setNextOffset(body.nextOffset)
    } catch (error) {
      if (controller.signal.aborted) return
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load more archived quotes',
      )
    } finally {
      if (!controller.signal.aborted) {
        loadingRef.current = false
        setIsLoading(false)
      }
    }
  }, [nextOffset, targetTweet.tweet_id])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || nextOffset === null) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore()
      },
      {
        root: isDesktop ? scrollContainerRef.current : null,
        rootMargin: '240px 0px',
      },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [isDesktop, loadMore, nextOffset])

  useEffect(
    () => () => {
      requestControllerRef.current?.abort()
    },
    [],
  )

  return (
    <aside
      aria-labelledby="quoting-tweets-heading"
      className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:min-h-0"
    >
      <div className="flex overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:h-full lg:min-h-0 lg:flex-col">
        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="flex flex-none items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Quote className="h-4 w-4 text-brand" aria-hidden="true" />
              <h2
                id="quoting-tweets-heading"
                className="font-semibold text-foreground"
              >
                Tweets quoting this
              </h2>
            </div>
            <span
              className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground"
              aria-label={`${totalCount} ${totalCount === 1 ? 'quote' : 'quotes'}`}
            >
              {formatNumber(totalCount)}
            </span>
          </div>

          {tweets.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Quote
                className="mx-auto h-7 w-7 text-muted-foreground/60"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium text-foreground">
                No archived quotes yet
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Tweets in Community Archive that quote this post will appear
                here.
              </p>
            </div>
          ) : (
            <div
              ref={scrollContainerRef}
              role="region"
              aria-label="Archived tweets quoting this post"
              tabIndex={0}
              className="min-h-0 divide-y divide-border overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/50 lg:flex-1 lg:overflow-y-auto"
            >
              {renderedTweets.map((tweet) => (
                <TweetCard key={tweet.id} tweet={tweet} clickable showDate />
              ))}

              {loadError ? (
                <div className="px-5 py-4 text-center">
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {loadError}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className="mt-2 text-xs font-semibold text-brand hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : null}

              {nextOffset !== null ? (
                <div
                  ref={loadMoreRef}
                  className="min-h-16 flex items-center justify-center px-5 py-3"
                >
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-brand disabled:cursor-wait disabled:opacity-60"
                  >
                    {isLoading ? (
                      <Loader2
                        aria-hidden="true"
                        className="h-3.5 w-3.5 animate-spin"
                      />
                    ) : null}
                    {isLoading ? 'Loading quotes…' : 'Load more quotes'}
                  </button>
                </div>
              ) : (
                <p className="px-5 py-3 text-center text-xs text-muted-foreground">
                  All {formatNumber(totalCount)} archived quotes loaded
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
