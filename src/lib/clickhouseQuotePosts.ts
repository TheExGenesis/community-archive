import type { TweetData } from '@/components/TweetComponent'
import { fetchAnalyticsGatewayJson } from './clickhouseGateway'

interface ClickHouseQuotePost {
  tweetId: string
  accountId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  createdAt: string
  fullText: string
  favoriteCount: string | number
  retweetCount: string | number
  media?: Array<{
    mediaUrl: string
    mediaType: string
    width: number | null
    height: number | null
  }>
}

interface ClickHouseQuotePostsResponse {
  data: ClickHouseQuotePost[]
  query: {
    total: string | number
  }
}

export interface ClickHouseQuotePostsData {
  tweets: TweetData[]
  totalCount: number
}

const EMPTY_QUOTE_POSTS: ClickHouseQuotePostsData = {
  tweets: [],
  totalCount: 0,
}

function count(value: string | number | null | undefined): number {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function timestamp(value: string): string {
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(value)) return value
  return `${value.replace(' ', 'T')}Z`
}

function quotePost(
  tweet: ClickHouseQuotePost,
  targetTweetId: string,
): TweetData {
  if (
    !/^\d{1,20}$/.test(tweet.tweetId) ||
    !/^\d{1,20}$/.test(tweet.accountId) ||
    typeof tweet.createdAt !== 'string' ||
    typeof tweet.fullText !== 'string'
  ) {
    throw new Error('ClickHouse quote-posts returned an invalid tweet')
  }

  const username = tweet.username || 'unknown_user'
  const displayName = tweet.displayName || username
  return {
    tweet_id: tweet.tweetId,
    account_id: tweet.accountId,
    created_at: timestamp(tweet.createdAt),
    full_text: tweet.fullText,
    retweet_count: count(tweet.retweetCount),
    favorite_count: count(tweet.favoriteCount),
    reply_to_tweet_id: null,
    quote_tweet_id: targetTweetId,
    retweeted_tweet_id: null,
    avatar_media_url: tweet.avatarUrl,
    username,
    account_display_name: displayName,
    media: (tweet.media ?? []).map((item) => ({
      media_url: item.mediaUrl,
      media_type: item.mediaType,
      width: item.width ?? undefined,
      height: item.height ?? undefined,
    })),
    urls: [],
    account: {
      username,
      account_display_name: displayName,
      profile: tweet.avatarUrl
        ? { avatar_media_url: tweet.avatarUrl }
        : undefined,
    },
  }
}

export async function fetchClickHouseQuotePosts(
  tweetId: string,
  limit = 12,
  offset = 0,
  fetcher = fetchAnalyticsGatewayJson,
): Promise<ClickHouseQuotePostsData> {
  if (!/^\d{1,20}$/.test(tweetId)) return EMPTY_QUOTE_POSTS

  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const safeOffset = Math.max(0, Math.min(5_000, Math.trunc(offset)))
  const response = await fetcher<ClickHouseQuotePostsResponse>(
    ['quote-posts', tweetId],
    new URLSearchParams({
      limit: String(safeLimit),
      offset: String(safeOffset),
      exclude_self: 'true',
      quote_ca_users_only: 'true',
    }),
    { revalidate: 600 },
  )
  if (!Array.isArray(response.data)) {
    throw new Error('ClickHouse quote-posts returned an invalid response')
  }

  const tweets = response.data.map((tweet) => quotePost(tweet, tweetId))
  return {
    tweets,
    totalCount: Math.max(count(response.query?.total), tweets.length),
  }
}
