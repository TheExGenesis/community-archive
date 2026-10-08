import {
  clickHouseSearchGatewayBaseUrl,
  fetchAnalyticsGatewayJson,
} from '@/lib/clickhouseGateway'
import type { PortalMedia, PortalQuotedTweet } from '@/lib/portal/types'
import type { AgentTweet } from './types'

// Tool backends. Every read goes through the ClickHouse gateway, which applies
// opt-outs; nothing here falls back to Supabase corpus reads (AGENTS.md).

const GATEWAY_TIMEOUT_MS = 20_000
const ID = /^\d{1,20}$/

interface GatewayMedia {
  mediaUrl: string
  mediaType: string
  width: number | null
  height: number | null
}

interface GatewayTweet {
  tweetId: string
  accountId: string
  createdAt: string
  fullText: string
  replyToTweetId: string | null
  replyToUsername?: string | null
  favoriteCount: string | number
  retweetCount: string | number | null
  username: string | null
  accountDisplayName: string | null
  avatarMediaUrl: string | null
  media?: GatewayMedia[]
  quoteTweetId?: string | null
  quotedTweet?: GatewayTweet | null
}

function timestamp(value: string): string {
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(value)) return value
  return `${value.replace(' ', 'T')}Z`
}

function count(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function media(rows: GatewayMedia[] | undefined): PortalMedia[] {
  return (rows ?? []).map((m) => ({
    url: m.mediaUrl,
    type: m.mediaType,
    width: m.width ?? undefined,
    height: m.height ?? undefined,
  }))
}

function quoted(row: GatewayTweet): PortalQuotedTweet {
  return {
    id: row.tweetId,
    accountId: row.accountId,
    username: row.username || 'unknown_user',
    name: row.accountDisplayName || row.username || 'Unknown',
    avatar: row.avatarMediaUrl,
    text: row.fullText,
    createdAt: timestamp(row.createdAt),
    likes: count(row.favoriteCount),
    rts: count(row.retweetCount),
    media: media(row.media),
  }
}

export function toAgentTweet(row: GatewayTweet): AgentTweet {
  const createdAt = timestamp(row.createdAt)
  return {
    id: row.tweetId,
    accountId: row.accountId,
    username: row.username || 'unknown_user',
    name: row.accountDisplayName || row.username || 'Unknown',
    avatar: row.avatarMediaUrl,
    text: row.fullText,
    observedAt: createdAt,
    createdAt,
    likes: count(row.favoriteCount),
    rts: count(row.retweetCount),
    retweetCountAvailable: row.retweetCount !== null,
    media: media(row.media),
    quotedTweet: row.quotedTweet ? quoted(row.quotedTweet) : undefined,
    replyToTweetId: row.replyToTweetId,
    replyToUsername: row.replyToUsername ?? null,
    quoteTweetId: row.quoteTweetId ?? null,
  }
}

export type SearchMode = 'phrase' | 'all'
export type SearchSort = 'newest' | 'oldest' | 'likes' | 'reposts'

export interface SearchTweetsInput {
  query: string
  mode?: SearchMode
  fromUser?: string
  replyToUser?: string
  since?: string
  until?: string
  sort?: SearchSort
  limit?: number
  offset?: number
}

export async function searchTweets(
  input: SearchTweetsInput,
): Promise<{ tweets: AgentTweet[]; nextOffset: number | null }> {
  const params = new URLSearchParams({
    q: input.query.trim(),
    mode: input.mode ?? (input.query.trim().includes(' ') ? 'phrase' : 'all'),
    limit: String(Math.min(Math.max(input.limit ?? 25, 1), 100)),
    offset: String(Math.min(Math.max(input.offset ?? 0, 0), 5000)),
    exclude_retweets: 'true',
  })
  if (input.fromUser) params.set('from_user', input.fromUser.replace(/^@/, ''))
  if (input.replyToUser) {
    params.set('reply_to_user', input.replyToUser.replace(/^@/, ''))
  }
  if (input.since) params.set('since', input.since)
  if (input.until) params.set('until', input.until)
  if (input.sort && input.sort !== 'newest') params.set('sort', input.sort)
  const response = await fetchAnalyticsGatewayJson<{
    data: { tweets: GatewayTweet[]; nextOffset: number | null }
  }>(['search'], params, {
    baseUrl: clickHouseSearchGatewayBaseUrl(),
    timeoutMs: GATEWAY_TIMEOUT_MS,
  })
  if (!Array.isArray(response.data?.tweets)) {
    throw new Error('Gateway search returned an invalid payload')
  }
  return {
    tweets: response.data.tweets.map(toAgentTweet),
    nextOffset: response.data.nextOffset ?? null,
  }
}

export async function getTweetThread(
  tweetId: string,
  limit = 60,
): Promise<{ tweet: AgentTweet; conversation: AgentTweet[] } | null> {
  if (!ID.test(tweetId)) throw new Error('Invalid tweet id')
  const response = await fetchAnalyticsGatewayJson<{
    data?: { tweet: GatewayTweet; conversationTweets: GatewayTweet[] }
  }>(
    ['tweet', tweetId, 'thread'],
    new URLSearchParams({ limit: String(limit) }),
    { timeoutMs: GATEWAY_TIMEOUT_MS },
  ).catch((error: { status?: number }) => {
    if (error?.status === 404) return { data: undefined }
    throw error
  })
  if (!response.data?.tweet) return null
  return {
    tweet: toAgentTweet(response.data.tweet),
    conversation: (response.data.conversationTweets ?? []).map(toAgentTweet),
  }
}

export async function getQuotePosts(
  tweetId: string,
  limit = 25,
  offset = 0,
): Promise<{ tweets: AgentTweet[]; total: number }> {
  if (!ID.test(tweetId)) throw new Error('Invalid tweet id')
  const response = await fetchAnalyticsGatewayJson<{
    data: Array<{
      tweetId: string
      accountId: string
      username: string | null
      displayName: string | null
      avatarUrl: string | null
      createdAt: string
      fullText: string
      favoriteCount: string | number
      retweetCount: string | number
      media?: GatewayMedia[]
    }>
    query: { total: string | number }
  }>(
    ['quote-posts', tweetId],
    new URLSearchParams({
      limit: String(Math.min(Math.max(limit, 1), 100)),
      offset: String(Math.min(Math.max(offset, 0), 5000)),
      exclude_self: 'true',
      quote_ca_users_only: 'true',
    }),
    { timeoutMs: GATEWAY_TIMEOUT_MS },
  )
  if (!Array.isArray(response.data)) {
    throw new Error('Gateway quote-posts returned an invalid payload')
  }
  const tweets = response.data.map((row) =>
    toAgentTweet({
      tweetId: row.tweetId,
      accountId: row.accountId,
      createdAt: row.createdAt,
      fullText: row.fullText,
      replyToTweetId: null,
      favoriteCount: row.favoriteCount,
      retweetCount: row.retweetCount,
      username: row.username,
      accountDisplayName: row.displayName,
      avatarMediaUrl: row.avatarUrl,
      media: row.media,
      quoteTweetId: tweetId,
    }),
  )
  return {
    tweets,
    total: Math.max(Number(response.query?.total) || 0, tweets.length),
  }
}

export async function getTweetsByIds(ids: string[]): Promise<AgentTweet[]> {
  const valid = Array.from(new Set(ids.filter((id) => ID.test(id)))).slice(
    0,
    100,
  )
  if (valid.length === 0) return []
  const response = await fetchAnalyticsGatewayJson<{
    data: Array<{
      tweet_id: string
      account_id: string
      created_at: string
      full_text: string
      reply_to_tweet_id: string | null
      username: string
      display_name?: string
      avatar_url?: string | null
    }>
  }>(
    ['bulletin-sources'],
    new URLSearchParams({ ids: valid.join(','), enrich: 'true' }),
    { timeoutMs: GATEWAY_TIMEOUT_MS },
  )
  if (!Array.isArray(response.data)) {
    throw new Error('Gateway bulletin-sources returned an invalid payload')
  }
  return response.data.map((row) =>
    toAgentTweet({
      tweetId: row.tweet_id,
      accountId: row.account_id,
      createdAt: row.created_at,
      fullText: row.full_text,
      replyToTweetId: row.reply_to_tweet_id,
      favoriteCount: 0,
      retweetCount: null,
      username: row.username,
      accountDisplayName: row.display_name ?? row.username,
      avatarMediaUrl: row.avatar_url ?? null,
    }),
  )
}

export interface AgentUser {
  accountId: string
  username: string
  displayName: string
  bio: string | null
  followers: number
  tweets: number
  topTweets: Array<{
    id: string
    createdAt: string
    text: string
    likes: number
  }>
}

export async function getUser(identifier: string): Promise<AgentUser | null> {
  const clean = identifier.trim().replace(/^@/, '')
  if (!/^[A-Za-z0-9_]{1,80}$/.test(clean)) return null
  const response = await fetchAnalyticsGatewayJson<{
    data?: {
      account?: Record<string, unknown>
      topTweets?: Array<Record<string, unknown>>
    }
  }>(
    ['user', clean],
    new URLSearchParams({ limit: '5', include_interactions: 'false' }),
    { timeoutMs: GATEWAY_TIMEOUT_MS },
  ).catch((error: { status?: number }) => {
    if (error?.status === 404) return { data: undefined }
    throw error
  })
  const account = response.data?.account
  if (!account || typeof account.accountId !== 'string') return null
  return {
    accountId: account.accountId,
    username: String(account.username ?? clean),
    displayName: String(account.displayName ?? account.username ?? clean),
    bio: typeof account.bio === 'string' ? account.bio : null,
    followers: count(account.followers),
    tweets: count(account.statusCount),
    topTweets: (response.data?.topTweets ?? []).map((tweet) => ({
      id: String(tweet.tweetId),
      createdAt: timestamp(String(tweet.createdAt)),
      text: String(tweet.fullText ?? ''),
      likes: count(tweet.favoriteCount),
    })),
  }
}

export async function findMembers(
  search: string,
  limit = 10,
): Promise<
  Array<{ accountId: string | null; username: string; displayName: string }>
> {
  const response = await fetchAnalyticsGatewayJson<{
    data: {
      users: Array<{
        accountId: string | null
        username: string
        displayName: string
      }>
    }
  }>(
    ['member-directory'],
    new URLSearchParams({
      limit: String(limit),
      offset: '0',
      sort_by: 'num_followers',
      sort_order: 'desc',
      search: search.trim().replace(/^@/, '').slice(0, 40),
    }),
    { timeoutMs: GATEWAY_TIMEOUT_MS },
  )
  return (response.data?.users ?? []).map((user) => ({
    accountId: user.accountId,
    username: user.username,
    displayName: user.displayName,
  }))
}

/** Full detail (counts, media, quoted tweet) for a few ids, in parallel. */
export async function getTweetDetails(ids: string[]): Promise<AgentTweet[]> {
  const valid = Array.from(new Set(ids.filter((id) => ID.test(id)))).slice(
    0,
    30,
  )
  const tweets: AgentTweet[] = []
  for (let i = 0; i < valid.length; i += 8) {
    const batch = await Promise.all(
      valid.slice(i, i + 8).map(async (id) => {
        const response = await fetchAnalyticsGatewayJson<{
          data?: { tweet: GatewayTweet; quotedTweet: GatewayTweet | null }
        }>(['tweet', id], new URLSearchParams(), {
          timeoutMs: GATEWAY_TIMEOUT_MS,
        }).catch((error: { status?: number }) => {
          if (error?.status === 404) return { data: undefined }
          throw error
        })
        if (!response.data?.tweet) return null
        return toAgentTweet({
          ...response.data.tweet,
          quotedTweet: response.data.quotedTweet,
        })
      }),
    )
    for (const tweet of batch) if (tweet) tweets.push(tweet)
  }
  return tweets
}
