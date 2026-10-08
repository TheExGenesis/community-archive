import 'server-only'
import { getTweetDetails, getTweetsByIds } from './gateway'
import { collectRefs } from './history'
import type { AgentSearchRun, AgentTweet } from './types'

const DETAIL_BATCH = 30
const LOOKUP_BATCH = 100

/**
 * Fetches every tweet a conversation's stored answers refer to, through the
 * gateway (which applies opt-outs). Cited tweets get full cards; the rest use
 * the batch lookup, as the tools did.
 */
export async function loadConversationTweets(
  runs: AgentSearchRun[],
): Promise<Map<string, AgentTweet>> {
  const all = new Set<string>()
  for (const run of runs) collectRefs(run.parts ?? [], all)
  const cited = new Set(
    runs.flatMap((run) => run.citedTweetIds).filter((id) => all.has(id)),
  )
  const rest = Array.from(all).filter((id) => !cited.has(id))
  const citedIds = Array.from(cited)

  const batches: Array<Promise<AgentTweet[]>> = []
  for (let i = 0; i < citedIds.length; i += DETAIL_BATCH)
    batches.push(getTweetDetails(citedIds.slice(i, i + DETAIL_BATCH)))
  for (let i = 0; i < rest.length; i += LOOKUP_BATCH)
    batches.push(getTweetsByIds(rest.slice(i, i + LOOKUP_BATCH)))

  const tweets = new Map<string, AgentTweet>()
  for (const batch of await Promise.all(batches))
    for (const tweet of batch) tweets.set(tweet.id, tweet)
  return tweets
}
