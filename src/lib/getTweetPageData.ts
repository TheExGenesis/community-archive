import type { ConversationTree } from './threadUtils'
import type { TweetData } from '@/lib/tweets/types'
import { AnalyticsGatewayError } from './clickhouseGateway'
import { fetchClickHouseTweetThreadPageData } from './clickhouseTweetPage'
import {
  fetchClickHouseQuotePosts,
  type ClickHouseQuotePostsData,
} from './clickhouseQuotePosts'

interface TweetPageResult {
  tweet: TweetData | null
  threadTree: ConversationTree | null
  quotingTweets: TweetData[]
  quotingTweetCount: number
  quotePosts?: Promise<ClickHouseQuotePostsData>
}

const EMPTY_QUOTES: ClickHouseQuotePostsData = { tweets: [], totalCount: 0 }

/**
 * Load a permalink record, its thread and incoming quotes from ClickHouse.
 * ClickHouse is the only source: a tweet it does not hold is a miss (the page
 * 404s), and a failed thread read throws so the route returns a non-cacheable
 * error instead of an empty page. The Supabase corpus RPC fallback was retired
 * with anonymous corpus access on 2026-11-19.
 *
 * With deferQuotePosts, callers await optional quotes in a separate streaming
 * boundary; a quote failure then resolves to an empty list.
 */
export async function getTweetPageData(
  tweetId: string,
  options: {
    deferQuotePosts?: boolean
    skipQuotePosts?: boolean
  } = {},
): Promise<TweetPageResult> {
  const { deferQuotePosts = false, skipQuotePosts = false } = options
  // Start both reads together, but keep optional quotes off the permalink's
  // critical path. Handle rejection immediately even if the thread is missing.
  const quotePosts = skipQuotePosts
    ? Promise.resolve(EMPTY_QUOTES)
    : fetchClickHouseQuotePosts(tweetId).catch((error) => {
        console.error('ClickHouse quote posts failed:', {
          tweetId,
          error: error instanceof Error ? error.message : String(error),
        })
        return EMPTY_QUOTES
      })
  const [page, initialQuotes] = await Promise.all([
    fetchClickHouseTweetThreadPageData(tweetId).catch((error) => {
      // The gateway answers 404 for a tweet it does not hold: that is a miss.
      if (error instanceof AnalyticsGatewayError && error.status === 404)
        return null
      throw error
    }),
    deferQuotePosts ? null : quotePosts,
  ])
  if (!page)
    return {
      tweet: null,
      threadTree: null,
      quotingTweets: [],
      quotingTweetCount: 0,
    }
  return {
    ...page,
    quotingTweets: initialQuotes?.tweets ?? [],
    quotingTweetCount: initialQuotes?.totalCount ?? 0,
    ...(deferQuotePosts ? { quotePosts } : {}),
  }
}
