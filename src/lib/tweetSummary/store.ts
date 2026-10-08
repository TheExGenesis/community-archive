import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { devLog } from '@/lib/devLog'
import {
  SUMMARY_MODEL,
  SUMMARY_PROMPT_VERSION,
  buildSummaryPrompt,
  hasGenreOpener,
  parseSummaryOutput,
  precheckEligibility,
  stripGenreOpener,
  titleCorrection,
  type GeneratedSummary,
  type SummaryOutcome,
} from './generation'
import type { TweetPageKind, TweetPageSubject } from './subject'

export interface TweetPageSummaryRow {
  subject_key: string
  kind: TweetPageKind
  tweet_ids: string[]
  eligible: boolean
  title: string | null
  description: string | null
  ineligible_reason: string | null
  model: string
  prompt_version: number
  generated_at: string
}

type SummaryDatabase = {
  public: {
    Tables: {
      tweet_page_summaries: {
        Row: TweetPageSummaryRow
        Insert: Omit<TweetPageSummaryRow, 'generated_at'>
        Update: Partial<TweetPageSummaryRow>
        Relationships: []
      }
    }
    Views: {}
    Functions: {}
  }
}

// The first visit streams in while this runs and unfurlers wait on it (both
// attempts share this budget), so keep it inside the page's maxDuration; a
// timeout shows the neutral fallback this time and retries on the next visit.
const GENERATION_BUDGET_MS = 15_000

function summaryClient(): SupabaseClient<SummaryDatabase> | null {
  try {
    return createServerServiceRoleClient() as unknown as SupabaseClient<SummaryDatabase>
  } catch {
    return null
  }
}

async function readStored(key: string): Promise<SummaryOutcome | null> {
  const client = summaryClient()
  if (!client) return null
  const { data, error } = await client
    .from('tweet_page_summaries')
    .select('*')
    .eq('subject_key', key)
    .eq('prompt_version', SUMMARY_PROMPT_VERSION)
    .maybeSingle()
  // A missing table (migration not applied yet) reads as "nothing stored".
  if (error || !data) return null
  return data.eligible && data.title && data.description
    ? { eligible: true, title: data.title, description: data.description }
    : { eligible: false, reason: data.ineligible_reason ?? 'model' }
}

async function store(subject: TweetPageSubject, outcome: SummaryOutcome) {
  const client = summaryClient()
  if (!client) return
  const { error } = await client.from('tweet_page_summaries').upsert({
    subject_key: subject.key,
    kind: subject.kind,
    tweet_ids: subject.chain.map((t) => t.tweet_id),
    eligible: outcome.eligible,
    title: outcome.eligible ? outcome.title : null,
    description: outcome.eligible ? outcome.description : null,
    ineligible_reason: outcome.eligible ? null : outcome.reason,
    model: SUMMARY_MODEL,
    prompt_version: SUMMARY_PROMPT_VERSION,
  })
  if (error) console.warn('Tweet summary was not stored:', error)
}

async function requestSummary(
  subject: TweetPageSubject,
  temperature: number,
  signal: AbortSignal,
  correction?: string,
): Promise<SummaryOutcome | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')
  const { system, user } = buildSummaryPrompt(subject)
  const response = await fetch(
    `${process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'}/chat/completions`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        max_tokens: 400,
        temperature,
        // Some routed providers ignore JSON mode; only use ones that honor it.
        provider: { require_parameters: true },
        // Left to reason, this model spends its whole budget thinking.
        reasoning: { enabled: false },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: correction ? `${user}\n\n${correction}` : user,
          },
        ],
      }),
      cache: 'no-store',
      signal,
    },
  )
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`)
  const body = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[]
  }
  const choice = body.choices?.[0]
  if (choice?.finish_reason !== 'stop' || !choice.message?.content) return null
  return parseSummaryOutput(choice.message.content)
}

/**
 * Stored outcome first; otherwise generate once and keep the result. Network
 * failures throw so the cache below does not pin a transient miss. A draft
 * that fails validation, or whose title frames instead of stating, gets one
 * retry; output that never validates is recorded as ineligible.
 */
async function loadOrGenerate(
  subject: TweetPageSubject,
): Promise<SummaryOutcome> {
  const stored = await readStored(subject.key)
  if (stored) return stored
  const signal = AbortSignal.timeout(GENERATION_BUDGET_MS)
  const first = await requestSummary(subject, 0.3, signal)
  let outcome: SummaryOutcome = first ?? {
    eligible: false,
    reason: 'invalid-output',
  }
  if (!first || (first.eligible && hasGenreOpener(first.title))) {
    const retry = await requestSummary(
      subject,
      0.7,
      signal,
      first?.eligible ? titleCorrection(first.title) : undefined,
    )
    if (retry?.eligible && !hasGenreOpener(retry.title)) outcome = retry
    else if (first?.eligible)
      outcome = { ...first, title: stripGenreOpener(first.title) }
    else if (retry)
      outcome = retry.eligible
        ? { ...retry, title: stripGenreOpener(retry.title) }
        : retry
  }
  devLog('Tweet summary generated', subject.key, outcome)
  await store(subject, outcome)
  return outcome
}

class GenerationSkipped extends Error {}

/**
 * One cache entry per subject, whoever asks. Without permission to generate,
 * a miss reads the stored row and otherwise throws, which leaves the entry
 * empty for the next person to fill.
 */
const cachedOutcome = (subject: TweetPageSubject, allowGeneration: boolean) =>
  unstable_cache(
    // Next keys this cache on the callback's source, so both modes must share
    // this one callback for a crawler to see what a person generated.
    async () => {
      if (allowGeneration) return loadOrGenerate(subject)
      const stored = await readStored(subject.key)
      if (stored) return stored
      throw new GenerationSkipped()
    },
    ['tweet-page-summary', `v${SUMMARY_PROMPT_VERSION}`, subject.key],
    { revalidate: false, tags: [`tweet-page-summary:${subject.key}`] },
  )()

/**
 * The summary, null when there is nothing to show, or 'missing' when no
 * outcome is stored yet and this caller may not generate one.
 */
async function lookUpSummary(
  subject: TweetPageSubject,
  allowGeneration: boolean,
): Promise<GeneratedSummary | null | 'missing'> {
  if (!precheckEligibility(subject).eligible) return null
  try {
    const outcome = await cachedOutcome(subject, allowGeneration)
    return outcome.eligible
      ? { title: outcome.title, description: outcome.description }
      : null
  } catch (error) {
    if (error instanceof GenerationSkipped) return 'missing'
    console.warn(
      'Tweet summary unavailable:',
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

/**
 * Generated title and description for a permalink page, or null when the
 * content is not substantive enough or generation is unavailable. Crawlers
 * (`allowGeneration: false`) only see summaries that already exist.
 */
export const getTweetPageSummary = cache(
  async (
    subject: TweetPageSubject,
    allowGeneration: boolean,
  ): Promise<GeneratedSummary | null> => {
    const summary = await lookUpSummary(subject, allowGeneration)
    return summary === 'missing' ? null : summary
  },
)

/** Stored outcome only, so it never waits on the model. */
export const getStoredTweetPageSummary = cache((subject: TweetPageSubject) =>
  lookUpSummary(subject, false),
)
