import { TimelineTweet } from '@/lib/types'
import {
  hasSearchFilters,
  searchTweetsWithClickHouse,
} from '../clickhouseSearch'
import { enrichSearchTweets } from '../searchTweetEnrichments'

export interface FilterCriteria {
  rawSearchQuery?: string // Search text, sent to ClickHouse search
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

export interface TweetFetchOptions {
  signal?: AbortSignal
  /** Publish the canonical page before optional quote bodies finish loading. */
  onBaseTweets?: (tweets: TimelineTweet[]) => void
}

async function finalizeTweets(
  tweets: TimelineTweet[],
  criteria: FilterCriteria,
  options: TweetFetchOptions = {},
): Promise<TimelineTweet[]> {
  // The gateway already drops retweets when asked; this keeps the rule for
  // any row that slips through.
  const filteredTweets = criteria.excludeRetweets
    ? tweets.filter((tweet) => !isRetweetText(tweet.full_text))
    : tweets

  options.signal?.throwIfAborted()
  if (!criteria.includeQuoteTweets || filteredTweets.length === 0)
    return filteredTweets
  options.onBaseTweets?.(filteredTweets)
  return enrichSearchTweets(filteredTweets, options.signal)
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
 * Archive search for /search and trend stories, read from ClickHouse through
 * /api/tweet-search. Text searches and filter-only searches (author, reply
 * target or dates with no text) both go to the gateway; a failure is reported
 * rather than retried against PostgreSQL. Filter-only searches are newest
 * first only.
 */
export async function fetchTweets(
  criteria: FilterCriteria,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
  options: TweetFetchOptions = {},
): Promise<{ tweets: TimelineTweet[]; totalCount: number | null; error: any }> {
  options.signal?.throwIfAborted()
  const rawText = criteria.rawSearchQuery?.trim()
  if (!rawText && !hasSearchFilters(criteria)) {
    return { tweets: [], totalCount: 0, error: null }
  }

  try {
    if (!rawText && criteria.sort && criteria.sort !== 'newest') {
      throw new Error('Search ordering requires a text query.')
    }
    const tweets = await searchTweetsWithClickHouse(
      { ...criteria, rawSearchQuery: rawText },
      page,
      pageSize,
      undefined,
      options.signal,
    )
    const finalizedTweets = await finalizeTweets(tweets, criteria, options)
    return {
      tweets: finalizedTweets,
      totalCount: finalizedTweets.length === 0 ? 0 : null,
      error: null,
    }
  } catch (error: any) {
    if (options.signal?.aborted) throw error
    console.error('Error fetching search results:', error)
    return { tweets: [], totalCount: 0, error: searchError(error) }
  }
}
