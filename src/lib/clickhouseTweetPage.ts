import type { TweetData } from '@/components/TweetComponent'
import { fetchAnalyticsGatewayJson } from './clickhouseGateway'
import {
  buildConversationTree,
  type ConversationTree,
  type ThreadTweet,
} from './threadUtils'

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

interface ClickHouseThreadTweet extends ClickHouseTweetDetail {
  quoteTweetId: string | null
  quotedTweet: ClickHouseTweetDetail | null
  retweetedTweetId: string | null
}

interface ClickHouseTweetThreadResponse {
  data: {
    tweet: ClickHouseThreadTweet
    conversationTweets: ClickHouseThreadTweet[]
  }
}

export interface ClickHouseTweetThreadPageData {
  tweet: TweetData
  threadTree: ConversationTree | null
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

function deletedQuotedTweet(tweetId: string) {
  return {
    tweet_id: tweetId,
    account_id: '',
    created_at: '',
    full_text: '',
    retweet_count: 0,
    favorite_count: 0,
    username: '',
    account_display_name: '',
    is_deleted: true as const,
  }
}

function toTweetData(
  tweet: ClickHouseTweetDetail,
  quoteTweetId: string | null,
  quote: ClickHouseTweetDetail | null,
  retweetedTweetId: string | null,
): TweetData {
  const username = tweet.username || 'unknown_user'
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
    quote_tweet_id: quoteTweetId,
    retweeted_tweet_id: retweetedTweetId,
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
      : quoteTweetId
        ? deletedQuotedTweet(quoteTweetId)
        : undefined,
  }
}

function toThreadTweet(tweet: ClickHouseThreadTweet): ThreadTweet {
  const rendered = toTweetData(
    tweet,
    tweet.quoteTweetId,
    tweet.quotedTweet,
    null,
  )
  return {
    tweet_id: rendered.tweet_id,
    account_id: rendered.account_id,
    created_at: rendered.created_at,
    full_text: rendered.full_text,
    retweet_count: rendered.retweet_count,
    favorite_count: rendered.favorite_count,
    reply_to_tweet_id: rendered.reply_to_tweet_id,
    reply_to_user_id: null,
    reply_to_username: rendered.reply_to_username || null,
    username: rendered.username,
    account_display_name: rendered.account_display_name,
    avatar_media_url: rendered.avatar_media_url || undefined,
    media: rendered.media,
    quote_tweet_id: rendered.quote_tweet_id,
    quoted_tweet: rendered.quoted_tweet || null,
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
  const quote = response.data.quotedTweet
  return toTweetData(tweet, tweet.quoteTweetId, quote, tweet.retweetedTweetId)
}

export async function fetchClickHouseTweetThreadPageData(
  tweetId: string,
  fetcher = fetchAnalyticsGatewayJson,
): Promise<ClickHouseTweetThreadPageData | null> {
  if (!/^\d{1,20}$/.test(tweetId)) return null

  const response = await fetcher<ClickHouseTweetThreadResponse>(
    ['tweet', tweetId, 'thread'],
    new URLSearchParams(),
    { revalidate: 3600 },
  )
  if (!response.data?.tweet) return null

  const selected = response.data.tweet
  const nodes = [...(response.data.conversationTweets || [])]
  if (!nodes.some((tweet) => tweet.tweetId === selected.tweetId)) {
    nodes.push(selected)
  }
  const threadTweets = nodes.map(toThreadTweet)
  return {
    tweet: toTweetData(
      selected,
      selected.quoteTweetId,
      selected.quotedTweet,
      selected.retweetedTweetId,
    ),
    threadTree:
      threadTweets.length > 1 ? buildConversationTree(threadTweets) : null,
  }
}
