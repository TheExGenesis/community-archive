import { SupabaseClient } from '@supabase/supabase-js'
import { TimelineTweet } from '@/lib/types'
import { searchTweets as rpcSearchTweets } from '../pgSearch'
import { type SearchParams } from '../types'
import { searchTweetsWithClickHouse } from '../clickhouseSearch'
import { enrichSearchTweets } from '../searchTweetEnrichments'

export interface FilterCriteria {
  searchQuery?: string // For text search in tweets (tsquery-formatted)
  rawSearchQuery?: string // Original unformatted search text, sent to ClickHouse search
  matchAllWords?: boolean // ClickHouse text search: every word in any order, not the phrase
  fromUsername?: string // For tweets from a specific username
  replyToUsername?: string // For tweets in reply to a specific username
  startDate?: string // For tweets created after this date
  endDate?: string // For tweets created before this date
  excludeRetweets?: boolean // Exclude native archive retweets that start with "RT @"
  includeQuoteTweets?: boolean // Batch-load quoted tweet bodies for rich rendering
  sort?: TweetSearchSort // Server-side order for ClickHouse text search
}

export type TweetSearchSort = 'newest' | 'oldest' | 'likes' | 'reposts'

const DEFAULT_PAGE_SIZE = 50

export function isRetweetText(text: string): boolean {
  return /^RT @[A-Za-z0-9_]+/.test(text)
}

// Map flat search_tweets RPC rows (filter-only searches) to timeline tweets.
function transformRpcTweetsToTimelineTweets(rawData: any[]): TimelineTweet[] {
  return rawData.map((rawTweet) => {
    let timelineAccount: TimelineTweet['account'] = {
      username: 'unknown_user',
      account_display_name: 'Unknown User',
      profile: undefined,
    }
    if (rawTweet.username) {
      timelineAccount = {
        username: rawTweet.username,
        account_display_name:
          rawTweet.account_display_name || rawTweet.username,
        profile: rawTweet.avatar_media_url
          ? { avatar_media_url: rawTweet.avatar_media_url }
          : undefined,
      }
    } else {
      console.error(
        `RPC Tweet ${rawTweet.tweet_id} is missing account username. Using fallback.`,
      )
    }

    return {
      tweet_id: rawTweet.tweet_id,
      account_id: rawTweet.account_id,
      created_at: rawTweet.created_at,
      full_text: rawTweet.full_text,
      favorite_count: rawTweet.favorite_count,
      retweet_count: rawTweet.retweet_count,
      reply_to_tweet_id: rawTweet.reply_to_tweet_id,
      account: timelineAccount,
      media: rawTweet.media || [],
    } as TimelineTweet
  })
}

export interface TweetFetchOptions {
  signal?: AbortSignal
  /** Publish the canonical page before optional quote bodies finish loading. */
  onBaseTweets?: (tweets: TimelineTweet[]) => void
}

async function finalizeTweets(
  supabase: SupabaseClient,
  tweets: TimelineTweet[],
  criteria: FilterCriteria,
  options: TweetFetchOptions = {},
): Promise<TimelineTweet[]> {
  const filteredTweets = criteria.excludeRetweets
    ? tweets.filter((tweet) => !isRetweetText(tweet.full_text))
    : tweets

  options.signal?.throwIfAborted()
  if (!criteria.includeQuoteTweets || filteredTweets.length === 0)
    return filteredTweets
  options.onBaseTweets?.(filteredTweets)
  return enrichSearchTweets(supabase, filteredTweets, options.signal)
}

async function searchClickHousePage(
  criteria: FilterCriteria,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<TimelineTweet[]> {
  return signal
    ? searchTweetsWithClickHouse(criteria, page, pageSize, undefined, signal)
    : searchTweetsWithClickHouse(criteria, page, pageSize)
}

/**
 * Build AND tsquery string from raw search text.
 */
export function buildAndTsQuery(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean)
  return words.join(' & ')
}

function searchError(error: any) {
  if (error?.message && error.message.includes('statement timeout')) {
    return {
      message: 'Search query timed out. Please try a more specific search.',
      details: error,
    }
  }
  return error
}

/**
 * Archive search for /search and trend stories.
 *
 * Text searches always read ClickHouse through /api/tweet-search; a failure
 * is reported rather than retried against PostgreSQL. Filter-only searches
 * (author, reply target or dates with no text) still use the signed-in
 * search_tweets RPC until the gateway serves filter-only search.
 */
export async function fetchTweets(
  supabase: SupabaseClient,
  criteria: FilterCriteria,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
  options: TweetFetchOptions = {},
): Promise<{ tweets: TimelineTweet[]; totalCount: number | null; error: any }> {
  options.signal?.throwIfAborted()
  const rawText = criteria.rawSearchQuery?.trim()
  const hasFilters = Boolean(
    criteria.fromUsername ||
      criteria.replyToUsername ||
      criteria.startDate ||
      criteria.endDate,
  )
  if (!rawText && !criteria.searchQuery && !hasFilters) {
    return { tweets: [], totalCount: 0, error: null }
  }

  try {
    if (rawText) {
      // Do not start a second corpus scan against PostgreSQL when the
      // analytical service fails or the reader has cancelled this search.
      const clickHouseTweets = await searchClickHousePage(
        criteria,
        page,
        pageSize,
        options.signal,
      )
      const finalizedTweets = await finalizeTweets(
        supabase,
        clickHouseTweets,
        criteria,
        options,
      )
      return {
        tweets: finalizedTweets,
        totalCount: finalizedTweets.length === 0 ? 0 : null,
        error: null,
      }
    }

    if (criteria.sort && criteria.sort !== 'newest') {
      throw new Error('Search ordering requires a text query.')
    }

    const searchParams: SearchParams = {
      search_query: criteria.searchQuery || '',
      from_user: criteria.fromUsername || null,
      to_user: criteria.replyToUsername || null,
      since_date: criteria.startDate || null,
      until_date: criteria.endDate || null,
    }
    const rpcData = await rpcSearchTweets(
      supabase,
      searchParams,
      pageSize,
      (page - 1) * pageSize,
      options.signal,
    )
    if (!rpcData || rpcData.length === 0) {
      return { tweets: [], totalCount: 0, error: null }
    }
    return {
      tweets: await finalizeTweets(
        supabase,
        transformRpcTweetsToTimelineTweets(rpcData),
        criteria,
        options,
      ),
      totalCount: null,
      error: null,
    }
  } catch (error: any) {
    if (options.signal?.aborted) throw error
    console.error('Error fetching search results:', error)
    return { tweets: [], totalCount: 0, error: searchError(error) }
  }
}
