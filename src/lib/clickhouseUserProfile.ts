import 'server-only'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import type { FormattedUser } from '@/lib/types'

interface ClickHouseUserResponse {
  data?: {
    account?: {
      accountId?: unknown
      username?: unknown
      displayName?: unknown
      createdAt?: unknown
      bio?: unknown
      website?: unknown
      location?: unknown
      avatarUrl?: unknown
      headerUrl?: unknown
      followers?: unknown
      following?: unknown
      statusCount?: unknown
      likeCount?: unknown
    }
    membership?: {
      isMember?: unknown
      hasArchive?: unknown
      isOptedIn?: unknown
      joinedAt?: unknown
      snapshotAt?: unknown
    }
    topTweets?: unknown
  }
}

interface ClickHouseTopTweet {
  tweetId?: unknown
  createdAt?: unknown
  fullText?: unknown
  replyToUsername?: unknown
  favoriteCount?: unknown
  retweetCount?: unknown
}

export interface ClickHouseProfileTweet {
  tweetId: string
  createdAt: string
  fullText: string
  replyToUsername: string | null
  favoriteCount: number
  retweetCount: number
}

export interface ClickHouseUserProfile {
  user: FormattedUser
  topTweets: ClickHouseProfileTweet[]
  membershipResolved: boolean
}

const optionalText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

const optionalCount = (value: unknown): number | null => {
  const count = Number(value)
  return Number.isSafeInteger(count) && count >= 0 ? count : null
}

function profileTweet(value: unknown): ClickHouseProfileTweet | null {
  const tweet = value as ClickHouseTopTweet
  const tweetId = optionalText(tweet?.tweetId)
  const createdAt = optionalText(tweet?.createdAt)
  const fullText = optionalText(tweet?.fullText)
  const favoriteCount = optionalCount(tweet?.favoriteCount)
  const retweetCount = optionalCount(tweet?.retweetCount)
  if (
    !tweetId ||
    !/^\d{1,20}$/.test(tweetId) ||
    !createdAt ||
    Number.isNaN(Date.parse(createdAt)) ||
    !fullText ||
    favoriteCount === null ||
    retweetCount === null
  ) {
    return null
  }
  return {
    tweetId,
    createdAt,
    fullText,
    replyToUsername: optionalText(tweet.replyToUsername),
    favoriteCount,
    retweetCount,
  }
}

export async function getClickHouseUserProfile(
  identifier: string,
): Promise<ClickHouseUserProfile | null> {
  try {
    const response = await fetchAnalyticsGatewayJson<ClickHouseUserResponse>(
      ['user', identifier],
      new URLSearchParams({
        limit: '20',
        include_interactions: 'false',
        include_top_tweets: 'false',
      }),
      { revalidate: 300, timeoutMs: 8_000 },
    )
    const account = response.data?.account
    const accountId = optionalText(account?.accountId)
    const username = optionalText(account?.username)
    if (!accountId || !/^\d{1,20}$/.test(accountId) || !username) return null
    const topTweets = response.data?.topTweets
    const membership = response.data?.membership
    const membershipResolved =
      typeof membership?.isMember === 'boolean' &&
      typeof membership?.hasArchive === 'boolean' &&
      typeof membership?.isOptedIn === 'boolean'

    return {
      user: {
        account_id: accountId,
        username,
        account_display_name: optionalText(account?.displayName) || username,
        created_at: optionalText(account?.createdAt),
        bio: optionalText(account?.bio),
        website: optionalText(account?.website),
        location: optionalText(account?.location),
        avatar_media_url: optionalText(account?.avatarUrl),
        header_media_url: optionalText(account?.headerUrl),
        archive_at: null,
        num_tweets: optionalCount(account?.statusCount),
        num_followers: optionalCount(account?.followers),
        num_following: optionalCount(account?.following),
        num_likes: optionalCount(account?.likeCount),
        archive_uploaded_at: null,
        joined_at: membershipResolved
          ? optionalText(membership?.joinedAt)
          : null,
        has_archive: membershipResolved && membership?.hasArchive === true,
        is_opted_in: membershipResolved && membership?.isOptedIn === true,
      },
      topTweets: Array.isArray(topTweets)
        ? topTweets.flatMap((tweet) => {
            const parsed = profileTweet(tweet)
            return parsed ? [parsed] : []
          })
        : [],
      membershipResolved,
    }
  } catch {
    return null
  }
}
