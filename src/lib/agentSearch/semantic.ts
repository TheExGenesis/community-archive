import { callTimeoutMs, type RunLimits } from './deadline'
import { getTweetsByIds } from './gateway'
import type { AgentTweet } from './types'

// Semantic search over the archive through the project's own embeddings API
// (Qwen3-Embedding-4B over tweet text). It finds tweets that say something in
// other words, which keyword search cannot. Its opt-out handling and index
// freshness are not confirmed, so its returned text is never used: only the
// ids, re-fetched through the gateway, which applies opt-outs. The API's
// order and distance (higher is closer) are kept.

export const DEFAULT_SEMANTIC_SEARCH_URL =
  'https://embed.tweetstack.app/embeddings/search'
const USER_AGENT =
  'CommunityArchive-AskTheArchive/1.0 (+https://www.community-archive.org)'
// Measured at about 1 s per call, 2–5 s for a filter on a prolific member
// or under concurrent load (2026-10-14); allow for a slow one, within the
// run's deadline.
const SEMANTIC_TIMEOUT_MS = 20_000
export const SEMANTIC_DEFAULT_K = 50
const MAX_K = 1000
export const SEMANTIC_DEFAULT_THRESHOLD = 0.65
/** Semantic searches one question may run. */
// At 1–5 s each, 6 calls stay within about a tenth of the run deadline and
// leave most of the 20 steps for keyword search, reading and scoring.
export const MAX_SEMANTIC_CALLS_PER_RUN = 6
export const SEMANTIC_LIMIT_MESSAGE = `This question has used its ${MAX_SEMANTIC_CALLS_PER_RUN} semantic searches; use keyword search instead.`

const TWEET_ID = /^\d{1,20}$/

export interface SemanticSearchInput {
  query: string
  fromUser?: string
  k?: number
  threshold?: number
}

export type SemanticTweet = AgentTweet & { distance: number }

export function semanticSearchUrl(env: NodeJS.ProcessEnv = process.env) {
  return env.SEMANTIC_SEARCH_URL?.trim() || DEFAULT_SEMANTIC_SEARCH_URL
}

/** Aborts when either signal does. */
function either(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController()
  for (const signal of [a, b]) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', () => controller.abort(signal.reason))
  }
  return controller.signal
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export async function semanticSearch(
  input: SemanticSearchInput,
  limits: RunLimits = {},
  fetchImpl: typeof fetch = fetch,
): Promise<{ query: string; tweets: SemanticTweet[]; matched: number }> {
  const query = input.query.trim()
  if (!query) throw new Error('Semantic search needs a query')
  const handle = input.fromUser?.trim().replace(/^@/, '')
  const body = {
    searchTerm: query,
    k: clamp(Math.round(input.k ?? SEMANTIC_DEFAULT_K), 1, MAX_K),
    threshold: clamp(input.threshold ?? SEMANTIC_DEFAULT_THRESHOLD, 0, 1),
    // Only ids and distances are used, and text-free results are about four
    // times cheaper for the API to gate.
    with_payload: false,
    ...(handle
      ? { filter: { must: [{ key: 'username', match: { value: handle } }] } }
      : {}),
  }
  const timeout = AbortSignal.timeout(
    callTimeoutMs(limits, SEMANTIC_TIMEOUT_MS),
  )
  const signal = limits.abortSignal
    ? either(timeout, limits.abortSignal)
    : timeout
  const response = await fetchImpl(semanticSearchUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    throw new Error(`Semantic search failed: HTTP ${response.status}`)
  }
  const payload = (await response.json()) as {
    success?: unknown
    results?: Array<{ key?: unknown; distance?: unknown }>
  }
  if (payload.success === false || !Array.isArray(payload.results)) {
    throw new Error('Semantic search returned an invalid payload')
  }
  const ranked: Array<{ id: string; distance: number }> = []
  for (const result of payload.results) {
    const id = String(result?.key ?? '')
    if (!TWEET_ID.test(id) || ranked.some((r) => r.id === id)) continue
    const distance = typeof result.distance === 'number' ? result.distance : 0
    ranked.push({ id, distance: Math.round(distance * 1000) / 1000 })
  }
  const byId = new Map<string, AgentTweet>()
  for (let i = 0; i < ranked.length; i += 100) {
    const batch = await getTweetsByIds(
      ranked.slice(i, i + 100).map((r) => r.id),
      limits,
    )
    for (const tweet of batch) byId.set(tweet.id, tweet)
  }
  const tweets = ranked.flatMap(({ id, distance }) => {
    const tweet = byId.get(id)
    return tweet ? [{ ...tweet, distance }] : []
  })
  return { query, tweets, matched: ranked.length }
}
