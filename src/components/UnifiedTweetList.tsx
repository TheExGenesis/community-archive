'use client'

import React from 'react'
import TweetComponent from './TweetComponent'
import { Button } from '@/components/ui/button'
import { Download, SearchX } from 'lucide-react'

interface UnifiedTweetListProps {
  tweets: any[]
  isLoading?: boolean
  emptyMessage?: string
  className?: string
  showCsvExport?: boolean
  csvFilename?: string
  headerTitle?: string
  headerDescription?: string
  collapseLongTweets?: boolean
}

/**
 * Unified TweetList component that handles displaying tweets consistently across the app.
 * This component ensures all tweets are passed to TweetComponent in the correct raw format,
 * maintaining consistency for features like RT avatars, quote tweets, etc.
 */
export default function UnifiedTweetList({
  tweets,
  isLoading = false,
  emptyMessage = 'No tweets found',
  className = 'space-y-4',
  showCsvExport = false,
  csvFilename = 'tweets_export.csv',
  headerTitle,
  headerDescription,
  collapseLongTweets = false,
}: UnifiedTweetListProps) {
  const handleExportCsv = () => {
    if (tweets.length === 0) {
      alert('No tweets to export.')
      return
    }

    const headers = [
      'tweet_id',
      'created_at',
      'full_text',
      'favorite_count',
      'retweet_count',
      'username',
      'account_display_name',
      'reply_to_tweet_id',
    ]
    const csvRows = [
      headers.join(','),
      ...tweets.map((tweet) => {
        // Extract username and display name from either flattened or nested format
        const username = tweet.username || tweet.account?.username || ''
        const displayName =
          tweet.account_display_name ||
          tweet.account?.account_display_name ||
          ''

        return [
          `"${tweet.tweet_id}"`,
          `"${tweet.created_at}"`,
          `"${tweet.full_text?.replace(/"/g, '""')?.replace(/\n/g, '\\n') || ''}"`,
          tweet.favorite_count || 0,
          tweet.retweet_count || 0,
          `"${username}"`,
          `"${displayName}"`,
          `"${tweet.reply_to_tweet_id || ''}"`,
        ].join(',')
      }),
    ]
    const csvString = csvRows.join('\r\n')
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', csvFilename)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="text-xl text-muted-foreground">Loading tweets...</div>
      </div>
    )
  }

  if (!tweets.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <SearchX className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-4 text-base font-medium text-foreground">
          {emptyMessage}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Try fewer words or remove one of the filters.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {(headerTitle || headerDescription || showCsvExport) && (
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {headerTitle && (
              <h2 className="text-2xl font-semibold text-foreground">
                {headerTitle}
              </h2>
            )}
            {headerDescription && (
              <p className="mt-1 text-sm text-muted-foreground">
                {headerDescription}
              </p>
            )}
          </div>
          {showCsvExport && tweets.length > 0 && (
            <Button
              onClick={handleExportCsv}
              variant="outline"
              size="sm"
              className="self-start sm:self-auto"
            >
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          )}
        </div>
      )}

      <div className={className}>
        {tweets.map((tweet) => (
          <div
            key={tweet.tweet_id}
            className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 sm:p-5"
          >
            <TweetComponent
              tweet={tweet}
              collapseLongText={collapseLongTweets}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
