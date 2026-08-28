import 'server-only'

import {
  fetchAnalyticsGatewayJson,
  type AnalyticsGatewayFetcher,
} from '@/lib/clickhouseGateway'
import { devLog } from '@/lib/devLog'
import type { ArchiveTweet, ProfileTweet } from './types'

export type ProfileTweetSort = 'engagement' | 'recent'

interface GatewayMedia {
  mediaUrl?: unknown
  mediaType?: unknown
  width?: unknown
  height?: unknown
}

interface GatewayTweet {
  tweetId?: unknown
  accountId?: unknown
  createdAt?: unknown
  fullText?: unknown
  replyToUsername?: unknown
  favoriteCount?: unknown
  retweetCount?: unknown
  username?: unknown
  accountDisplayName?: unknown
  avatarMediaUrl?: unknown
  media?: unknown
  quoteTweetId?: unknown
  quotedTweet?: unknown
}

interface GatewayResponse {
  data?: { tweets?: unknown }
  query?: {
    accountId?: unknown
    limit?: unknown
    sort?: unknown
  }
}

export interface ProfileTweetsState {
  tweets: ProfileTweet[]
  available: boolean
}

const ID_PATTERN = /^\d{1,20}$/

function count(value: unknown, label: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`ClickHouse returned an invalid ${label}`)
  }
  return parsed
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('ClickHouse returned an invalid profile tweet timestamp')
  }
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('ClickHouse returned an invalid profile tweet timestamp')
  }
  return parsed.toISOString()
}

function media(value: unknown): ArchiveTweet['media'][number] {
  const item = value as GatewayMedia
  if (
    typeof item.mediaUrl !== 'string' ||
    !item.mediaUrl.trim() ||
    typeof item.mediaType !== 'string' ||
    !item.mediaType.trim()
  ) {
    throw new Error('ClickHouse returned invalid profile tweet media')
  }
  return {
    media_url: item.mediaUrl,
    media_type: item.mediaType,
    width: count(item.width ?? 0, 'profile tweet media width'),
    height: count(item.height ?? 0, 'profile tweet media height'),
  }
}

function archiveTweet(value: unknown): ArchiveTweet {
  const tweet = value as GatewayTweet
  if (
    typeof tweet.tweetId !== 'string' ||
    !ID_PATTERN.test(tweet.tweetId) ||
    typeof tweet.accountId !== 'string' ||
    !ID_PATTERN.test(tweet.accountId) ||
    typeof tweet.username !== 'string' ||
    !tweet.username ||
    typeof tweet.fullText !== 'string'
  ) {
    throw new Error('ClickHouse returned an invalid profile tweet')
  }
  return {
    tweet_id: tweet.tweetId,
    account_id: tweet.accountId,
    created_at: timestamp(tweet.createdAt),
    full_text: tweet.fullText,
    favorite_count: count(tweet.favoriteCount, 'profile tweet favorite count'),
    retweet_count: count(tweet.retweetCount, 'profile tweet repost count'),
    reply_to_username:
      typeof tweet.replyToUsername === 'string' && tweet.replyToUsername
        ? tweet.replyToUsername
        : null,
    username: tweet.username,
    account_display_name:
      typeof tweet.accountDisplayName === 'string' && tweet.accountDisplayName
        ? tweet.accountDisplayName
        : tweet.username,
    avatar_media_url:
      typeof tweet.avatarMediaUrl === 'string' && tweet.avatarMediaUrl.trim()
        ? tweet.avatarMediaUrl
        : null,
    media: Array.isArray(tweet.media) ? tweet.media.map(media) : [],
  }
}

function profileTweet(value: unknown, accountId: string): ProfileTweet {
  const row = value as GatewayTweet
  const tweet = archiveTweet(row)
  if (tweet.account_id !== accountId) {
    throw new Error('ClickHouse returned a mismatched profile tweet author')
  }
  const quoteTweetId =
    row.quoteTweetId === null || row.quoteTweetId === undefined
      ? null
      : typeof row.quoteTweetId === 'string' &&
          ID_PATTERN.test(row.quoteTweetId)
        ? row.quoteTweetId
        : (() => {
            throw new Error('ClickHouse returned an invalid quoted tweet ID')
          })()
  const quotedTweet =
    row.quotedTweet === null || row.quotedTweet === undefined
      ? null
      : archiveTweet(row.quotedTweet)
  if (quotedTweet && quotedTweet.tweet_id !== quoteTweetId) {
    throw new Error('ClickHouse returned mismatched quoted tweet content')
  }
  return { ...tweet, quote_tweet_id: quoteTweetId, quoted_tweet: quotedTweet }
}

export async function fetchProfileTweets(
  accountId: string,
  sort: ProfileTweetSort,
  limit = 6,
  fetcher: AnalyticsGatewayFetcher = fetchAnalyticsGatewayJson,
): Promise<ProfileTweet[]> {
  if (!ID_PATTERN.test(accountId)) {
    throw new Error('Profile tweets require a numeric account ID')
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error('Invalid profile tweet limit')
  }

  const params = new URLSearchParams({ limit: String(limit), sort })
  const response = await fetcher<GatewayResponse>(
    ['user', accountId, 'tweets'],
    params,
    { revalidate: 300, timeoutMs: 15_000 },
  )
  const tweets = response.data?.tweets
  if (
    !Array.isArray(tweets) ||
    response.query?.accountId !== accountId ||
    Number(response.query?.limit) !== limit ||
    response.query?.sort !== sort
  ) {
    throw new Error('ClickHouse returned mismatched profile tweets')
  }
  return tweets.map((tweet) => profileTweet(tweet, accountId))
}

export async function getProfileTweets(
  accountId: string,
  sort: ProfileTweetSort,
  limit = 6,
): Promise<ProfileTweetsState> {
  try {
    return {
      tweets: await fetchProfileTweets(accountId, sort, limit),
      available: true,
    }
  } catch (error) {
    devLog('profile tweets unavailable', { accountId, sort, error })
    return { tweets: [], available: false }
  }
}
