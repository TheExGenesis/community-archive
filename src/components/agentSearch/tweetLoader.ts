import type { AgentTweet } from '@/lib/agentSearch/types'
import type { TweetLoad } from './messageView'

// A reopened conversation arrives with its tweets as references and a list
// of ids to fetch, cited ones first. This fetches them in batches through the
// tweets route and reports each batch as it lands, so the page fills the
// answer in from the top. A batch that fails is tried again a few times,
// spaced out; after that its tweets are marked failed until the reader asks
// again.

/** Ids in the first request: small, so the cited tweets land first. */
export const FIRST_BATCH = 30
/** Ids per request after that (the route's limit). */
export const BATCH = 100
const IN_FLIGHT = 3
const ATTEMPTS = 3
const BACKOFF_MS = [500, 2_000]

export interface BatchResult {
  tweets: AgentTweet[]
  /** Ids the server could not fetch this time (a gateway batch failed). */
  failed: string[]
}

/** A refused request; a 4xx is not tried again. */
export class TweetRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Tweets request failed: ${status}`)
    this.name = 'TweetRequestError'
  }
}

export interface TweetLoaderOptions {
  fetchBatch: (ids: string[], signal: AbortSignal) => Promise<BatchResult>
  /**
   * Each batch as it lands: the tweets now in hand, and the ids whose state
   * changed (failed, gone, or loading again after a retry).
   */
  onBatch: (tweets: AgentTweet[], states: Map<string, TweetLoad>) => void
  sleep?: (ms: number) => Promise<void>
  firstBatch?: number
  batch?: number
  inFlight?: number
  attempts?: number
}

export interface TweetLoader {
  /** Queues ids in the order given and starts fetching. */
  load(ids: string[]): void
  /** Queues the ids whose fetches failed, from the first attempt again. */
  retry(): void
  /** Ends it: nothing more is fetched or reported. */
  stop(): void
}

interface Job {
  ids: string[]
  attempt: number
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createTweetLoader(options: TweetLoaderOptions): TweetLoader {
  const {
    fetchBatch,
    onBatch,
    sleep = defaultSleep,
    firstBatch = FIRST_BATCH,
    batch = BATCH,
    inFlight: maxInFlight = IN_FLIGHT,
    attempts = ATTEMPTS,
  } = options
  const controller = new AbortController()
  const queue: Job[] = []
  const failed = new Set<string>()
  let inFlight = 0
  let stopped = false

  const report = (tweets: AgentTweet[], states: Map<string, TweetLoad>) => {
    if (!stopped && (tweets.length || states.size)) onBatch(tweets, states)
  }

  const giveUp = (ids: string[]) => {
    for (const id of ids) failed.add(id)
    report([], new Map(ids.map((id) => [id, 'failed' as const])))
  }

  // A failed batch waits before its next attempt; the slot goes to the next
  // batch meanwhile, so one slow batch does not hold up the rest.
  const again = async (job: Job) => {
    if (job.attempt + 1 >= attempts) {
      giveUp(job.ids)
      return
    }
    await sleep(BACKOFF_MS[Math.min(job.attempt, BACKOFF_MS.length - 1)])
    if (stopped) return
    queue.unshift({ ids: job.ids, attempt: job.attempt + 1 })
    pump()
  }

  const run = async (job: Job) => {
    let result: BatchResult
    try {
      result = await fetchBatch(job.ids, controller.signal)
    } catch (error) {
      if (stopped) return
      if (error instanceof TweetRequestError && error.status < 500) {
        giveUp(job.ids)
      } else {
        void again(job)
      }
      return
    }
    if (stopped) return
    const have = new Set(result.tweets.map((tweet) => tweet.id))
    const retryable = new Set(result.failed)
    const states = new Map<string, TweetLoad>()
    // Asked for, not failed, not returned: the gateway has nothing for it.
    for (const id of job.ids) {
      if (!have.has(id) && !retryable.has(id)) states.set(id, 'unavailable')
    }
    report(result.tweets, states)
    const left = job.ids.filter((id) => retryable.has(id))
    if (left.length) void again({ ids: left, attempt: job.attempt })
  }

  const pump = () => {
    while (!stopped && inFlight < maxInFlight && queue.length) {
      const job = queue.shift() as Job
      inFlight += 1
      void run(job).finally(() => {
        inFlight -= 1
        pump()
      })
    }
  }

  const enqueue = (ids: string[]) => {
    const unique = Array.from(new Set(ids))
    let at = 0
    while (at < unique.length) {
      const size = at === 0 && queue.length === 0 ? firstBatch : batch
      queue.push({ ids: unique.slice(at, at + size), attempt: 0 })
      at += size
    }
    pump()
  }

  return {
    load(ids) {
      if (!stopped && ids.length) enqueue(ids)
    },
    retry() {
      if (stopped || !failed.size) return
      const ids = Array.from(failed)
      failed.clear()
      report([], new Map(ids.map((id) => [id, 'loading' as const])))
      enqueue(ids)
    },
    stop() {
      stopped = true
      queue.length = 0
      controller.abort()
    },
  }
}
