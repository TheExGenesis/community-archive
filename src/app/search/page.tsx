'use client'

import { useState, useEffect } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import Tweet from '@/components/Tweet'
import dotenv from 'dotenv'
import path from 'path'
import { createBrowserClient } from '@/utils/supabase'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { getTableName } from '@/lib-client/getTableName'

// Load environment variables from .env file in the scratchpad directory
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') })
}

const searchTweets = async (supabase: any, query = '') => {
  const querySafe = query
    .replace(' ', '+')
    .replace(/'/g, "''")
    .replace(/"/g, "''")
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
    .textSearch('full_text', `'${querySafe}'`)
    .order('created_at', { ascending: false })
  // .limit(10)
  console.log('TWEETS')
  console.log(tweets)
  if (error) {
    console.error('Error fetching tweets:', error)
    throw error
  }

  return tweets
}

export default function Page() {
  const [tweets, setTweets] = useState([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSearch = async () => {
    setIsLoading(true)
    const supabase = createBrowserClient()
    const fetchedTweets = await searchTweets(supabase, query).catch(() => null)
    setTweets(fetchedTweets)
    setIsLoading(false)
  }

  return (
    <div className="flex w-full flex-1 flex-col items-center gap-20">
      <nav className="flex h-16 w-full justify-center border-b border-b-foreground/10">
        <div className="flex w-full max-w-4xl items-center justify-between p-3 text-sm"></div>
      </nav>

      <div className="flex max-w-4xl flex-1 flex-col gap-20 px-3">
        <main className="flex flex-1 flex-col gap-6">
          <h2 className="mb-4 text-4xl font-bold">Search Tweets</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
          {isLoading ? (
            <div>Loading tweets...</div>
          ) : tweets && tweets.length > 0 ? (
            tweets.map((tweet: any) => (
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
            ))
          ) : (
            <div>No tweets found</div>
          )}
        </main>
      </div>

      <footer className="w-full justify-center border-t border-t-foreground/10 p-8 text-center text-xs">
        <ThemeToggle />
      </footer>
    </div>
  )
}
