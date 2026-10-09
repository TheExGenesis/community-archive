import 'server-only'
import type { RunLimits } from './deadline'
import { getTweetDetails, getTweetsByIds } from './gateway'
import { collectRefs } from './history'
import type { AgentSearchRun, AgentTweet } from './types'

const DETAIL_BATCH = 30
const LOOKUP_BATCH = 100
// Gateway calls in flight at once, so a long conversation does not fire
// every lookup together.
const CONCURRENCY = 4
// The conversation route runs under the repository's 15 s function limit
// (vercel.json); finish, or fail with a clear error, before it.
const LOAD_BUDGET_MS = 12_000

/**
 * Fetches every tweet a conversation's stored answers refer to, through the
 * gateway (which applies opt-outs). Cited tweets get full cards; the rest use
 * the batch lookup, as the tools did. No call starts after the time budget,
 * and each call's timeout is cut to what is left.
 */
export async function loadConversationTweets(
  runs: AgentSearchRun[],
  limits: RunLimits = { deadlineAt: Date.now() + LOAD_BUDGET_MS },
): Promise<Map<string, AgentTweet>> {
  const all = new Set<string>()
  for (const run of runs) collectRefs(run.parts ?? [], all)
  const cited = new Set(
    runs.flatMap((run) => run.citedTweetIds).filter((id) => all.has(id)),
  )
  const rest = Array.from(all).filter((id) => !cited.has(id))
  const citedIds = Array.from(cited)

  const batches: Array<() => Promise<AgentTweet[]>> = []
  for (let i = 0; i < citedIds.length; i += DETAIL_BATCH) {
    const ids = citedIds.slice(i, i + DETAIL_BATCH)
    batches.push(() => getTweetDetails(ids, limits))
  }
  for (let i = 0; i < rest.length; i += LOOKUP_BATCH) {
    const ids = rest.slice(i, i + LOOKUP_BATCH)
    batches.push(() => getTweetsByIds(ids, limits))
  }

  const tweets = new Map<string, AgentTweet>()
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      for (const tweet of await batches[next++]()) tweets.set(tweet.id, tweet)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker),
  )
  return tweets
}
