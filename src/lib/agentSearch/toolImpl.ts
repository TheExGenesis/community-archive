import { scoreTweets } from './classifier'
import type { RunLimits } from './deadline'
import {
  findMembers,
  getQuotePosts,
  getTweetDetails,
  getTweetThread,
  getTweetsByIds,
  getUser,
  searchTweets,
  type SearchMode,
  type SearchSort,
} from './gateway'
import type { AgentTweet, ScoredTweet } from './types'

// Plain implementations of the agent's tools. The workflow wraps each one in a
// 'use step' function; scripts call them directly. The second argument carries
// the run's deadline (and, from the AI SDK in scripts, an abort signal); every
// gateway and scorer call below honours it.

/** Drops '' / null / [] values that models send for unused optional fields. */
function present<T extends object>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) =>
        value !== '' &&
        value !== null &&
        !(Array.isArray(value) && value.length === 0),
    ),
  ) as T
}

export const KEEP_THRESHOLD = 0.5
export const BORDERLINE_THRESHOLD = 0.35
// The agent can ask for up to MAX_COLLECT; most questions need far fewer.
export const DEFAULT_COLLECT = 300
export const MAX_COLLECT = 1000
const PAGE = 100
const MAX_KEPT_RETURNED = 60
const MAX_BORDERLINE_RETURNED = 20

export interface FindPeopleInput {
  query: string
}

export async function findPeopleImpl(
  { query }: FindPeopleInput,
  limits: RunLimits = {},
) {
  const handle = query.trim().replace(/^@/, '')
  const [members, user] = await Promise.all([
    findMembers(handle, 10, limits),
    /^[A-Za-z0-9_]{1,15}$/.test(handle)
      ? getUser(handle, limits)
      : Promise.resolve(null),
  ])
  return { query, members, user }
}

export interface SearchTweetsToolInput {
  query: string
  mode?: SearchMode
  anyOf?: string[]
  fromUser?: string
  replyToUser?: string
  since?: string
  until?: string
  sort?: SearchSort
  limit?: number
  offset?: number
}

function newestFirst(a: AgentTweet, b: AgentTweet) {
  return b.createdAt.localeCompare(a.createdAt)
}

export async function searchTweetsImpl(
  raw: SearchTweetsToolInput,
  limits: RunLimits = {},
) {
  const input = present(raw)
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const filters = {
    fromUser: input.fromUser,
    replyToUser: input.replyToUser,
    since: input.since,
    until: input.until,
    sort: input.sort,
  }
  if (input.anyOf?.length) {
    // The gateway has no any-word mode yet, so run the query and each
    // alternative separately and merge.
    const terms = Array.from(
      new Set(
        [input.query, ...input.anyOf].map((t) => t.trim()).filter(Boolean),
      ),
    ).slice(0, 9)
    const pages = await Promise.all(
      terms.map((term) =>
        searchTweets({ ...filters, query: term, limit }, limits),
      ),
    )
    const merged = new Map<string, AgentTweet>()
    for (const page of pages)
      for (const tweet of page.tweets) merged.set(tweet.id, tweet)
    return {
      query: terms.join(' OR '),
      tweets: Array.from(merged.values())
        .sort(newestFirst)
        .slice(0, limit * 2),
      nextOffset: null,
    }
  }
  const page = await searchTweets(
    {
      ...filters,
      query: input.query,
      mode: input.mode,
      limit,
      offset: input.offset,
    },
    limits,
  )
  return {
    query: input.query,
    tweets: page.tweets,
    nextOffset: page.nextOffset,
  }
}

async function parentTexts(
  tweets: AgentTweet[],
  limits: RunLimits,
): Promise<Map<string, string>> {
  const parentIds = Array.from(
    new Set(
      tweets.map((t) => t.replyToTweetId).filter((id): id is string => !!id),
    ),
  )
  const texts = new Map<string, string>()
  for (let i = 0; i < parentIds.length; i += 100) {
    const parents = await getTweetsByIds(parentIds.slice(i, i + 100), limits)
    for (const parent of parents) texts.set(parent.id, parent.text)
  }
  return texts
}

async function scoreWithParents(
  criterion: string,
  tweets: AgentTweet[],
  withParent: boolean,
  limits: RunLimits,
) {
  const parents = withParent
    ? await parentTexts(tweets, limits)
    : new Map<string, string>()
  const result = await scoreTweets(
    criterion,
    tweets.map((tweet) => ({
      id: tweet.id,
      text: tweet.text,
      parentText: tweet.replyToTweetId
        ? parents.get(tweet.replyToTweetId)
        : null,
    })),
    limits,
  )
  const scored: ScoredTweet[] = tweets
    .filter((tweet) => result.scores.has(tweet.id))
    .map((tweet) => ({ ...tweet, p: result.scores.get(tweet.id) ?? 0 }))
    .sort((a, b) => b.p - a.p)
  return { scored, scorer: result.scorer, costUsd: result.costUsd }
}

/**
 * Pages through every term in parallel, giving each an equal share of the
 * limit, so the first term cannot use it all. Shares left unused by terms
 * that run out pass to terms that still have pages. `capped` is true when
 * matching posts were left unfetched.
 */
