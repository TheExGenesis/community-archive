'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import TweetComponent from './TweetComponent'
import {
  buildConversationTree,
  type ConversationTree,
  type ThreadTweet,
} from '@/lib/threadTree'

interface ThreadViewProps {
  tree: ConversationTree
  highlightTweetId?: string
  className?: string
  totalCount?: number
  nextCursor?: ThreadCursor | null
}

interface ThreadCursor {
  createdAt: string
  tweetId: string
}

interface ThreadPageResponse {
  tweets: ThreadTweet[]
  totalCount: number
  nextCursor: ThreadCursor | null
  error?: string
}

const PAGE_SIZE = 12

function realTweets(tree: ConversationTree): ThreadTweet[] {
  return Object.values(tree.tweets).filter(
    (tweet) => !tweet.is_deleted_placeholder,
  )
}

export const ThreadView: React.FC<ThreadViewProps> = ({
  tree: initialTree,
  highlightTweetId,
  className = '',
  totalCount: initialTotalCount,
  nextCursor: initialNextCursor,
}) => {
  const [tree, setTree] = useState(initialTree)
  const [totalCount, setTotalCount] = useState(
    () => initialTotalCount ?? realTweets(initialTree).length,
  )
  const [nextCursor, setNextCursor] = useState<ThreadCursor | null>(
    initialNextCursor ?? null,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)
  const requestControllerRef = useRef<AbortController | null>(null)

  const loadMore = useCallback(async () => {
    if (!nextCursor || !highlightTweetId || loadingRef.current) return

    const controller = new AbortController()
    requestControllerRef.current = controller
    loadingRef.current = true
    setIsLoading(true)
    setLoadError(null)

    try {
      const searchParams = new URLSearchParams({
        limit: String(PAGE_SIZE),
        after: nextCursor.createdAt,
        after_id: nextCursor.tweetId,
      })
      const response = await fetch(
        `/api/tweets/${encodeURIComponent(highlightTweetId)}/thread?${searchParams}`,
        { signal: controller.signal },
      )
      const body = (await response
        .json()
        .catch(() => null)) as ThreadPageResponse | null
      if (!response.ok || !body || !Array.isArray(body.tweets)) {
        throw new Error(body?.error || 'Could not load more of this thread')
      }

      setTree((current) =>
        buildConversationTree(
          Array.from(
            new Map(
              [...realTweets(current), ...body.tweets].map((tweet) => [
                tweet.tweet_id,
                tweet,
              ]),
            ).values(),
          ),
        ),
      )
      setTotalCount(body.totalCount)
      setNextCursor(body.nextCursor)
    } catch (error) {
      if (controller.signal.aborted) return
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load more of this thread',
      )
    } finally {
      if (!controller.signal.aborted) {
        loadingRef.current = false
        setIsLoading(false)
      }
    }
  }, [highlightTweetId, nextCursor])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !nextCursor) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore()
      },
      { rootMargin: '320px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [loadMore, nextCursor])

  useEffect(
    () => () => {
      requestControllerRef.current?.abort()
    },
    [],
  )

  // Convert ThreadTweet to TweetData format for TweetComponent
  const convertToTweetData = (tweet: ThreadTweet) => ({
    tweet_id: tweet.tweet_id,
    account_id: tweet.account_id,
    created_at: tweet.created_at,
    full_text: tweet.full_text,
    retweet_count: tweet.retweet_count,
    favorite_count: tweet.favorite_count,
    reply_to_tweet_id: tweet.reply_to_tweet_id,
    quote_tweet_id: tweet.quote_tweet_id || null,
    quoted_tweet: tweet.quoted_tweet || undefined,
    retweeted_tweet_id: null,
    avatar_media_url: tweet.avatar_media_url || null,
    username: tweet.username,
    account_display_name: tweet.account_display_name,
    media: tweet.media || [],
    urls: [],
    reply_to_username: tweet.reply_to_username || undefined,
  })

  // Render tweet with children recursively
  const renderTweetWithThread = (
    tweetId: string,
    depth: number = 0,
  ): JSX.Element => {
    const tweet = tree.tweets[tweetId]
    const children = tree.children[tweetId] || []
    const isHighlighted = highlightTweetId === tweetId
    // Descendants inherit this first reply wrapper, keeping the rail visible
    // without consuming more horizontal space at every level.
    const replyRail = depth === 1 ? 'border-l-2 border-border pl-3 sm:pl-4' : ''

    return (
      <div key={tweetId} className={`thread-tweet-container ${replyRail}`}>
        {tweet.is_deleted_placeholder ? (
          // Tombstone — deleted from the archive AND syndication couldn't find it.
          <div className="mb-4 rounded-lg border border-dashed border-border bg-muted p-4 text-sm italic text-muted-foreground dark:bg-card">
            [Tweet deleted]
          </div>
        ) : (
          <div
            className={`
            ${isHighlighted ? 'border-brand/50 bg-card ring-1 ring-brand/20' : tweet.from_external ? 'border-dashed border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/10' : 'border-border bg-card'}
            relative mb-4 rounded-lg border p-4 sm:p-5
          `}
          >
            {tweet.from_external && (
              // Hydrated at render time from Twitter syndication — not stored in our
              // archive, not returned in search.
              <span className="absolute right-3 top-3 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                from Twitter · not archived
              </span>
            )}
            <TweetComponent
              tweet={convertToTweetData(tweet)}
              isPermalinkPage={isHighlighted}
            />
          </div>
        )}

        {children.length > 0 && (
          <div className="thread-children">
            {[...children]
              .sort((a, b) => {
                const tweetA = tree.tweets[a]
                const tweetB = tree.tweets[b]
                return (
                  new Date(tweetA.created_at).getTime() -
                  new Date(tweetB.created_at).getTime()
                )
              })
              .map((childId) => renderTweetWithThread(childId, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Render all roots. When some parent tweets in the conversation were deleted, each
  // surviving orphan reply gets a synthesized placeholder parent that becomes its own
  // root, so the tree can have more than one.
  const allRoots =
    tree.roots && tree.roots.length > 0
      ? tree.roots
      : tree.root
        ? [tree.root]
        : []

  if (allRoots.length === 0) {
    return (
      <div className={`${className} py-8 text-center`}>
        <p className="text-muted-foreground">No thread structure found</p>
      </div>
    )
  }

  return (
    <div className={`thread-view ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-foreground">Thread</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {totalCount} {totalCount === 1 ? 'tweet' : 'tweets'}
        </span>
      </div>
      <div className="thread-container">
        {allRoots.map((rootId) => (
          <React.Fragment key={rootId}>
            {renderTweetWithThread(rootId)}
          </React.Fragment>
        ))}
      </div>

      {loadError ? (
        <div className="py-4 text-center">
          <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadMore()}
            className="mt-2 text-xs font-semibold text-brand hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {nextCursor ? (
        <div
          ref={loadMoreRef}
          className="min-h-16 flex items-center justify-center py-3"
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
            {isLoading ? 'Loading thread…' : 'Load more of this thread'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default ThreadView
