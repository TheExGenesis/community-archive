'use client'
import { useState, useMemo } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import Tweet from '@/components/Tweet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { searchTweets } from '@/lib/pgSearch'
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

    searchTweets(supabase, { ...baseParams, search_query: queryAND }, 50)
      .then(setTweetsAND)
      .catch(console.error)

    searchTweets(supabase, { ...baseParams, search_query: queryOR }, 50)
      .then(setTweetsOR)
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }

  const allTweets = useMemo(() => {
    // Combine results from different search strategies and remove duplicates
    const combinedTweets = Array.from(
      new Map(
        [...tweetsExact, ...tweetsAND, ...tweetsOR].map((tweet) => [
          tweet.tweet_id,
          tweet,
        ]),
      ).values(),
    )

    // Transform tweets to the nested structure expected by the consolidated Tweet component
    return combinedTweets.map((tweet: any) => ({
      ...tweet, // Keep all original tweet fields like full_text, favorite_count, etc.
      account: {
        username: tweet.username, // Assuming username is top-level from searchTweets RPC
        account_display_name: tweet.account_display_name, // Assuming account_display_name is top-level
        profile: {
          avatar_media_url: tweet.avatar_media_url // Assuming avatar_media_url is top-level
        }
      }
    }));
  }, [tweetsExact, tweetsAND, tweetsOR])

  const inputClasses = "w-full rounded border p-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-400 focus:ring-blue-500 focus:border-blue-500";
  const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-lg flex h-full flex-col">
      <form onSubmit={handleSubmit} className="mb-6 space-y-4">
        <div>
          <label htmlFor="main-search" className={labelClasses}>Search terms</label>
        <input
            id="main-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
            placeholder="Keywords (e.g., concert OR live from:myUser)"
            className={inputClasses}
        />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">You can use from:, to:, since: YYYY-MM-DD, until: YYYY-MM-DD.</p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          className="w-full justify-between dark:text-white dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Filter by User / Date Range
          {showAdvancedOptions ? (
            <ChevronUp className="ml-2 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-2 h-4 w-4" />
          )}
        </Button>

        {showAdvancedOptions && (
          <div className="space-y-4 border-t dark:border-slate-700 pt-4">
            <div>
              <label htmlFor="from-user" className={labelClasses}>From user</label>
            <input
                id="from-user"
              type="text"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
                placeholder="twitter_handle (without @)"
                className={inputClasses}
            />
            </div>
            <div>
              <label htmlFor="to-user" className={labelClasses}>To user (in reply to)</label>
            <input
                id="to-user"
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
                placeholder="twitter_handle (without @)"
                className={inputClasses}
            />
            </div>
            <div>
              <label
                htmlFor="since-date"
                className={labelClasses}
              >
                From date:
              </label>
              <input
                id="since-date"
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                className={`${inputClasses} mt-1`}
              />
            </div>
            <div>
              <label
                htmlFor="until-date"
                className={labelClasses}
              >
                To date:
              </label>
              <input
                id="until-date"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className={`${inputClasses} mt-1`}
              />
            </div>
          </div>
        )}

        <Button
          type="submit"
          className="w-full rounded bg-blue-600 p-3 text-lg text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors duration-300"
          disabled={isLoading}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </Button>
      </form>
      <ScrollArea className="flex-grow mt-4 border-t dark:border-slate-700 pt-4">
        <div className="pr-4">
          {isLoading && !hasSearched ? (
            <div className="text-center py-4 text-gray-600 dark:text-gray-300">Loading tweets...</div>
          ) : hasSearched ? (
            allTweets.length > 0 ? (
              <div className="space-y-8">
                <p className="text-sm text-gray-600 dark:text-gray-300">Found {allTweets.length} tweet(s).</p>
                {allTweets.map((tweet) => (
                  <Tweet
                    key={tweet.tweet_id}
                    tweet={tweet}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-600 dark:text-gray-300">No tweets found matching your criteria.</div>
            )
          ) : (
             <div className="text-center py-4 text-gray-500 dark:text-gray-400">Enter your search terms above and click Search.</div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
