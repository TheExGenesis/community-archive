import { scoreTweets } from './classifier'
import type { RunLimits } from './deadline'
import {
  findMembers,
  getInteractionTies,
  getInteractions,
  getQuotePosts,
  getTweetDetails,
  getTweetThread,
  getTweetsByIds,
  getUser,
  searchTweets,
  type SearchMode,
  type SearchSort,
} from './gateway'
import {
  SEMANTIC_LIMIT_MESSAGE,
  semanticSearch,
  type SemanticSearchInput,
} from './semantic'
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
// Searches one command keeps in flight. The gateway answers 503 "Search is
// busy" when one caller sends more at once (seen with 7 on 2026-11-02).
export const SEARCH_CONCURRENCY = 3
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
      ? getUser(handle, limits).then(withheldUnlessAllowed)
      : Promise.resolve(null),
  ])
  return { query, members, user }
}

/**
 * The gateway's user lookup also serves accounts outside the member directory,
 * including opted-out and scrape-blocked ones; the directory hides those, so
 * only the policy check keeps their bio and top tweets from the agent. A
 * failed check withholds the account too.
 */
async function withheldUnlessAllowed<
  T extends { accountId: string; username: string },
>(user: T | null): Promise<T | null> {
  if (!user) return null
  // Loaded at call time: the policy module reaches the Supabase client (and
  // through it next/server and CommonJS node-fetch), which the Workflow
  // sandbox bundle cannot evaluate at its top level. Steps run in Node, where
  // this import is fine.
  const { isPolicyBlockedAccount } = await import('./policy')
  const blocked = await isPolicyBlockedAccount(
    user.accountId,
    user.username,
  ).catch(() => true)
  return blocked ? null : user
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

export async function scoreWithParents(
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

/** Runs `run` over every item, `concurrency` at a time, keeping order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await run(items[i])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  )
  return results
}

/**
 * Pages through every term, SEARCH_CONCURRENCY at a time, giving each an
 * equal share of the limit, so the first term cannot use it all. Shares left
 * unused by terms that run out pass to terms that still have pages. All terms
 * finish before anything is returned, so the agent gets one combined result.
 * `capped` is true when matching posts were left unfetched.
 */
export async function collectAcrossTerms(
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
    const results = await mapWithConcurrency(
      active,
      SEARCH_CONCURRENCY,
      async (term) => {
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
      },
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

export async function semanticSearchImpl(
  raw: SemanticSearchInput,
  limits: RunLimits = {},
): Promise<
  | Awaited<ReturnType<typeof semanticSearch>>
  | { query: string; limitReached: true; message: string; tweets: [] }
> {
  const input = present(raw)
  return semanticSearch(input, limits)
}

const POLICY_CHECK_CONCURRENCY = 8

/**
 * Account IDs PostgreSQL policy withholds (opt-out or scrape block), as for
 * find_people. A failed check withholds the account too. Accounts without a
 * known handle are not checked; callers drop them, since the agent cannot
 * name them anyway.
 */
export async function withheldAccountIds(
  accounts: Array<{ id: string; username: string | null }>,
): Promise<Set<string>> {
  const unique = Array.from(
    new Map(
      accounts
        .filter((entry) => entry.username)
        .map((entry) => [entry.id, entry.username as string]),
    ),
  )
  if (!unique.length) return new Set()
  const { isPolicyBlockedAccount } = await import('./policy')
  const withheld = new Set<string>()
  for (let i = 0; i < unique.length; i += POLICY_CHECK_CONCURRENCY) {
    await Promise.all(
      unique
        .slice(i, i + POLICY_CHECK_CONCURRENCY)
        .map(async ([id, username]) => {
          const blocked = await isPolicyBlockedAccount(id, username).catch(
            () => true,
          )
          if (blocked) withheld.add(id)
        }),
    )
  }
  return withheld
}

export interface InteractionsToolInput {
  account: string
  other?: string
  since?: string
  until?: string
  limit?: number
}

/**
 * Who an account was in conversation with, and when (replies, mentions and
 * quotes, by month, both directions), or with `other` the monthly timeline
 * between two accounts. Withheld and unnamed accounts are left out.
 */
export async function interactionsImpl(
  raw: InteractionsToolInput,
  limits: RunLimits = {},
) {
  const input = present(raw)
  const notFound = {
    notFound: true as const,
    account: input.account,
    other: input.other ?? null,
  }
  const result = await getInteractions(
    {
      a: input.account,
      b: input.other,
      since: input.since,
      until: input.until,
      limit: input.limit,
    },
    limits,
  )
  if (!result) return notFound
  if ('b' in result) {
    const withheld = await withheldAccountIds([result.a, result.b])
    if (withheld.has(result.a.id) || withheld.has(result.b.id)) return notFound
    return result
  }
  const withheld = await withheldAccountIds([result.a, ...result.peers])
  if (withheld.has(result.a.id)) return notFound
  const peers = result.peers.filter(
    (peer) => peer.username && !withheld.has(peer.id),
  )
  return { ...result, peers, omitted: result.peers.length - peers.length }
}

export interface InteractionTiesToolInput {
  accounts: string[]
  before: string
  months?: number
  peers?: number
}

/**
 * For each account, its back-and-forth ties (a reply, mention or quote each
 * way) in the months before `before`, and how many were with CA members.
 */
export async function interactionTiesImpl(
  raw: InteractionTiesToolInput,
  limits: RunLimits = {},
) {
  const input = present(raw)
  const result = await getInteractionTies(input, limits)
  const withheld = await withheldAccountIds(
    result.accounts.flatMap((entry) => [
      ...(entry.account ? [entry.account] : []),
      ...(entry.topMutual ?? []),
    ]),
  )
  return {
    ...result,
    accounts: result.accounts.map((entry) =>
      !entry.account || withheld.has(entry.account.id)
        ? { input: entry.input, account: null, error: 'not_found' as const }
        : {
            ...entry,
            topMutual: (entry.topMutual ?? []).filter(
              (peer) => peer.username && !withheld.has(peer.id),
            ),
          },
    ),
  }
}

/** What the typed tool returns once a question has used its semantic searches. */
export const semanticLimitReached = (query: string) => ({
  query,
  limitReached: true as const,
  message: SEMANTIC_LIMIT_MESSAGE,
  tweets: [] as [],
})

export const AGENT_SEARCH_TOOL_EXECUTORS = {
  find_people: findPeopleImpl,
  search_tweets: searchTweetsImpl,
  collect_and_score: collectAndScoreImpl,
  score_tweets: scoreTweetsImpl,
  get_thread: getThreadImpl,
  get_quote_posts: getQuotePostsImpl,
  get_tweets: getTweetsImpl,
  semantic_search: semanticSearchImpl,
  get_interactions: interactionsImpl,
  get_interaction_ties: interactionTiesImpl,
}

export type AgentSearchToolExecutors = typeof AGENT_SEARCH_TOOL_EXECUTORS
