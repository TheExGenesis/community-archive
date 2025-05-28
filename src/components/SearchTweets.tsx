'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import Tweet from '@/components/Tweet'
import { createBrowserClient } from '@/utils/supabase'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'
import getLatestTweets from '@/lib/queries/getLatestTweets'
import {
  searchTweetsExact,
  searchTweetsAND,
  searchTweetsOR,
} from '@/lib/pgSearch'

interface SearchProps {
  supabase: SupabaseClient | null
  displayText?: string
  account_id?: string | null
}

export default function SearchTweets({
  supabase,
  displayText = 'Very minimal full text search over tweet text',
  account_id = null,
}: SearchProps) {
  const [tweetsExact, setTweetsExact] = useState<any[]>([])
  const [tweetsAND, setTweetsAND] = useState<any[]>([])
  const [tweetsOR, setTweetsOR] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [supabaseClient, setSupabaseClient] = useState(supabase)

  useEffect(() => {
    if (!supabaseClient) {
      const newSupabaseClient = createBrowserClient()
      setSupabaseClient(newSupabaseClient)
    }
  }, [supabaseClient])

  const fetchLatestTweets = useCallback(async () => {
    if (!supabaseClient) {
      console.warn('Supabase client is not initialized')
      return
    }
    const latestTweets = await getLatestTweets(
      supabaseClient,
      50,
      account_id || undefined,
    )
    setTweetsOR(latestTweets)
  }, [supabaseClient, account_id])

  useEffect(() => {
    fetchLatestTweets()
  }, [fetchLatestTweets])

  const handleSearch = async () => {
    if (!supabaseClient) {
      console.warn('Supabase client is not initialized')
      return
    }
    console.log('handleSearch', { supabaseClient })

    setIsLoading(true)
    setTweetsExact([])
    setTweetsAND([])
    setTweetsOR([])

    if (query.length === 0) {
      fetchLatestTweets()
      setIsLoading(false)
      return
    }

    searchTweetsExact(supabaseClient, query, account_id || undefined)
      .then(setTweetsExact)
      .catch(console.error)
      .finally(() => setIsLoading(false))

    searchTweetsAND(supabaseClient, query, account_id || undefined)
      .then(setTweetsAND)
      .catch(console.error)

    searchTweetsOR(supabaseClient, query, account_id || undefined)
      .then(setTweetsOR)
      .catch(console.error)
  }

  const handleKeyDown = (event: any) => {
    if (event.key === 'Enter') {
      handleSearch()
    }
  }

  const allTweets = useMemo(() => {
    return Array.from(
      new Map(
        [...tweetsExact, ...tweetsAND, ...tweetsOR].map((tweet) => [
          tweet.tweet_id,
          tweet,
        ]),
      ).values(),
    )
  }, [tweetsExact, tweetsAND, tweetsOR])

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-col gap-6">
        <p className="text-center text-sm">{displayText}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-grow rounded border p-2"
            placeholder="Enter search query"
          />
          <button
            onClick={handleSearch}
            className="rounded bg-blue-500 px-4 py-2 text-white"
            disabled={isLoading}
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
      <ScrollArea className="flex-grow">
        <div className="pr-4">
          {isLoading ? (
            <div>Loading tweets...</div>
          ) : allTweets.length > 0 ? (
            <div className="space-y-8">
              {allTweets.map((tweet) => (
                <Tweet
                  key={tweet.tweet_id}
                  tweetId={tweet.tweet_id}
                  username={tweet.username || 'Unknown'}
                  displayName={tweet.account_display_name || 'Unknown'}
                  profilePicUrl={
                    tweet.avatar_media_url ||
                    'https://pbs.twimg.com/profile_images/1821884121850970112/f04rgSFD_400x400.jpg'
                  }
                  text={tweet.full_text}
                  favoriteCount={tweet.favorite_count}
                  retweetCount={tweet.retweet_count}
                  date={tweet.created_at}
                  tweetUrl={`https://twitter.com/${
                    tweet['account']?.username || 'unknown'
                  }/status/${tweet.tweet_id}`}
                  replyToUsername={tweet.reply_to_username}
                />
              ))}
            </div>
          ) : (
            <div>No tweets found</div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
