'use client';

import { useState, useEffect, useCallback } from 'react';
import Tweet from '@/components/Tweet';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/utils/supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { TimelineTweet } from '@/lib/types';
import { FilterCriteria, fetchTweets } from '@/lib/queries/tweetQueries';

interface TweetListProps {
  filterCriteria: FilterCriteria;
  itemsPerPage?: number;
  showCsvExportButton?: boolean;
  csvExportFilename?: string;
}

const DEFAULT_ITEMS_PER_PAGE = 20;

export default function TweetList({ 
  filterCriteria,
  itemsPerPage = DEFAULT_ITEMS_PER_PAGE,
  showCsvExportButton = true,
  csvExportFilename = 'tweets_export.csv' 
}: TweetListProps) {
  const [tweets, setTweets] = useState<TimelineTweet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [lastFetchCount, setLastFetchCount] = useState<number>(0);

  useEffect(() => {
    setSupabase(createBrowserClient());
  }, []);

  const loadTweets = useCallback(async (pageToLoad: number, criteria: FilterCriteria) => {
    if (!supabase) return;

    if (pageToLoad === 1) {
      setIsLoading(true);
      setTweets([]); 
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const { tweets: fetchedTweets, error: fetchError, totalCount: fetchedTotalCount } = 
        await fetchTweets(supabase, criteria, pageToLoad, itemsPerPage);
      
      if (fetchError) {
        throw fetchError;
      }

      setTweets(prevTweets => pageToLoad === 1 ? fetchedTweets : [...prevTweets, ...fetchedTweets]);
      setLastFetchCount(fetchedTweets.length);
      if (fetchedTotalCount !== null) {
        setTotalCount(fetchedTotalCount);
      }
      setCurrentPage(pageToLoad);
    } catch (e: any) {
      console.error("Failed to load tweets for list:", e);
      setError(e.message || 'Failed to load tweets.');
    } finally {
      if (pageToLoad === 1) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, [supabase, itemsPerPage]);

  useEffect(() => {
    if (supabase) {
      setCurrentPage(1); 
      setTotalCount(null);
      setLastFetchCount(0);
      loadTweets(1, filterCriteria);
    }
  }, [supabase, filterCriteria, loadTweets]);

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMoreTweets) {
      loadTweets(currentPage + 1, filterCriteria);
    }
  };

  const handleExportCsv = () => {
    if (tweets.length === 0) {
      alert("No tweets to export.");
      return;
    }
    const headers = ['tweet_id', 'created_at', 'full_text', 'favorite_count', 'retweet_count', 'username', 'account_display_name', 'reply_to_tweet_id'];
    const csvRows = [
      headers.join(','),
      ...tweets.map(tweet => [
        `"${tweet.tweet_id}"`, 
        `"${tweet.created_at}"`, 
        `"${tweet.full_text.replace(/"/g, '""').replace(/\n/g, '\\n')}"`, 
        tweet.favorite_count,
        tweet.retweet_count,
        `"${tweet.account.username}"`, 
        `"${tweet.account.account_display_name}"`, 
        `"${tweet.reply_to_tweet_id || ''}"`
      ].join(','))
    ];
    const csvString = csvRows.join('\r\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', csvExportFilename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const hasMoreTweets = totalCount !== null 
    ? (currentPage * itemsPerPage) < totalCount 
    : lastFetchCount === itemsPerPage;

  if (isLoading) {
    return <p className="text-xl text-gray-700 dark:text-gray-300 text-center py-10">Loading tweets...</p>;
  }

  if (error && tweets.length === 0) {
    return <p className="text-xl text-red-500 text-center py-10">Error: {error}</p>;
  }

  return (
    <div className="space-y-8">
      {showCsvExportButton && tweets.length > 0 && (
        <div className="flex justify-end mb-4">
          <Button onClick={handleExportCsv} variant="outline">Download CSV</Button>
        </div>
      )}
      {tweets.length === 0 && !isLoading && !error && (
        <p className="text-lg text-gray-600 dark:text-gray-400 text-center py-10">No tweets to display for the current filters.</p>
      )}
      <div className="space-y-4">
        {tweets.map(tweet => (
          <div key={tweet.tweet_id} className="bg-background dark:bg-secondary p-4 rounded-lg">
            <Tweet tweet={tweet} />
          </div>
        ))}
      </div>
      {error && tweets.length > 0 && (
        <p className="text-red-500 text-center mt-6">Error loading more tweets: {error}</p>
      )}
      {hasMoreTweets && (
        <div className="text-center mt-8">
          <Button onClick={handleLoadMore} disabled={isLoadingMore} variant="outline">
            {isLoadingMore ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
} 