'use client'
import { useState, useMemo } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import Tweet from '@/components/Tweet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { searchTweets } from '@/lib-client/pgSearch'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'

export default function AdvancedSearchForm() {
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [tweetsExact, setTweetsExact] = useState<any[]>([])
  const [tweetsAND, setTweetsAND] = useState<any[]>([])
  const [tweetsOR, setTweetsOR] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setHasSearched(true)
    const supabase = createBrowserClient()

    const parseQuery = (q: string) => {
      const parts = q.split(' ')
      const options: { [key: string]: string } = {}
      const words: string[] = []

      parts.forEach((part) => {
        const [key, value] = part.split(':')
        if (value) {
          options[key] = value
        } else {
          words.push(part)
        }
      })

      return { options, words }
    }

    const { options, words } = parseQuery(query)

    const baseParams = {
      from_user: from || options.from || null,
      to_user: to || options.to || null,
      since_date: since || options.since || null,
      until_date: until || options.until || null,
    }

    const search_query = words.join(' ').trim()

    const queryExact = search_query ? words.join('+') : ''
    const queryAND = search_query
      ? words.map((word) => `'${word.replaceAll(/'/g, "''")}'`).join(' & ')
      : ''
    const queryOR = search_query
      ? words.map((word) => `'${word.replaceAll(/'/g, "''")}'`).join(' | ')
      : ''

    searchTweets(supabase, { ...baseParams, search_query: queryExact }, 50)
      .then(setTweetsExact)
      .catch(console.error)
      .finally(() => setIsLoading(false))

    searchTweets(supabase, { ...baseParams, search_query: queryAND }, 50)
      .then(setTweetsAND)
      .catch(console.error)
      .finally(() => setIsLoading(false))

    searchTweets(supabase, { ...baseParams, search_query: queryOR }, 50)
      .then(setTweetsOR)
      .catch(console.error)
      .finally(() => setIsLoading(false))
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
      <form onSubmit={handleSubmit} className="mb-4 space-y-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tweets (use from:, to:, since:, until: for advanced search)"
          className="w-full rounded border p-2"
        />

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          className="w-full justify-between"
        >
          Advanced Options
          {showAdvancedOptions ? (
            <ChevronUp className="ml-2 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-2 h-4 w-4" />
          )}
        </Button>

        {showAdvancedOptions && (
          <div className="space-y-4 border-t pt-4">
            <input
              type="text"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="From user"
              className="w-full rounded border p-2"
            />
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="To user"
              className="w-full rounded border p-2"
            />
            <div>
              <label
                htmlFor="since-date"
                className="block text-sm font-medium text-gray-700"
              >
                From date:
              </label>
              <input
                id="since-date"
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                className="mt-1 w-full rounded border p-2"
              />
            </div>
            <div>
              <label
                htmlFor="until-date"
                className="block text-sm font-medium text-gray-700"
              >
                To date:
              </label>
              <input
                id="until-date"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="mt-1 w-full rounded border p-2"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded bg-blue-500 p-2 text-white"
        >
          Search
        </button>
      </form>
      <ScrollArea className="flex-grow">
        <div className="pr-4">
          {isLoading ? (
            <div>Loading tweets...</div>
          ) : hasSearched ? (
            allTweets.length > 0 ? (
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
                      tweet.username || 'unknown'
                    }/status/${tweet.tweet_id}`}
                  />
                ))}
              </div>
            ) : (
              <div>No tweets found</div>
            )
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
