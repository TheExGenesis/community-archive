import 'server-only'
import type { MapAnnotation } from './types'

export const AI_QUERY =
  'Artificial intelligence: AI progress, language models, AGI, AI safety, alignment, and how AI changes society'

/** Retrieval supplies IDs only. Displayed sources stay in the policy-filtered map. */
export async function findAiStrand(year: number): Promise<Set<string>> {
  const base = process.env.CONVERSATION_MAP_VECTOR_URL
  if (!base) throw new Error('Conversation map vector search is not configured')
  const response = await fetch(new URL('/embeddings/search', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchTerm: AI_QUERY,
      k: 200,
      threshold: 0.45,
      with_payload: false,
      with_vector: false,
      filter: {
        must: [
          {
            key: 'created_at',
            range: {
              gte: `${year}-01-01T00:00:00Z`,
              lt: `${year + 1}-01-01T00:00:00Z`,
            },
          },
        ],
      },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`Vector search failed (${response.status})`)
  const result = await response.json()
  if (
    result.success !== true ||
    !Array.isArray(result.results) ||
    result.results.some(
      (row: { key?: unknown }) =>
        !row || typeof row.key !== 'string' || !/^\d{1,20}$/.test(row.key),
    )
  ) {
    throw new Error('Vector search returned an invalid response')
  }
  return new Set(
    result.results.slice(0, 200).map((row: { key: string }) => row.key),
  )
}

export function markAiStrand(annotations: MapAnnotation[], ids: Set<string>) {
  const aiTerms =
    /\b(?:AI|AGI|LLMs?|GPT(?:-?\d)?|ChatGPT|OpenAI|Anthropic|Claude|DeepSeek|artificial intelligence|language models?)\b/i
  return annotations.map((annotation) => ({
    ...annotation,
    // Groups can contain unrelated sources. Highlight only wholly matched groups.
    strand: annotation.tweets.every(
      (tweet) => ids.has(tweet.id) || aiTerms.test(tweet.text),
    )
      ? ('ai' as const)
      : undefined,
  }))
}
