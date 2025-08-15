'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import UnifiedTweetList from '@/components/UnifiedTweetList'
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
          <UnifiedTweetList 
            tweets={allTweets}
            isLoading={isLoading}
            emptyMessage="No tweets found"
            className="space-y-8"
            showCsvExport={true}
            csvFilename="search_results.csv"
          />
        </div>
      </ScrollArea>
    </div>
  )
}
