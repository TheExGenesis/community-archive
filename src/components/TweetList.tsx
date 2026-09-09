'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
import { capturePostHogEvent } from '@/lib/posthog'
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
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false)
  const activeRequest = useRef<{
    controller: AbortController
    previewController: AbortController
  } | null>(null)
  const criteriaKey = JSON.stringify(filterCriteria)
  const stableCriteria = useMemo<FilterCriteria>(
    () => JSON.parse(criteriaKey),
    [criteriaKey],
  )
  const [error, setError] = useState<string | null>(null)
  const [failedPage, setFailedPage] = useState(1)
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
      activeRequest.current?.controller.abort()
      activeRequest.current?.previewController.abort()
      const request = {
        controller: new AbortController(),
        previewController: new AbortController(),
      }
      activeRequest.current = request
      const signal = request.controller.signal
      const isCurrent = () =>
        activeRequest.current === request && !signal.aborted
      const startedAt = performance.now()
      const reportReceived = (phase: 'preview' | 'canonical', count: number) =>
        capturePostHogEvent('search_results_received', {
          phase,
          result_count: count,
          elapsed_ms: Math.round(performance.now() - startedAt),
          page: pageToLoad,
        })
      let canonicalReady = false
      let definitiveEmpty = false

      if (pageToLoad === 1) {
        setIsLoading(true)
        setIsCompletingPreview(false)
        setIsLoadingQuotes(false)
        setTweets([])
        setTotalCount(null)
        setLastFetchCount(0)
        setCurrentPage(1)
      } else {
        setIsLoadingMore(true)
      }
      setError(null)

      try {
        if (pageToLoad === 1 && canPreviewTweetSearch(criteria)) {
          const preview = searchTweetPreviewsWithClickHouse(
            criteria,
            undefined,
            request.previewController.signal,
          )
            .then((result) => {
              if (
                !isCurrent() ||
                canonicalReady ||
                request.previewController.signal.aborted
              )
                return
              if (result.definitiveEmpty) {
                definitiveEmpty = true
                setTweets([])
                setIsLoading(false)
                setIsCompletingPreview(false)
                setLastFetchCount(0)
                setTotalCount(0)
                request.controller.abort()
              } else if (result.tweets.length > 0) {
                reportReceived('preview', result.tweets.length)
                setTweets(result.tweets)
                setIsLoading(false)
                setIsCompletingPreview(true)
              }
            })
            .catch((error) => {
              if (isCurrent() && !request.previewController.signal.aborted) {
                console.warn(
                  'Could not load the progressive tweet preview:',
                  error,
                )
              }
            })
          // Let fast/definitively empty previews avoid another query, but never
          // let a slow preview hold the canonical page behind it indefinitely.
          let release!: () => void
          let timer: ReturnType<typeof setTimeout> | undefined
          const headStart = new Promise<void>((resolve) => {
            release = resolve
            timer = setTimeout(resolve, 250)
            signal.addEventListener('abort', release, { once: true })
          })
          await Promise.race([preview, headStart])
          clearTimeout(timer)
          signal.removeEventListener('abort', release)
          if (!isCurrent() || definitiveEmpty) return
        }

        const result = await fetchTweets(
          supabase,
          criteria,
          pageToLoad,
          itemsPerPage,
          {
            signal,
            onBaseTweets:
              pageToLoad === 1
                ? (baseTweets) => {
                    if (!isCurrent()) return
                    reportReceived('canonical', baseTweets.length)
                    canonicalReady = true
                    request.previewController.abort()
                    setTweets(baseTweets)
                    setIsLoading(false)
                    setIsCompletingPreview(false)
                    setIsLoadingQuotes(true)
                  }
                : undefined,
          },
        )
        if (!isCurrent()) return
        if (result.error) throw result.error
        if (!canonicalReady) reportReceived('canonical', result.tweets.length)
        canonicalReady = true
        setTweets((previous) =>
          pageToLoad === 1 ? result.tweets : [...previous, ...result.tweets],
        )
        setLastFetchCount(result.tweets.length)
        if (result.totalCount !== null) setTotalCount(result.totalCount)
        setCurrentPage(pageToLoad)
      } catch (error) {
        if (!isCurrent()) return
        capturePostHogEvent('search_results_failed', {
          error_category: 'request_failed',
          elapsed_ms: Math.round(performance.now() - startedAt),
        })
        setFailedPage(pageToLoad)
        console.error('Failed to load tweets for list:', error)
        setError(
          error &&
            typeof error === 'object' &&
            'message' in error &&
            typeof error.message === 'string'
            ? error.message
            : 'Failed to load tweets.',
        )
      } finally {
        request.previewController.abort()
        if (isCurrent()) {
          setIsLoading(false)
          setIsCompletingPreview(false)
          setIsLoadingQuotes(false)
          setIsLoadingMore(false)
        }
      }
    },
    [supabase, itemsPerPage],
  )

  useEffect(() => {
    if (supabase) void loadTweets(1, stableCriteria)
    return () => {
      activeRequest.current?.controller.abort()
      activeRequest.current?.previewController.abort()
    }
  }, [supabase, stableCriteria, loadTweets])

  const handleLoadMore = () => {
    if (
      !isLoadingMore &&
      !isCompletingPreview &&
      !isLoadingQuotes &&
      hasMoreTweets
    ) {
      void loadTweets(currentPage + 1, stableCriteria)
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
            className="rounded-lg border border-border bg-card p-5"
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
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void loadTweets(failedPage, stableCriteria)}
        >
          Retry search
        </Button>
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
        highlightQuery={filterCriteria.rawSearchQuery}
        tweets={rawTweets}
        isLoading={isLoading}
        emptyMessage="No tweets to display for the current filters."
        className="space-y-4"
        showCsvExport={
          showCsvExportButton && !isCompletingPreview && !isLoadingQuotes
        }
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

      {(isCompletingPreview || isLoadingQuotes) && (
        <div
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {isLoadingQuotes
            ? 'Loading quoted tweets…'
            : 'Loading the remaining results…'}
        </div>
      )}

      {error && tweets.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>More results could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void loadTweets(failedPage, stableCriteria)}
          >
            Retry search
          </Button>
        </Alert>
      )}
      {hasMoreTweets && (
        <div className="mt-8 flex justify-center">
          <Button
            onClick={handleLoadMore}
            disabled={isLoadingMore || isCompletingPreview || isLoadingQuotes}
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
