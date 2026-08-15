'use client'

import { useState, useEffect, useCallback } from 'react'
import UnifiedTweetList from '@/components/UnifiedTweetList'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { createBrowserClient } from '@/utils/supabase'
import { SupabaseClient } from '@supabase/supabase-js'
import { TimelineTweet } from '@/lib/types'
import {
  FilterCriteria,
  fetchTweets,
  type TweetSearchSort,
} from '@/lib/queries/tweetQueries'
import {
  canPreviewTweetSearch,
  searchTweetPreviewsWithClickHouse,
} from '@/lib/clickhouseSearch'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { TweetOrigin } from '@/lib/navigation'

interface TweetListProps {
  filterCriteria: FilterCriteria
  itemsPerPage?: number
  showCsvExportButton?: boolean
  csvExportFilename?: string
  resultsHeading?: string
  resultsDescription?: string
  collapseLongTweets?: boolean
  compact?: boolean
  permalinkOrigin?: TweetOrigin
  permalinkReturnTo?: string
  onSearchSortChange?: (sort: TweetSearchSort) => void
}

const DEFAULT_ITEMS_PER_PAGE = 20

export default function TweetList({
  filterCriteria,
  itemsPerPage = DEFAULT_ITEMS_PER_PAGE,
  showCsvExportButton = true,
  csvExportFilename = 'tweets_export.csv',
  resultsHeading,
  resultsDescription,
  collapseLongTweets = false,
  compact = false,
  permalinkOrigin,
  permalinkReturnTo,
  onSearchSortChange,
}: TweetListProps) {
  const [tweets, setTweets] = useState<TimelineTweet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isCompletingPreview, setIsCompletingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)
  const [lastFetchCount, setLastFetchCount] = useState<number>(0)

  useEffect(() => {
    setSupabase(createBrowserClient())
  }, [])

  const loadTweets = useCallback(
    async (pageToLoad: number, criteria: FilterCriteria) => {
      if (!supabase) return

      if (pageToLoad === 1) {
        setIsLoading(true)
        setIsCompletingPreview(false)
        setTweets([])
      } else {
        setIsLoadingMore(true)
      }
      setError(null)

      try {
        if (pageToLoad === 1 && canPreviewTweetSearch(criteria)) {
          try {
            const preview = await searchTweetPreviewsWithClickHouse(criteria)
            if (preview.definitiveEmpty) {
              setTweets([])
              setIsLoading(false)
              setLastFetchCount(0)
              setTotalCount(0)
              setCurrentPage(1)
              return
            }
            if (preview.tweets.length > 0) {
              setTweets(preview.tweets)
              setIsLoading(false)
              setIsCompletingPreview(true)
            }
          } catch (previewError) {
            console.warn(
              'Could not load the progressive tweet preview:',
              previewError,
            )
          }
        }

        const {
          tweets: fetchedTweets,
          error: fetchError,
          totalCount: fetchedTotalCount,
        } = await fetchTweets(supabase, criteria, pageToLoad, itemsPerPage)

        if (fetchError) {
          throw fetchError
        }

        setTweets((prevTweets) =>
          pageToLoad === 1 ? fetchedTweets : [...prevTweets, ...fetchedTweets],
        )
        setLastFetchCount(fetchedTweets.length)
        if (fetchedTotalCount !== null) {
          setTotalCount(fetchedTotalCount)
        }
        setCurrentPage(pageToLoad)
      } catch (e: any) {
        console.error('Failed to load tweets for list:', e)
        setError(e.message || 'Failed to load tweets.')
      } finally {
        if (pageToLoad === 1) {
          setIsLoading(false)
          setIsCompletingPreview(false)
        } else {
          setIsLoadingMore(false)
        }
      }
    },
    [supabase, itemsPerPage],
  )

  useEffect(() => {
    if (supabase) {
      setCurrentPage(1)
      setTotalCount(null)
      setLastFetchCount(0)
      loadTweets(1, filterCriteria)
    }
  }, [supabase, filterCriteria, loadTweets])

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMoreTweets) {
      loadTweets(currentPage + 1, filterCriteria)
    }
  }

  const hasMoreTweets =
    totalCount !== null
      ? currentPage * itemsPerPage < totalCount
      : lastFetchCount === itemsPerPage

  if (isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading tweets">
        <div className="flex items-center justify-between border-b border-border pb-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="rounded-xl border border-border bg-card p-5"
          >
            <div className="flex gap-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error && tweets.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Search could not be completed</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  // Convert TimelineTweet to raw tweet format for consistency
  const rawTweets = tweets.map((tweet) => ({
    tweet_id: tweet.tweet_id,
    account_id: tweet.account_id || '',
    created_at: tweet.created_at,
    full_text: tweet.full_text,
    retweet_count: tweet.retweet_count,
    favorite_count: tweet.favorite_count,
    reply_to_tweet_id: tweet.reply_to_tweet_id,
    quote_tweet_id: tweet.quote_tweet_id || null,
    quoted_tweet: tweet.quoted_tweet,
    retweeted_tweet_id: null,
    avatar_media_url: tweet.account.profile?.avatar_media_url || null,
    username: tweet.account.username,
    account_display_name: tweet.account.account_display_name,
    // Use raw format for account data
    account: {
      username: tweet.account.username,
      account_display_name: tweet.account.account_display_name,
      profile: tweet.account.profile
        ? {
            avatar_media_url: tweet.account.profile.avatar_media_url,
          }
        : undefined,
    },
    media: tweet.media || [],
    urls: [],
    mentioned_users: [], // TimelineTweet doesn't have this
  }))

  return (
    <div className={compact ? 'space-y-5' : 'space-y-8'}>
      <UnifiedTweetList
        tweets={rawTweets}
        isLoading={isLoading}
        emptyMessage="No tweets to display for the current filters."
        className="space-y-4"
        showCsvExport={showCsvExportButton && !isCompletingPreview}
        csvFilename={csvExportFilename}
        headerTitle={
          resultsHeading
            ? `${resultsHeading} · ${new Intl.NumberFormat().format(
                totalCount ?? tweets.length,
              )}${totalCount === null ? ' loaded' : ''}`
            : undefined
        }
        headerDescription={resultsDescription}
        collapseLongTweets={collapseLongTweets}
        compact={compact}
        permalinkOrigin={permalinkOrigin}
        permalinkReturnTo={permalinkReturnTo}
        searchSort={filterCriteria.sort}
        onSearchSortChange={onSearchSortChange}
      />

      {isCompletingPreview && (
        <div
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the remaining results…
        </div>
      )}

      {error && tweets.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>More results could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {hasMoreTweets && (
        <div className="mt-8 flex justify-center">
          <Button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            variant="outline"
            className="min-w-36"
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}
