'use client'

import React from 'react'
import TweetComponent from './TweetComponent'
import { Button } from '@/components/ui/button'

interface UnifiedTweetListProps {
  tweets: any[]
  isLoading?: boolean
  emptyMessage?: string
  className?: string
  showCsvExport?: boolean
  csvFilename?: string
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
  csvFilename = 'tweets_export.csv'
}: UnifiedTweetListProps) {
  const handleExportCsv = () => {
    if (tweets.length === 0) {
      alert("No tweets to export.");
      return;
    }

    const headers = ['tweet_id', 'created_at', 'full_text', 'favorite_count', 'retweet_count', 'username', 'account_display_name', 'reply_to_tweet_id'];
    const csvRows = [
      headers.join(','),
      ...tweets.map(tweet => {
        // Extract username and display name from either flattened or nested format
        const username = tweet.username || tweet.account?.username || '';
        const displayName = tweet.account_display_name || tweet.account?.account_display_name || '';
        
        return [
          `"${tweet.tweet_id}"`, 
          `"${tweet.created_at}"`, 
          `"${tweet.full_text?.replace(/"/g, '""')?.replace(/\n/g, '\\n') || ''}"`, 
          tweet.favorite_count || 0,
          tweet.retweet_count || 0,
          `"${username}"`, 
          `"${displayName}"`, 
          `"${tweet.reply_to_tweet_id || ''}"`
        ].join(',')
      })
    ];
    const csvString = csvRows.join('\r\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', csvFilename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="text-xl text-gray-700 dark:text-gray-300">Loading tweets...</div>
      </div>
    )
  }

  if (!tweets.length) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="text-lg text-gray-600 dark:text-gray-400">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showCsvExport && tweets.length > 0 && (
        <div className="flex justify-end mb-4">
          <Button onClick={handleExportCsv} variant="outline">Download CSV</Button>
        </div>
      )}
      
      <div className={className}>
        {tweets.map((tweet) => (
          <div 
            key={tweet.tweet_id} 
            className="bg-background dark:bg-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <TweetComponent tweet={tweet} />
          </div>
        ))}
      </div>
    </div>
  )
}