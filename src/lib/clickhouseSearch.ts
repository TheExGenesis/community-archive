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
  }
}

export async function searchTweetsWithClickHouse(
  criteria: FilterCriteria,
  page: number,
  pageSize: number,
  fetchImpl: typeof fetch = fetch,
): Promise<TimelineTweet[]> {
  const query = criteria.rawSearchQuery?.trim()
  if (!query) {
    throw new Error('ClickHouse text search requires the raw search query')
  }

  const offset = (page - 1) * pageSize
  if (offset > 5_000) return []

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
