import { TimelineTweet } from './types'
import type { FilterCriteria } from './queries/tweetQueries'

interface ClickHouseSearchTweet {
  tweetId: string
  accountId: string
  createdAt: string
  fullText: string
  replyToTweetId: string | null
  favoriteCount: string | number
  retweetCount: string | number | null
  username: string | null
  accountDisplayName: string | null
  avatarMediaUrl: string | null
  media: Array<{
    mediaUrl: string
    mediaType: string
    width: number | null
    height: number | null
  }>
}

interface ClickHouseSearchResponse {
  data: {
    tweets: ClickHouseSearchTweet[]
    nextOffset: number | null
    definitiveEmpty?: boolean
  }
}

interface MappedClickHouseSearchResponse {
  tweets: TimelineTweet[]
  definitiveEmpty: boolean
}

interface ClickHouseSearchRequestOptions {
  preview?: boolean
  excludeRetweets?: boolean
}

function mapSearchTweets(result: ClickHouseSearchResponse): TimelineTweet[] {
  return result.data.tweets.map((tweet) => ({
    tweet_id: tweet.tweetId,
    account_id: tweet.accountId,
    created_at: tweet.createdAt,
    full_text: tweet.fullText,
    favorite_count: Number(tweet.favoriteCount || 0),
    retweet_count:
      tweet.retweetCount === null ? null : Number(tweet.retweetCount || 0),
    reply_to_tweet_id: tweet.replyToTweetId,
    account: {
      username: tweet.username || 'unknown_user',
      account_display_name:
        tweet.accountDisplayName || tweet.username || 'Unknown User',
      profile: tweet.avatarMediaUrl
        ? { avatar_media_url: tweet.avatarMediaUrl }
        : undefined,
    },
    media: (tweet.media || []).map((item) => ({
      media_url: item.mediaUrl,
      media_type: item.mediaType,
      width: item.width ?? undefined,
      height: item.height ?? undefined,
    })),
  }))
}

async function requestClickHouseSearch(
  criteria: FilterCriteria,
  page: number,
  pageSize: number,
  fetchImpl: typeof fetch,
  options: ClickHouseSearchRequestOptions = {},
): Promise<MappedClickHouseSearchResponse> {
  const query = criteria.rawSearchQuery?.trim()
  if (!query) {
    throw new Error('ClickHouse text search requires the raw search query')
  }

  const offset = (page - 1) * pageSize
  if (offset > 5_000) return { tweets: [], definitiveEmpty: false }

  const params = new URLSearchParams({
    q: query,
    mode: query.split(/\s+/).length > 1 ? 'phrase' : 'all',
    limit: String(pageSize),
    offset: String(offset),
  })
  if (criteria.fromUsername) params.set('from_user', criteria.fromUsername)
  if (criteria.replyToUsername)
    params.set('reply_to_user', criteria.replyToUsername)
  if (criteria.startDate) params.set('since', criteria.startDate)
  if (criteria.endDate) params.set('until', criteria.endDate)
  if (criteria.sort && criteria.sort !== 'newest')
    params.set('sort', criteria.sort)
  if (options.preview) params.set('preview', 'true')
  if (options.excludeRetweets) params.set('exclude_retweets', 'true')

  const response = await fetchImpl(`/api/tweet-search?${params.toString()}`, {
    cache: 'no-store',
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(
      `ClickHouse tweet search failed (${response.status}): ${body.slice(0, 300)}`,
    )
  }

  let result: ClickHouseSearchResponse
  try {
    result = JSON.parse(body) as ClickHouseSearchResponse
  } catch {
    throw new Error('ClickHouse tweet search returned invalid JSON')
  }

  if (!Array.isArray(result.data?.tweets)) {
    throw new Error('ClickHouse tweet search returned an invalid response')
  }

  return {
    tweets: mapSearchTweets(result),
    definitiveEmpty: result.data.definitiveEmpty === true,
  }
}

async function requestClickHouseTweets(
  criteria: FilterCriteria,
  page: number,
  pageSize: number,
  fetchImpl: typeof fetch,
  options: ClickHouseSearchRequestOptions = {},
): Promise<TimelineTweet[]> {
  return (
    await requestClickHouseSearch(criteria, page, pageSize, fetchImpl, options)
  ).tweets
}

export async function searchTweetsWithClickHouse(
  criteria: FilterCriteria,
  page: number,
  pageSize: number,
  fetchImpl: typeof fetch = fetch,
): Promise<TimelineTweet[]> {
  return requestClickHouseTweets(criteria, page, pageSize, fetchImpl)
}

export function canPreviewTweetSearch(
  criteria: FilterCriteria,
  enabled = process.env.NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH,
): boolean {
  return (
    enabled === 'true' &&
    Boolean(criteria.rawSearchQuery?.trim()) &&
    (!criteria.sort || criteria.sort === 'newest')
  )
}

export async function searchTweetPreviewsWithClickHouse(
  criteria: FilterCriteria,
  fetchImpl: typeof fetch = fetch,
): Promise<MappedClickHouseSearchResponse> {
  return requestClickHouseSearch(criteria, 1, 3, fetchImpl, {
    preview: true,
    excludeRetweets: criteria.excludeRetweets,
  })
}
