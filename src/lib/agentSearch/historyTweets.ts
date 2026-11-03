import 'server-only'
import type { RunLimits } from './deadline'
import { getTweetDetails, getTweetsByIds } from './gateway'
import {
  CITATION_PATTERN,
  QUOTE_PATTERN,
  collectWorkspaceFiles,
  extractCitationIds,
} from './citations'
import { collectRefs } from './history'
import type { AgentSearchRun, AgentTweet } from './types'

const DETAIL_BATCH = 30
const LOOKUP_BATCH = 100
// Gateway calls in flight at once, so a long conversation does not fire
// every lookup together.
const CONCURRENCY = 4
// The conversation routes run under the repository's 15 s function limit
// (vercel.json); finish, or fail with a clear error, before it.
export const LOAD_BUDGET_MS = 12_000
/** Ids the tweets route takes per request: one lookup, or a few card batches. */
export const MAX_TWEET_IDS_PER_REQUEST = 100

/**
 * The tweets a conversation's stored answers refer to, in the order the
 * page needs them: cited in the prose first (chips and quotes), then shown
 * in the answers' post lists, then everything else the tools returned.
 */
export interface ConversationTweetIds {
  cited: string[]
  listed: string[]
  rest: string[]
}

type LooseRecord = Record<string, unknown>

const isRecord = (value: unknown): value is LooseRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** The outputs of a run's finished tool calls, for the files they wrote. */
function toolOutputs(parts: unknown): unknown[] {
  if (!Array.isArray(parts)) return []
  return parts.flatMap((part) =>
    isRecord(part) && part.state === 'output-available' ? [part.output] : [],
  )
}

export function conversationTweetIds(
  runs: AgentSearchRun[],
): ConversationTweetIds {
  const all = new Set<string>()
  for (const run of runs) collectRefs(run.parts ?? [], all)
  // Lists name workspace files; a later turn's write of a path wins, as on
  // the page.
  const files = collectWorkspaceFiles(
    runs.flatMap((run) => toolOutputs(run.parts)),
  )
  const placed = new Set<string>()
  const cited: string[] = []
  const listed: string[] = []
  const place = (list: string[], id: string) => {
    if (!all.has(id) || placed.has(id)) return
    placed.add(id)
    list.push(id)
  }
  for (const run of runs) {
    for (const id of chipIds(run.answer ?? '')) place(cited, id)
  }
  for (const run of runs) {
    for (const id of extractCitationIds(run.answer ?? '', files)) {
      place(listed, id)
    }
  }
  const rest = Array.from(all).filter((id) => !placed.has(id))
  return { cited, listed, rest }
}

export interface FetchedTweets {
  /** What the gateway returned; an id left out is gone (deleted, opted out). */
  tweets: Map<string, AgentTweet>
  /** Ids whose batch failed or ran out of time, so nothing is known yet. */
  failed: string[]
}

/**
 * Fetches tweets by id through the gateway (which applies opt-outs). Ids in
 * `cited` get full cards (counts, media, quoted tweet); the rest, often
 * hundreds of listed tweets shown as rows, use the lighter batch lookup, as
 * the tools did. No call starts after the time budget, and each call's
 * timeout is cut to what is left.
 */
export async function fetchConversationTweets(
  ids: string[],
  cited: ReadonlySet<string>,
  limits: RunLimits = { deadlineAt: Date.now() + LOAD_BUDGET_MS },
): Promise<FetchedTweets> {
  const unique = Array.from(new Set(ids))
  const detailIds = unique.filter((id) => cited.has(id))
  const lookupIds = unique.filter((id) => !cited.has(id))

  const batches: Array<{ ids: string[]; fetch: () => Promise<AgentTweet[]> }> =
    []
  for (let i = 0; i < detailIds.length; i += DETAIL_BATCH) {
    const batch = detailIds.slice(i, i + DETAIL_BATCH)
    batches.push({ ids: batch, fetch: () => getTweetDetails(batch, limits) })
  }
  for (let i = 0; i < lookupIds.length; i += LOOKUP_BATCH) {
    const batch = lookupIds.slice(i, i + LOOKUP_BATCH)
    batches.push({ ids: batch, fetch: () => getTweetsByIds(batch, limits) })
  }

  const tweets = new Map<string, AgentTweet>()
  const failed: string[] = []
  let next = 0
  // A batch that fails or runs out of time is reported, not thrown: the
  // caller shows what came back and can ask again for the rest.
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]
      try {
        for (const tweet of await batch.fetch()) tweets.set(tweet.id, tweet)
      } catch (error) {
        console.warn('[agent-search] history tweets batch failed', error)
        failed.push(...batch.ids)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker),
  )
  return { tweets, failed }
}

/**
 * Every tweet a conversation's stored answers refer to that the gateway
 * still returns, for the follow-up context (context.ts), which needs them
 * all before the model runs.
 */
export async function loadConversationTweets(
  runs: AgentSearchRun[],
  limits: RunLimits = { deadlineAt: Date.now() + LOAD_BUDGET_MS },
): Promise<Map<string, AgentTweet>> {
  const ids = conversationTweetIds(runs)
  const { tweets } = await fetchConversationTweets(
    [...ids.cited, ...ids.listed, ...ids.rest],
    new Set(ids.cited),
    limits,
  )
  return tweets
}

/** Ids the answer cites with a chip or quotes, not those in its lists. */
function chipIds(answer: string): string[] {
  return [
    ...Array.from(answer.matchAll(new RegExp(CITATION_PATTERN.source, 'g'))),
    ...Array.from(answer.matchAll(new RegExp(QUOTE_PATTERN.source, 'g'))),
  ]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((match) => match[1])
}
