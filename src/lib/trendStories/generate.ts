import type { PortalTweet, TermWeek } from '@/lib/portal/types'
import {
  TREND_STORY_JSON_SCHEMA,
  TREND_STORY_SYSTEM_PROMPT,
  buildTrendStoryPrompt,
  indexEvidence,
  parseTrendStoryOutput,
  trendDateForTerms,
  type TrendStory,
} from './core'

export const DEFAULT_TREND_STORY_MODEL = 'moonshotai/kimi-k3'

export interface TrendModelCall {
  (request: {
    model: string
    system: string
    user: string
  }): Promise<{ output: unknown; model: string }>
}

/** One OpenRouter structured-output call, with the digest's privacy settings. */
export const callOpenRouterJson: TrendModelCall = async ({
  model,
  system,
  user,
}) => {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')
  const baseUrl = (
    process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1'
  ).replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://community-archive.org',
      'X-Title': 'Community Archive Trend Stories',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      provider: { data_collection: 'deny', zdr: true },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'community_archive_trend_stories',
          strict: true,
          schema: TREND_STORY_JSON_SCHEMA,
        },
      },
      max_tokens: 6_000,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(180_000),
  })
  const body = await response.text()
  if (!response.ok)
    throw new Error(
      `OpenRouter trend stories failed (${response.status}): ${body.slice(0, 400)}`,
    )
  const payload = JSON.parse(body) as {
    model?: string
    choices?: Array<{
      finish_reason?: unknown
      native_finish_reason?: unknown
      message?: { content?: unknown }
    }>
  }
  const choice = payload.choices?.[0]
  const content = choice?.message?.content
  if (typeof content !== 'string' || !content.trim())
    throw new Error(
      `OpenRouter trend stories returned no content (finish ${String(choice?.native_finish_reason ?? choice?.finish_reason ?? 'unknown')})`,
    )
  const json = content.replace(/^```(?:json)?\s*|\s*```$/g, '')
  return { output: JSON.parse(json), model: payload.model ?? model }
}

export async function generateTrendStories(input: {
  terms: TermWeek[]
  fetchEvidence: (term: TermWeek) => Promise<PortalTweet[]>
  callModel?: TrendModelCall
  model?: string
  now?: Date
  attempts?: number
}): Promise<TrendStory[]> {
  const trendDate = trendDateForTerms(input.terms)
  if (!trendDate || !input.terms[0]?.sinceDate)
    throw new Error('Trending terms do not share one dated window')
  const evidence = new Map<string, PortalTweet[]>()
  // The gateway serializes cold evidence searches; keep requests ordered.
  for (const term of input.terms)
    evidence.set(term.term, await input.fetchEvidence(term))
  const indexed = indexEvidence(
    input.terms.map((term) => term.term),
    evidence,
  )
  const user = buildTrendStoryPrompt(input.terms, indexed)
  const call = input.callModel ?? callOpenRouterJson
  const model = input.model ?? DEFAULT_TREND_STORY_MODEL
  let lastError: unknown
  for (let attempt = 0; attempt < (input.attempts ?? 3); attempt++) {
    try {
      const result = await call({
        model,
        system: TREND_STORY_SYSTEM_PROMPT,
        user:
          attempt && lastError instanceof Error
            ? `${user}\n\nYour previous answer was rejected: ${lastError.message}. Fix it.`
            : user,
      })
      return parseTrendStoryOutput(result.output, {
        trendDate,
        terms: input.terms,
        tweets: indexed.tweets,
        model: result.model,
        generatedAt: (input.now ?? new Date()).toISOString(),
      })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
