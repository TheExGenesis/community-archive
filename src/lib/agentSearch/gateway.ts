import {
  clickHouseSearchGatewayBaseUrl,
  fetchAnalyticsGatewayJson,
} from '@/lib/clickhouseGateway'
import type { PortalMedia, PortalQuotedTweet } from '@/lib/portal/types'
import { callTimeoutMs, deadlinePassed, type RunLimits } from './deadline'
import { traced } from './trace'
import type { AgentTweet } from './types'

// Tool backends. Every read goes through the ClickHouse gateway, which applies
// opt-outs; nothing here falls back to Supabase corpus reads (AGENTS.md).
// Each call's timeout is cut to the run's remaining time (deadline.ts), and
// no call starts after the deadline.

const GATEWAY_TIMEOUT_MS = 20_000
const ID = /^\d{1,20}$/

/** Id lookups are 100 at a time; this many run at once. */
const ID_BATCH = 100
const ID_BATCH_CONCURRENCY = 4

/** A gateway read, timed on the run's trace when it carries one. */
function gatewayJson<T>(
  limits: RunLimits,
  path: string[],
  params: URLSearchParams,
  options: Parameters<typeof fetchAnalyticsGatewayJson>[2],
): Promise<T> {
  return traced(limits, 'gateway', path[0], () =>
    fetchAnalyticsGatewayJson<T>(path, params, options),
  )
}

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
  limits: RunLimits = {},
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
  const response = await gatewayJson<{
    data: { tweets: GatewayTweet[]; nextOffset: number | null }
  }>(limits, ['search'], params, {
    baseUrl: clickHouseSearchGatewayBaseUrl(),
    timeoutMs: callTimeoutMs(limits, GATEWAY_TIMEOUT_MS),
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
  limits: RunLimits = {},
): Promise<{ tweet: AgentTweet; conversation: AgentTweet[] } | null> {
  if (!ID.test(tweetId)) throw new Error('Invalid tweet id')
  const response = await gatewayJson<{
    data?: { tweet: GatewayTweet; conversationTweets: GatewayTweet[] }
  }>(
    limits,
    ['tweet', tweetId, 'thread'],
    new URLSearchParams({ limit: String(limit) }),
    { timeoutMs: callTimeoutMs(limits, GATEWAY_TIMEOUT_MS) },
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
  limits: RunLimits = {},
): Promise<{ tweets: AgentTweet[]; total: number }> {
  if (!ID.test(tweetId)) throw new Error('Invalid tweet id')
  const response = await gatewayJson<{
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
    limits,
    ['quote-posts', tweetId],
    new URLSearchParams({
      limit: String(Math.min(Math.max(limit, 1), 100)),
      offset: String(Math.min(Math.max(offset, 0), 5000)),
      exclude_self: 'true',
      quote_ca_users_only: 'true',
    }),
    { timeoutMs: callTimeoutMs(limits, GATEWAY_TIMEOUT_MS) },
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

/**
 * Looks up any number of tweets by id, 100 per call with a few calls in
 * flight, and returns what the gateway had, in no particular order.
 */
export async function getTweetsByIdsBatched(
  ids: string[],
  limits: RunLimits = {},
): Promise<AgentTweet[]> {
  const unique = Array.from(new Set(ids))
  const batches: string[][] = []
  for (let i = 0; i < unique.length; i += ID_BATCH)
    batches.push(unique.slice(i, i + ID_BATCH))
  const found: AgentTweet[] = []
  for (let i = 0; i < batches.length; i += ID_BATCH_CONCURRENCY) {
    const pages = await Promise.all(
      batches
        .slice(i, i + ID_BATCH_CONCURRENCY)
        .map((batch) => getTweetsByIds(batch, limits)),
    )
    for (const page of pages) found.push(...page)
  }
  return found
}

export async function getTweetsByIds(
  ids: string[],
  limits: RunLimits = {},
): Promise<AgentTweet[]> {
  const valid = Array.from(new Set(ids.filter((id) => ID.test(id)))).slice(
    0,
    100,
  )
  if (valid.length === 0) return []
  const response = await gatewayJson<{
    data: Array<{
      tweet_id: string
      account_id: string
      created_at: string
      full_text: string
      reply_to_tweet_id: string | null
      username: string
      display_name?: string
      avatar_url?: string | null
      is_tombstone?: boolean
    }>
  }>(
    limits,
    ['bulletin-sources'],
    new URLSearchParams({ ids: valid.join(','), enrich: 'true' }),
    { timeoutMs: callTimeoutMs(limits, GATEWAY_TIMEOUT_MS) },
  )
  if (!Array.isArray(response.data)) {
    throw new Error('Gateway bulletin-sources returned an invalid payload')
  }
  // A deleted tweet's latest version is a tombstone; the Bulletin worker drops
  // these rows from the same endpoint.
  return response.data
    .filter((row) => !row.is_tombstone)
    .map((row) =>
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

export async function getUser(
  identifier: string,
  limits: RunLimits = {},
): Promise<AgentUser | null> {
  const clean = identifier.trim().replace(/^@/, '')
  if (!/^[A-Za-z0-9_]{1,80}$/.test(clean)) return null
  const response = await gatewayJson<{
    data?: {
      account?: Record<string, unknown>
      topTweets?: Array<Record<string, unknown>>
    }
  }>(
    limits,
    ['user', clean],
    new URLSearchParams({ limit: '5', include_interactions: 'false' }),
    { timeoutMs: callTimeoutMs(limits, GATEWAY_TIMEOUT_MS) },
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
  limits: RunLimits = {},
): Promise<
  Array<{ accountId: string | null; username: string; displayName: string }>
> {
  const response = await gatewayJson<{
    data: {
      users: Array<{
        accountId: string | null
        username: string
        displayName: string
      }>
    }
  }>(
    limits,
    ['member-directory'],
    new URLSearchParams({
      limit: String(limit),
      offset: '0',
      sort_by: 'num_followers',
      sort_order: 'desc',
      search: search.trim().replace(/^@/, '').slice(0, 40),
    }),
    { timeoutMs: callTimeoutMs(limits, GATEWAY_TIMEOUT_MS) },
  )
  return (response.data?.users ?? []).map((user) => ({
    accountId: user.accountId,
    username: user.username,
    displayName: user.displayName,
  }))
}

/** Full detail (counts, media, quoted tweet) for a few ids, in parallel. */
export async function getTweetDetails(
  ids: string[],
  limits: RunLimits = {},
): Promise<AgentTweet[]> {
  const valid = Array.from(new Set(ids.filter((id) => ID.test(id)))).slice(
    0,
    30,
  )
  const tweets: AgentTweet[] = []
  for (let i = 0; i < valid.length; i += 8) {
    const batch = await Promise.all(
      valid.slice(i, i + 8).map(async (id) => {
        const response = await gatewayJson<{
          data?: { tweet: GatewayTweet; quotedTweet: GatewayTweet | null }
        }>(limits, ['tweet', id], new URLSearchParams(), {
          timeoutMs: callTimeoutMs(limits, GATEWAY_TIMEOUT_MS),
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

// --- API v1 ---------------------------------------------------------------
// One account's own tweets come from the public API v1 contract
// (analytics.community-archive.org/v1/openapi.json). Locally the gateway
// stand-in serves it at <CLICKHOUSE_SEARCH_API_URL>/v1. Which production
// route and key the agent should use is not decided yet: the keyed public API
// allows 60 requests a minute and two in flight per account.

interface V1Tweet {
  tweet_id: string
  account_id: string
  username: string | null
  account_display_name: string | null
  avatar_media_url: string | null
  created_at: string
  full_text: string
  favorite_count: number
  retweet_count: number
  reply_to_tweet_id: string | null
  reply_to_username: string | null
  quoted_tweet_id: string | null
  media?: Array<{
    media_url: string
    media_type: string
    width: number | null
    height: number | null
  }>
}

/**
 * The API v1 base: COMMUNITY_ARCHIVE_API_V1_URL, else /v1 on the gateway host
 * (the search URL, or the analytics URL without its /analytics).
 */
export function apiV1BaseUrl(
  env: Record<string, string | undefined> = process.env,
) {
  const explicit = env.COMMUNITY_ARCHIVE_API_V1_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const host =
    env.CLICKHOUSE_SEARCH_API_URL?.trim() ||
    env.CLICKHOUSE_ANALYTICS_API_URL?.trim().replace(/\/analytics\/?$/, '')
  return host ? `${host.replace(/\/$/, '')}/v1` : undefined
}

/** An API v1 error, with the HTTP status and the API's error code. */
export class ApiV1Error extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiV1Error'
  }
}

/** Attempts at one API v1 request when it answers 429 or 503. */
const V1_ATTEMPTS = 3
/** The wait before a retry: Retry-After, at most 10 s, else 1 s. */
const V1_MAX_RETRY_WAIT_MS = 10_000
const V1_DEFAULT_RETRY_WAIT_MS = 1_000

function retryWaitMs(retryAfter: string | null | undefined): number {
  const value = retryAfter?.trim() ?? ''
  // Seconds only; an HTTP date counts as missing.
  if (!/^\d+(\.\d+)?$/.test(value)) return V1_DEFAULT_RETRY_WAIT_MS
  return Math.min(Number(value) * 1000, V1_MAX_RETRY_WAIT_MS)
}

/**
 * Aborts when either signal does, as in semantic.ts. `release` removes its
 * listeners, since the run's signal outlives many calls.
 */
function either(a: AbortSignal, b: AbortSignal) {
  const controller = new AbortController()
  const releases: Array<() => void> = []
  for (const signal of [a, b]) {
    if (signal.aborted) controller.abort(signal.reason)
    else {
      const onAbort = () => controller.abort(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      releases.push(() => signal.removeEventListener('abort', onAbort))
    }
  }
  return {
    signal: controller.signal,
    release: () => releases.forEach((release) => release()),
  }
}

/** Waits `ms`, or rejects as soon as `signal` aborts. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * One API v1 read. A 429 or 503 is retried after Retry-After, up to three
 * attempts, but never waits or retries past the run's deadline or after the
 * run is stopped; any other failure throws an ApiV1Error at once.
 */
async function apiV1Json<T>(
  label: string,
  path: string,
  params: URLSearchParams,
  limits: RunLimits,
): Promise<T> {
  const base = apiV1BaseUrl()
  if (!base) throw new Error('CLICKHOUSE_SEARCH_API_URL is not configured')
  const token =
    process.env.COMMUNITY_ARCHIVE_API_KEY?.trim() ||
    process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
  if (!token) throw new Error('No key for the Community Archive API v1')
  const attempt = async (timeoutMs: number) => {
    const timeout = AbortSignal.timeout(timeoutMs)
    const stop = limits.abortSignal
      ? either(timeout, limits.abortSignal)
      : undefined
    try {
      const response = await fetch(`${base}${path}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: stop?.signal ?? timeout,
        cache: 'no-store',
      })
      const body = (await response.json().catch(() => null)) as
        | (T & { error?: { code?: string; message?: string } })
        | null
      return { response, body }
    } finally {
      stop?.release()
    }
  }
  // Throws before the span when the run has no time left, like gatewayJson.
  let timeoutMs = callTimeoutMs(limits, GATEWAY_TIMEOUT_MS)
  // One gateway span covers every attempt and the waits between them, so
  // time spent rate-limited counts as archive time, not the shell's.
  return traced(limits, 'gateway', label, async () => {
    for (let attempts = 1; ; attempts++) {
      const { response, body } = await attempt(timeoutMs)
      if (response.ok && body) return body
      const error = new ApiV1Error(
        response.status,
        body?.error?.code ?? 'upstream_unavailable',
        body?.error?.message ??
          `Community Archive API failed (${response.status})`,
      )
      if (
        (response.status !== 429 && response.status !== 503) ||
        attempts >= V1_ATTEMPTS
      ) {
        throw error
      }
      const waitMs = retryWaitMs(response.headers.get('Retry-After'))
      if (deadlinePassed(limits, Date.now() + waitMs)) throw error
      await pause(waitMs, limits.abortSignal)
      timeoutMs = callTimeoutMs(limits, GATEWAY_TIMEOUT_MS)
    }
  })
}

const fromV1 = (row: V1Tweet): AgentTweet =>
  toAgentTweet({
    tweetId: row.tweet_id,
    accountId: row.account_id,
    createdAt: row.created_at,
    fullText: row.full_text,
    replyToTweetId: row.reply_to_tweet_id,
    replyToUsername: row.reply_to_username,
    favoriteCount: row.favorite_count,
    retweetCount: row.retweet_count,
    username: row.username,
    accountDisplayName: row.account_display_name,
    avatarMediaUrl: row.avatar_media_url,
    media: (row.media ?? []).map((m) => ({
      mediaUrl: m.media_url,
      mediaType: m.media_type,
      width: m.width,
      height: m.height,
    })),
    quoteTweetId: row.quoted_tweet_id,
  })

export interface AccountTweetsInput {
  /** A username (with or without @) or a numeric account id. */
  account: string
  order?: 'asc' | 'desc'
  since?: string
  until?: string
  excludeReplies?: boolean
  excludeRetweets?: boolean
  /** Up to 200 per page. */
  limit?: number
  cursor?: string
}

/** One page of an account's tweets, ordered by tweet id. */
export async function getAccountTweets(
  input: AccountTweetsInput,
  limits: RunLimits = {},
): Promise<{ tweets: AgentTweet[]; nextCursor: string | null }> {
  const params = new URLSearchParams({
    order: input.order ?? 'desc',
    limit: String(Math.min(Math.max(input.limit ?? 200, 1), 200)),
  })
  if (input.since) params.set('since', input.since)
  if (input.until) params.set('until', input.until)
  if (input.excludeReplies) params.set('exclude_replies', 'true')
  if (input.excludeRetweets) params.set('exclude_retweets', 'true')
  if (input.cursor) params.set('cursor', input.cursor)
  const account = input.account.trim().replace(/^@/, '')
  // A numeric username needs an @ to be read as a username.
  const segment =
    /^\d+$/.test(account) && input.account.trim().startsWith('@')
      ? `@${account}`
      : account
  const body = await apiV1Json<{ data: V1Tweet[]; next_cursor: string | null }>(
    'v1-timeline',
    `/accounts/${encodeURIComponent(segment)}/tweets`,
    params,
    limits,
  )
  if (!Array.isArray(body.data)) {
    throw new Error('Community Archive API returned an invalid timeline')
  }
  return { tweets: body.data.map(fromV1), nextCursor: body.next_cursor ?? null }
}
