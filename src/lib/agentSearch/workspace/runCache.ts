import type { AgentTweet } from '../types'

// Ephemeral in-process tweet cache scoped to a single Ask run (runId).
//
// Each bash step runs in a fresh just-bash VM and rebuilds tweet files from
// the manifest's id list. Without a per-run cache, every subsequent jq or
// score step re-fetches 100-id batches from the gateway (measured at ~51% of
// all gateway HTTP calls across logged runs). Keeping hydrated rows in memory
// for the active run eliminates those redundant lookups across inline steps on
// the same Fluid Compute instance while:
// - never writing tweet text to the Workflow event log or Supabase,
// - starting fresh on every new question / follow-up (so opt-outs take effect),
// - falling back cleanly to the gateway if a step runs on another worker.

const STORE_KEY = Symbol.for('community-archive.agentSearch.runTweetCache')
export const MAX_CACHED_RUNS = 32
export const MAX_TWEETS_PER_RUN = 10_000
export const RUN_CACHE_TTL_MS = 10 * 60 * 1000

interface CacheEntry {
  tweets: Map<string, AgentTweet>
  touchedAt: number
}

type CacheHolder = { [STORE_KEY]?: Map<string, CacheEntry> }

/** Map capped at `maxSize` entries; evicts the oldest entry when full. */
export class BoundedTweetMap extends Map<string, AgentTweet> {
  constructor(readonly maxSize = MAX_TWEETS_PER_RUN) {
    super()
  }

  override set(id: string, tweet: AgentTweet): this {
    if (!this.has(id) && this.size >= this.maxSize) {
      const oldest = this.keys().next().value
      if (oldest !== undefined) this.delete(oldest)
    }
    return super.set(id, tweet)
  }
}

function store(): Map<string, CacheEntry> {
  const holder = globalThis as CacheHolder
  holder[STORE_KEY] ??= new Map()
  return holder[STORE_KEY]
}

function prune(now: number) {
  const entries = store()
  entries.forEach((entry, id) => {
    if (now - entry.touchedAt >= RUN_CACHE_TTL_MS) entries.delete(id)
  })
  while (entries.size > MAX_CACHED_RUNS) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }
}

/** Returns the live per-run tweet cache, creating or refreshing its LRU entry. */
export function getRunTweetCache(
  runId: string,
  now = Date.now(),
): Map<string, AgentTweet> {
  prune(now)
  const entries = store()
  const existing = entries.get(runId)
  if (existing) {
    // Refresh insertion order for LRU eviction.
    entries.delete(runId)
    existing.touchedAt = now
    entries.set(runId, existing)
    return existing.tweets
  }
  const entry: CacheEntry = {
    tweets: new BoundedTweetMap(MAX_TWEETS_PER_RUN),
    touchedAt: now,
  }
  entries.set(runId, entry)
  prune(now)
  return entry.tweets
}

/** Drops a finished or cancelled run's cached tweets immediately. */
export function clearRunTweetCache(runId: string) {
  store().delete(runId)
}

/** Test helper: clears every cached run. */
export function clearAllRunTweetCaches() {
  store().clear()
}
