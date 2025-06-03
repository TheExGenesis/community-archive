'use client'

import { useState, useEffect, useCallback } from 'react'
import Tweet from '@/components/Tweet'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/utils/supabase'
import { SupabaseClient } from '@supabase/supabase-js'

// Raw structure from Supabase with aliased joins (often results in arrays)
interface RawSupabaseProfile {
  avatar_media_url: string | null;
}

interface RawSupabaseAccount {
  username: string;
  account_display_name: string;
  profile: RawSupabaseProfile | null;
}

interface RawSupabaseTweet {
  tweet_id: string;
  created_at: string;
  full_text: string;
  favorite_count: number;
  retweet_count: number;
  reply_to_tweet_id: string | null; // Keep this for filtering check
  account: RawSupabaseAccount; 
  media?: Array<{
    media_url: string;
    media_type: string;
    width?: number;
    height?: number;
  }>;
}

// Desired structure for the Tweet component (aligns with TweetData)
interface TimelineTweet {
  tweet_id: string;
  created_at: string;
  full_text: string;
  favorite_count: number;
  retweet_count: number;
  reply_to_tweet_id: string | null;
  account: { 
    username: string;
    account_display_name: string;
    profile?: { 
      avatar_media_url?: string;
    };
  };
  media?: Array<{
    media_url: string;
    media_type: string;
    width?: number;
    height?: number;
  }>;
}

const PAGE_SIZE = 50;

async function fetchTimelineTweets(
  supabase: SupabaseClient,
  page: number
): Promise<{ tweets: TimelineTweet[]; error: any; totalCount: number | null }> {
  const { data: rawData, error, count } = await supabase
    .from('tweets')
    .select(
      `
      tweet_id,
      created_at,
      full_text,
      favorite_count,
      retweet_count,
      reply_to_tweet_id,
      account:all_account!inner (
        username,
        account_display_name,
        profile:profile!left (
          avatar_media_url
        )
      ),
      media:tweet_media (
        media_url,
        media_type,
        width,
        height
      )
    `,
      { count: 'exact' }
    )
    .is('reply_to_tweet_id', null) // Filter for root tweets
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (error) {
    return { tweets: [], error, totalCount: count };
  }
  if (!rawData) {
    return { tweets: [], error: null, totalCount: count };
  }

  const transformedTweets = (rawData as unknown as RawSupabaseTweet[]).map(rawTweet => {
    const currentAccount = rawTweet.account;
    let accountData: TimelineTweet['account'];

    if (currentAccount) { // This should ideally always be true due to the !inner join
      const currentProfile = currentAccount.profile; // This can be null due to the !left join

      accountData = {
        username: currentAccount.username,
        account_display_name: currentAccount.account_display_name,
        profile: currentProfile
          ? { avatar_media_url: currentProfile.avatar_media_url === null ? undefined : currentProfile.avatar_media_url }
          : undefined,
      };
    } else {
      // This block indicates an issue if rawTweet.account is unexpectedly null/undefined
      // despite the !inner join in the Supabase query.
      console.error(`Tweet ${rawTweet.tweet_id} seems to be missing account data from Supabase query. Using fallback.`);
      accountData = {
        username: "unknown_user",
        account_display_name: "Unknown User",
        profile: undefined
      };
    }
    
    return {
      tweet_id: rawTweet.tweet_id,
      created_at: rawTweet.created_at,
      full_text: rawTweet.full_text,
      favorite_count: rawTweet.favorite_count,
      retweet_count: rawTweet.retweet_count,
      reply_to_tweet_id: rawTweet.reply_to_tweet_id,
      account: accountData, // accountData is now always an object
      media: rawTweet.media,
    } as TimelineTweet;
  });

  return { tweets: transformedTweets, error: null, totalCount: count };
}

export default function TimelinePage() {
  const [tweets, setTweets] = useState<TimelineTweet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  useEffect(() => {
    setSupabase(createBrowserClient());
  }, []);

  const loadTweets = useCallback(async (pageToLoad: number) => {
    if (!supabase) return;

    if (pageToLoad === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const { tweets: fetchedTweets, error: fetchError, totalCount: fetchedTotalCount } = 
        await fetchTimelineTweets(supabase, pageToLoad);
      
      if (fetchError) {
        throw fetchError;
      }

      setTweets(prevTweets => pageToLoad === 1 ? fetchedTweets : [...prevTweets, ...fetchedTweets]);
      if (fetchedTotalCount !== null) {
        setTotalCount(fetchedTotalCount);
      }
      setCurrentPage(pageToLoad);
    } catch (e: any) {
      console.error("Failed to load timeline tweets:", e);
      setError(e.message || 'Failed to load tweets.');
    } finally {
      if (pageToLoad === 1) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, [supabase]);

  useEffect(() => {
    if (supabase) {
      loadTweets(1); // Load initial page
    }
  }, [supabase, loadTweets]);

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMoreTweets) {
      loadTweets(currentPage + 1);
    }
  };

  const hasMoreTweets = totalCount !== null ? (currentPage * PAGE_SIZE) < totalCount : false;

  // Basic styling, can be enhanced
  const unifiedDeepBlueBase = "bg-slate-200 dark:bg-slate-900";
  const sectionPaddingClasses = "py-12 md:py-16";
  const contentWrapperClasses = "w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8";

  if (isLoading) {
    return (
      <main className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} min-h-screen flex flex-col items-center`}>
        <div className={contentWrapperClasses}>
          <h1 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">Timeline</h1>
          <p className="text-xl text-gray-700 dark:text-gray-300 text-center">Loading tweets...</p>
        </div>
      </main>
    );
  }

  if (error && tweets.length === 0) { // Only show full page error if no tweets are loaded yet
    return (
      <main className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} min-h-screen flex flex-col items-center`}>
        <div className={contentWrapperClasses}>
          <h1 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">Timeline</h1>
          <p className="text-xl text-red-500 text-center">Error: {error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} min-h-screen flex flex-col items-center`}>
      <div className={contentWrapperClasses}>
        <h1 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">Timeline</h1>
        
        {tweets.length === 0 && !isLoading && !error && (
          <p className="text-lg text-gray-600 dark:text-gray-400 text-center">No tweets to display.</p>
        )}

        <div className="space-y-8">
          {tweets.map(tweet => (
            <div key={tweet.tweet_id} className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-lg">
              <Tweet tweet={tweet} />
            </div>
          ))}
        </div>

        {error && tweets.length > 0 && ( // Show error below tweets if some were loaded
          <p className="text-red-500 text-center mt-6">Error loading more tweets: {error}</p>
        )}

        {hasMoreTweets && (
          <div className="text-center mt-12">
            <Button onClick={handleLoadMore} disabled={isLoadingMore}>
              {isLoadingMore ? 'Loading...' : 'Load More Tweets'}
            </Button>
          </div>
        )}
        {!hasMoreTweets && tweets.length > 0 && (
           <p className="text-center text-gray-500 dark:text-gray-400 mt-12">You've reached the end of the timeline.</p>
        )}
      </div>
    </main>
  );
} 