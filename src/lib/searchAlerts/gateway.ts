import 'server-only'

import {
  fetchAnalyticsGatewayJson,
  type AnalyticsGatewayFetcher,
} from '@/lib/clickhouseGateway'
import { timelinePortalTweet } from '@/lib/metaTwitter/profileTimeline'
import type { PortalTweet } from '@/lib/portal/types'
import type { SearchAlertMode } from './input'
import type { MatchedTweetRef } from './store'

const ID_PATTERN = /^\d{1,20}$/
/** The gateway's largest search page. */
export const SEARCH_ALERT_PAGE_LIMIT = 50

export interface SearchAlertQuery {
  query: string
  mode: SearchAlertMode
  fromUser: string | null
}

interface SearchResponse {
  data?: {
    tweets?: Array<{
      tweetId?: unknown
      createdAt?: unknown
      replyToTweetId?: unknown
    }>
  }
}

/** Gateway timestamps come as "YYYY-MM-DD hh:mm:ss" UTC or ISO. */
export function gatewayTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const normalized = /[zZ]$|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * The newest tweets matching a search on or after `since`'s UTC day. The
 * gateway's `since` is a calendar date, so callers filter by exact time.
 */
export async function searchNewestMatches(
  search: SearchAlertQuery,
  since: Date,
  {
    fetcher = fetchAnalyticsGatewayJson,
    timeoutMs = 10_000,
  }: { fetcher?: AnalyticsGatewayFetcher; timeoutMs?: number } = {},
): Promise<MatchedTweetRef[]> {
  const params = new URLSearchParams({
    q: search.query,
    mode: search.mode,
    since: since.toISOString().slice(0, 10),
    sort: 'newest',
    limit: String(SEARCH_ALERT_PAGE_LIMIT),
    exclude_retweets: 'true',
  })
  if (search.fromUser) params.set('from_user', search.fromUser)
  const response = await fetcher<SearchResponse>(['search'], params, {
    timeoutMs,
  })
  const rows = response.data?.tweets
  if (!Array.isArray(rows)) {
    throw new Error('Search returned an invalid response')
  }
  return rows.flatMap((row): MatchedTweetRef[] => {
    const id = typeof row?.tweetId === 'string' ? row.tweetId : null
    const createdAt = gatewayTimestamp(row?.createdAt)
    if (!id || !ID_PATTERN.test(id) || !createdAt) return []
    const replyToId =
      typeof row.replyToTweetId === 'string' &&
      ID_PATTERN.test(row.replyToTweetId)
        ? row.replyToTweetId
        : null
    return [{ id, replyToId, createdAt }]
  })
}

interface TweetCardsResponse {
  data?: { tweets?: unknown }
}

/** Full TweetCard data for up to 100 ids; ids the gateway no longer serves are left out. */
export async function fetchTweetCards(
  ids: string[],
  {
    fetcher = fetchAnalyticsGatewayJson,
    timeoutMs = 10_000,
  }: { fetcher?: AnalyticsGatewayFetcher; timeoutMs?: number } = {},
): Promise<Map<string, PortalTweet>> {
  const unique = Array.from(new Set(ids.filter((id) => ID_PATTERN.test(id))))
  const cards = new Map<string, PortalTweet>()
  if (unique.length === 0) return cards
  for (let start = 0; start < unique.length; start += 100) {
    const response = await fetcher<TweetCardsResponse>(
      ['tweet-cards'],
      new URLSearchParams({ ids: unique.slice(start, start + 100).join(',') }),
      { timeoutMs },
    )
    if (!Array.isArray(response.data?.tweets)) {
      throw new Error('Tweet cards returned an invalid response')
    }
    for (const row of response.data.tweets) {
      const tweet = timelinePortalTweet(row as never)
      if (tweet) cards.set(tweet.id, tweet)
    }
  }
  return cards
}
