import type { TimelineTweet } from '@/lib/types'

/** Response of /api/tweet-search/quotes, keyed by the quoting result's id. */
export type SearchQuotedTweets = Record<
  string,
  {
    quote_tweet_id: string
    quoted_tweet: NonNullable<TimelineTweet['quoted_tweet']>
  }
>

/**
 * Batch-load quoted tweet bodies for one page of search results through the
 * ClickHouse tweet cards. Original tweet media already comes with the search
 * results. Quote cards are optional decoration: if they cannot be loaded the
 * page is shown without them.
 */
export async function enrichSearchTweets(
  tweets: TimelineTweet[],
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<TimelineTweet[]> {
  if (tweets.length === 0) return tweets
  signal?.throwIfAborted()

  let quotes: SearchQuotedTweets
  try {
    const ids = tweets.map((tweet) => tweet.tweet_id).join(',')
    const response = await fetchImpl(
      `/api/tweet-search/quotes?ids=${encodeURIComponent(ids)}`,
      { cache: 'no-store', ...(signal ? { signal } : {}) },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = (await response.json()) as {
      data?: { quotes?: SearchQuotedTweets }
    }
    quotes = body.data?.quotes ?? {}
  } catch (error) {
    signal?.throwIfAborted()
    console.warn('Could not load quoted tweets for search:', error)
    return tweets
  }
  signal?.throwIfAborted()

  return tweets.map((tweet) => {
    const quote = quotes[tweet.tweet_id]
    return quote ? { ...tweet, ...quote } : tweet
  })
}