async function collectAcrossTerms(
  terms: string[],
  max: number,
  filters: { since?: string; until?: string; fromUser?: string },
  limits: RunLimits,
) {
  const collected = new Map<string, AgentTweet>()
  const offsets = new Map<string, number | null>(terms.map((t) => [t, 0]))
  const open = () => terms.filter((term) => offsets.get(term) !== null)
  let dropped = false
  while (collected.size < max && open().length) {
    const active = open()
    const share = Math.max(1, Math.ceil((max - collected.size) / active.length))
    const results = await Promise.all(
      active.map(async (term) => {
        const tweets: AgentTweet[] = []
        let offset = offsets.get(term) ?? null
        while (offset !== null && tweets.length < share) {
          const page: { tweets: AgentTweet[]; nextOffset: number | null } =
            await searchTweets(
              {
                ...filters,
                query: term,
                limit: Math.min(PAGE, share - tweets.length),
                offset,
              },
              limits,
            )
          tweets.push(...page.tweets)
          offset = page.tweets.length ? page.nextOffset : null
        }
        offsets.set(term, offset)
        return tweets
      }),
    )
    // Interleave so an overlap between terms does not favour the first one.
    const longest = Math.max(0, ...results.map((tweets) => tweets.length))
    for (let i = 0; i < longest; i++) {
      for (const tweets of results) {
        const tweet = tweets[i]
        if (!tweet || collected.has(tweet.id)) continue
        if (collected.size < max) collected.set(tweet.id, tweet)
        else dropped = true
      }
    }
  }
  return { collected, capped: dropped || open().length > 0 }
}

export interface CollectAndScoreInput {
  terms: string[]
  criterion: string
  since?: string
  until?: string
  fromUser?: string
  maxTweets?: number
}

export async function collectAndScoreImpl(
  raw: CollectAndScoreInput,
  limits: RunLimits = {},
) {
  const input = present(raw)
  const terms = Array.from(
    new Set(input.terms.map((t) => t.trim()).filter(Boolean)),
  ).slice(0, 8)
  const max = Math.min(
    Math.max(input.maxTweets ?? DEFAULT_COLLECT, 1),
    MAX_COLLECT,
  )
  const { collected, capped } = await collectAcrossTerms(
    terms,
    max,
    {
      since: input.since,
      until: input.until,
      fromUser: input.fromUser,
    },
    limits,
  )
  const { scored, scorer, costUsd } = await scoreWithParents(
    input.criterion,
    Array.from(collected.values()),
    true,
    limits,
  )
  const kept = scored.filter((t) => t.p >= KEEP_THRESHOLD)
  const borderline = scored.filter(
    (t) => t.p >= BORDERLINE_THRESHOLD && t.p < KEEP_THRESHOLD,
  )
  return {
    terms,
    criterion: input.criterion,
    fromUser: input.fromUser ?? null,
    collected: collected.size,
    limit: max,
    capped,
    scored: scored.length,
    keptCount: kept.length,
    kept: kept.slice(0, MAX_KEPT_RETURNED),
    borderline: borderline.slice(0, MAX_BORDERLINE_RETURNED),
    scorer,
    costUsd,
  }
}

export interface ScoreTweetsInput {
  criterion: string
  tweetIds: string[]
  withParent?: boolean
}

export async function scoreTweetsImpl(
  input: ScoreTweetsInput,
  limits: RunLimits = {},
) {
  const tweets = await getTweetsByIds(input.tweetIds.slice(0, 100), limits)
  const result = await scoreWithParents(
    input.criterion,
    tweets,
    input.withParent ?? true,
    limits,
  )
  return { criterion: input.criterion, ...result }
}

export async function getThreadImpl(
  { tweetId }: { tweetId: string },
  limits: RunLimits = {},
) {
  const thread = await getTweetThread(tweetId, 80, limits)
  return thread ?? { notFound: true as const, tweetId }
}

export async function getQuotePostsImpl(
  {
    tweetId,
    limit,
  }: {
    tweetId: string
    limit?: number
  },
  limits: RunLimits = {},
) {
  const result = await getQuotePosts(
    tweetId,
    Math.min(limit ?? 25, 50),
    0,
    limits,
  )
  return { tweetId, ...result }
}

export async function getTweetsImpl(
  { tweetIds }: { tweetIds: string[] },
  limits: RunLimits = {},
) {
  const ids = tweetIds.slice(0, 100)
  // Small sets get full cards (counts, media); large sets use the batch lookup.
  const tweets =
    ids.length <= 30
      ? await getTweetDetails(ids, limits)
      : await getTweetsByIds(ids, limits)
  return { tweets }
}

export const AGENT_SEARCH_TOOL_EXECUTORS = {
  find_people: findPeopleImpl,
  search_tweets: searchTweetsImpl,
  collect_and_score: collectAndScoreImpl,
  score_tweets: scoreTweetsImpl,
  get_thread: getThreadImpl,
  get_quote_posts: getQuotePostsImpl,
  get_tweets: getTweetsImpl,
}

export type AgentSearchToolExecutors = typeof AGENT_SEARCH_TOOL_EXECUTORS
