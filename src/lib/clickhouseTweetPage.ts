import type { TweetData } from '@/components/TweetComponent'
import { fetchAnalyticsGatewayJson } from './clickhouseGateway'

interface ClickHouseTweetDetail {
  tweetId: string
  accountId: string
  createdAt: string
  fullText: string
  replyToTweetId: string | null
  replyToUsername: string | null
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

interface ClickHouseTweetDetailResponse {
  data: {
    tweet: ClickHouseTweetDetail & {
      quoteTweetId: string | null
      retweetedTweetId: string | null
    }
    quotedTweet: ClickHouseTweetDetail | null
  }
}

function count(value: string | number | null): number {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function timestamp(value: string): string {
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(value)) return value
  return `${value.replace(' ', 'T')}Z`
}

function media(tweet: ClickHouseTweetDetail) {
  return (tweet.media || []).map((item) => ({
    media_url: item.mediaUrl,
    media_type: item.mediaType,
    width: item.width ?? undefined,
    height: item.height ?? undefined,
  }))
}

function quotedTweet(
  tweet: ClickHouseTweetDetail,
): NonNullable<TweetData['quoted_tweet']> {
  const username = tweet.username || 'unknown_user'
  return {
    tweet_id: tweet.tweetId,
    account_id: tweet.accountId,
    created_at: timestamp(tweet.createdAt),
    full_text: tweet.fullText,
    retweet_count:
      tweet.retweetCount === null ? null : count(tweet.retweetCount),
    favorite_count: count(tweet.favoriteCount),
    avatar_media_url: tweet.avatarMediaUrl || undefined,
    username,
    account_display_name: tweet.accountDisplayName || username,
    media: media(tweet),
  }
}

export async function fetchClickHouseTweetPageData(
  tweetId: string,
  fetcher = fetchAnalyticsGatewayJson,
): Promise<TweetData | null> {
  if (!/^\d{1,20}$/.test(tweetId)) return null

  const response = await fetcher<ClickHouseTweetDetailResponse>(
    ['tweet', tweetId],
    new URLSearchParams(),
    { revalidate: 3600 },
  )
  if (!response.data?.tweet) return null

  const tweet = response.data.tweet
  const username = tweet.username || 'unknown_user'
  const quote = response.data.quotedTweet
  return {
    tweet_id: tweet.tweetId,
    account_id: tweet.accountId,
    created_at: timestamp(tweet.createdAt),
    full_text: tweet.fullText,
    retweet_count:
      tweet.retweetCount === null ? null : count(tweet.retweetCount),
    favorite_count: count(tweet.favoriteCount),
    reply_to_tweet_id: tweet.replyToTweetId,
    reply_to_username: tweet.replyToUsername || undefined,
    quote_tweet_id: tweet.quoteTweetId,
    retweeted_tweet_id: tweet.retweetedTweetId,
    avatar_media_url: tweet.avatarMediaUrl,
    username,
    account_display_name: tweet.accountDisplayName || username,
    media: media(tweet),
    urls: [],
    account: {
      username,
      account_display_name: tweet.accountDisplayName || username,
      profile: tweet.avatarMediaUrl
        ? { avatar_media_url: tweet.avatarMediaUrl }
        : undefined,
    },
    quoted_tweet: quote
      ? quotedTweet(quote)
      : tweet.quoteTweetId
        ? {
            tweet_id: tweet.quoteTweetId,
            account_id: '',
            created_at: '',
            full_text: '',
            retweet_count: 0,
            favorite_count: 0,
            username: '',
            account_display_name: '',
            is_deleted: true,
          }
        : undefined,
  }
}
