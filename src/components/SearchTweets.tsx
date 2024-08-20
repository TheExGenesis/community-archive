'use client'
import { useState, useEffect } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import Tweet from '@/components/Tweet'
import dotenv from 'dotenv'
import path from 'path'
import { createBrowserClient } from '@/utils/supabase'
import { getTableName } from '@/lib-client/getTableName'
import { get } from 'http'

const getLatestTweets = async (supabase: any, count: number) => {
  const { data: tweets, error } = await supabase
    .from(getTableName('tweets'))
    .select(
      `
      *,
      ${getTableName('account')}!inner (
        ${getTableName('profile')} (
          avatar_media_url
        ),
        username,
        account_display_name
      )
    `,
    )
    .is('reply_to_tweet_id', null)
    .order('created_at', { ascending: false })
    .limit(count)

  if (error) {
    console.error('Error fetching tweets:', error)
    throw error
  }

  return tweets
}

const searchTweets = async (supabase: any, queryText = '') => {
  // process the postgres text search query text:
  // - split words by spaces, surrond them with single quotes and join them with ' | '
  // - escape single quotes with '' and double quotes with ""
  if (queryText.length === 0) {
    return getLatestTweets(supabase, 50)
  }
  const queryOR = queryText
    .replaceAll(/'/g, "''")
    .replaceAll(/"/g, "''")
    .split(' ')
    .map((word) => `'${word}'`)
    .join(' | ')

  const queryAND = queryOR.replaceAll(' | ', ' & ')

  const queryExact = queryText
    .replaceAll(/'/g, "''")
    .replaceAll(/"/g, "''")
    .replaceAll(' ', '+')

  const pgSearch = async (query: string) => {
    const { data: tweets, error } = await supabase
      .from(getTableName('tweets'))
      .select(
        `
      *,
      ${getTableName('account')}!inner (
        ${getTableName('profile')} (
          avatar_media_url
        ),
        username,
        account_display_name
      )
      
    `,
      )
      .textSearch('fts', `${query}`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching tweets:', error)
      throw error
    }
    return tweets
  }

  const tweetsExact = await pgSearch(queryExact)
  const tweetsOR = await pgSearch(queryOR)
  const tweetsAND = await pgSearch(queryAND)

  console.log('tweets', { tweetsExact, tweetsOR, tweetsAND })

  return Array.from(
    new Map(
      [...tweetsExact, ...tweetsOR, ...tweetsAND].map((tweet) => [
        tweet.id,
        tweet,
      ]),
    ).values(),
  )
}

export default function SearchTweets() {
  const [tweets, setTweets] = useState<any[]>()
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchLatestTweets = async () => {
      const supabase = createBrowserClient()
      const latestTweets = await getLatestTweets(supabase, 50)
      setTweets(latestTweets)
    }

    fetchLatestTweets()
  }, [])

  const handleSearch = async () => {
    setIsLoading(true)
    const supabase = createBrowserClient()
    const fetchedTweets: any[] = await searchTweets(supabase, query).catch(
      () => [],
    )
    setTweets(fetchedTweets)
    setIsLoading(false)
  }
  const handleKeyDown = (event: any) => {
    if (event.key === 'Enter') {
      handleSearch()
    }
  }
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-col gap-6">
        <p className="text-center text-sm">
          Very minimal full text search over tweet text.
        </p>
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

      <div className="flex-grow overflow-y-auto">
        {isLoading ? (
          <div>Loading tweets...</div>
        ) : tweets && tweets.length > 0 ? (
          <div className="space-y-4">
            {tweets.map((tweet) => (
              <Tweet
                key={tweet.id}
                username={tweet[getTableName('account')]?.username || 'Unknown'}
                displayName={
                  tweet[getTableName('account')]?.account_display_name ||
                  'Unknown'
                }
                profilePicUrl={
                  tweet[getTableName('account')]?.[getTableName('profile')]
                    ?.avatar_media_url ||
                  'https://pbs.twimg.com/profile_images/1821884121850970112/f04rgSFD_400x400.jpg'
                }
                text={tweet.full_text}
                favoriteCount={tweet.favorite_count}
                retweetCount={tweet.retweet_count}
                date={tweet.created_at}
                tweetUrl={`https://twitter.com/${
                  tweet[getTableName('account')]?.username || 'unknown'
                }/status/${tweet.tweet_id}`}
                replyToUsername={tweet.reply_to_username}
              />
            ))}
          </div>
        ) : (
          <div>No tweets found</div>
        )}
      </div>
    </div>
  )
}
