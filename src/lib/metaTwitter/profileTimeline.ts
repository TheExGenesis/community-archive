import 'server-only'

import {
  fetchAnalyticsGatewayJson,
  type AnalyticsGatewayFetcher,
} from '@/lib/clickhouseGateway'
import type {
  PortalMedia,
  PortalQuotedTweet,
  PortalTweet,
} from '@/lib/portal/types'
import {
  PROFILE_TIMELINE_MAX_OFFSET,
  PROFILE_TIMELINE_PAGE_LIMIT,
  type ProfileTimelineKind,
} from './profilePagination'

const ID_PATTERN = /^\d{1,20}$/
// Opted-out tweets are removed at ingestion; five minutes is how long a newly
// removed or deleted tweet can keep appearing in a member's timeline page.
const PROFILE_TIMELINE_REVALIDATE_SECONDS = 300

export interface ProfileTimelinePage {
  tweets: PortalTweet[]
  nextOffset: number | null
  /** Older posts exist past the gateway's paging limit. */
  truncated: boolean
}

interface OwnTweetsResponse {
  data?: {
    tweets?: Array<{ tweetId?: unknown }>
    hasMore?: unknown
  }
  query?: {
    accountId?: unknown
    kind?: unknown
    sort?: unknown
    limit?: unknown
    offset?: unknown
  }
}

interface GatewayCardTweet {
  tweetId?: unknown
  accountId?: unknown
  createdAt?: unknown
  fullText?: unknown
  favoriteCount?: unknown
  retweetCount?: unknown
  username?: unknown
  accountDisplayName?: unknown
  avatarMediaUrl?: unknown
  media?: unknown
}

interface GatewayCard extends GatewayCardTweet {
  quoteTweetId?: unknown
  quotedTweet?: GatewayCardTweet | null
}

interface TweetCardsResponse {
  data?: { tweets?: unknown }
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

const count = (value: unknown): number => {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

const timestamp = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = /[zZ]$|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

const media = (value: unknown): PortalMedia[] =>
  Array.isArray(value)
    ? value.flatMap((item): PortalMedia[] => {
        const url = text(item?.mediaUrl)
        const type = text(item?.mediaType)
        if (!url || !type) return []
        const width = Number(item.width)
        const height = Number(item.height)
        return [
          {
            url,
            type,
            ...(width > 0 ? { width } : {}),
            ...(height > 0 ? { height } : {}),
          },
        ]
      })
    : []

function cardTweet(row: GatewayCardTweet): PortalQuotedTweet | null {
  const id = text(row.tweetId)
  const createdAt = timestamp(row.createdAt)
  if (!id || !ID_PATTERN.test(id) || !createdAt) return null
  if (typeof row.fullText !== 'string') return null
  const username = text(row.username) ?? 'unknown_user'
  const accountId = text(row.accountId)
  return {
    id,
    ...(accountId && ID_PATTERN.test(accountId) ? { accountId } : {}),
    username,
    name: text(row.accountDisplayName) ?? username,
    avatar: text(row.avatarMediaUrl),
    text: row.fullText,
    createdAt,
    likes: count(row.favoriteCount),
    rts: count(row.retweetCount),
    media: media(row.media),
  }
}

/** Maps one gateway tweet card to the canonical TweetCard contract. */
export function timelinePortalTweet(row: GatewayCard): PortalTweet | null {
  const tweet = cardTweet(row)
  if (!tweet) return null
  const quoteTweetId = text(row.quoteTweetId)
  const quoted = row.quotedTweet ? cardTweet(row.quotedTweet) : null
  const quotedTweet: PortalQuotedTweet | undefined = quoted
    ? quoted
    : quoteTweetId && ID_PATTERN.test(quoteTweetId)
      ? {
          id: quoteTweetId,
          username: '',
          name: '',
          avatar: null,
          text: '',
          createdAt: tweet.createdAt,
          likes: 0,
          rts: 0,
          media: [],
          isDeleted: true,
        }
      : undefined
  return {
    ...tweet,
    observedAt: tweet.createdAt,
    ...(quotedTweet ? { quotedTweet } : {}),
  }
}

/**
 * One page of an account's archived posts, newest first: the gateway's
 * own-tweets read picks the ids, and tweet-cards hydrates them with media
 * and quoted tweets. Cards the gateway no longer serves are left out.
 */
export async function fetchProfileTimelinePage(
  accountId: string,
  {
    offset = 0,
    kind = 'original',
  }: { offset?: number; kind?: ProfileTimelineKind },
  fetcher: AnalyticsGatewayFetcher = fetchAnalyticsGatewayJson,
): Promise<ProfileTimelinePage> {
  if (!ID_PATTERN.test(accountId)) {
    throw new Error('Invalid profile timeline account')
  }
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > PROFILE_TIMELINE_MAX_OFFSET
  ) {
    throw new Error('Invalid profile timeline offset')
  }
  if (kind !== 'original' && kind !== 'all') {
    throw new Error('Invalid profile timeline kind')
  }

  const limit = PROFILE_TIMELINE_PAGE_LIMIT
  const page = await fetcher<OwnTweetsResponse>(
    ['user', accountId, 'own-tweets'],
    new URLSearchParams({
      sort: 'newest',
      kind,
      limit: String(limit),
      offset: String(offset),
    }),
    { revalidate: PROFILE_TIMELINE_REVALIDATE_SECONDS, timeoutMs: 15_000 },
  )
  const rows = page.data?.tweets
  if (
    !Array.isArray(rows) ||
    String(page.query?.accountId) !== accountId ||
    page.query?.kind !== kind ||
    page.query?.sort !== 'newest' ||
    Number(page.query?.offset) !== offset ||
    rows.length > limit
  ) {
    throw new Error('ClickHouse returned an invalid profile timeline page')
  }
  const ids = rows.flatMap((row) => {
    const id = text(row?.tweetId)
    return id && ID_PATTERN.test(id) ? [id] : []
  })
  const hasMore = page.data?.hasMore === true
  const nextOffset =
    hasMore && offset + limit <= PROFILE_TIMELINE_MAX_OFFSET
      ? offset + limit
      : null
  const truncated = hasMore && nextOffset === null
  if (ids.length === 0) return { tweets: [], nextOffset, truncated }

  const cards = await fetcher<TweetCardsResponse>(
    ['tweet-cards'],
    new URLSearchParams({ ids: ids.join(',') }),
    { revalidate: PROFILE_TIMELINE_REVALIDATE_SECONDS, timeoutMs: 15_000 },
  )
  if (!Array.isArray(cards.data?.tweets)) {
    throw new Error('ClickHouse returned invalid profile timeline cards')
  }
  const byId = new Map<string, PortalTweet>()
  for (const row of cards.data.tweets as GatewayCard[]) {
    const tweet = timelinePortalTweet(row)
    // tweet-cards answers for whichever ids it holds; only keep this account's.
    if (tweet && tweet.accountId === accountId) byId.set(tweet.id, tweet)
  }
  return {
    tweets: ids.flatMap((id) => {
      const tweet = byId.get(id)
      return tweet ? [tweet] : []
    }),
    nextOffset,
    truncated,
  }
}
