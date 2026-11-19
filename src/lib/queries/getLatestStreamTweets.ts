import type { PortalTweet } from '@/lib/portal/types'

/** Authored-time cursor for the next (older) page of the live stream. */
export interface StreamTweetsCursor {
  createdAt: string
  id: string
}

export interface StreamMonitorTweet {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number | null
  favorite_count: number
  reply_to_tweet_id: string | null
  quote_tweet_id: string | null
  retweeted_tweet_id: string | null
  avatar_media_url: string | null
  username: string
  account_display_name: string
  media: { media_url: string; media_type: string }[]
  urls: { expanded_url: string | null; display_url: string }[]
}

export interface StreamTweetsPage {
  tweets: StreamMonitorTweet[]
  nextCursor: StreamTweetsCursor | null
  hasMore: boolean
}

function toStreamMonitorTweet(tweet: PortalTweet): StreamMonitorTweet {
  return {
    tweet_id: tweet.id,
    account_id: tweet.accountId ?? '',
    created_at: tweet.createdAt,
    full_text: tweet.text,
    retweet_count: tweet.retweetCountAvailable === false ? null : tweet.rts,
    favorite_count: tweet.likes,
    reply_to_tweet_id: null,
    quote_tweet_id: tweet.quotedTweet?.id ?? null,
    retweeted_tweet_id: null,
    avatar_media_url: tweet.avatar,
    username: tweet.username,
    account_display_name: tweet.name,
    media: (tweet.media ?? []).map((media) => ({
      media_url: media.url,
      media_type: media.type,
    })),
    urls: [],
  }
}

/**
 * Latest streamed top-level posts, newest first, from the ClickHouse-backed
 * live stream route (the same source as /stream). The Supabase corpus read
 * this page used before was retired with anonymous corpus access.
 */
export async function getLatestStreamTweets(
  cursor: StreamTweetsCursor | null,
): Promise<StreamTweetsPage> {
  const params = new URLSearchParams()
  if (cursor) {
    params.set('before', cursor.createdAt)
    params.set('beforeId', cursor.id)
  }
  const query = params.toString()
  const response = await fetch(`/api/portal/stream${query ? `?${query}` : ''}`)
  if (!response.ok) throw new Error('Failed to fetch the latest tweets')
  const body = (await response.json()) as {
    tweets?: PortalTweet[]
    nextCursor?: StreamTweetsCursor | null
    hasMore?: boolean
  }
  if (!Array.isArray(body.tweets))
    throw new Error('The live stream returned an invalid response')
  return {
    tweets: body.tweets.map(toStreamMonitorTweet),
    nextCursor: body.nextCursor ?? null,
    hasMore: body.hasMore === true,
  }
}
