import type { TweetData } from '@/components/TweetComponent'
import { fetchClickHouseQuotePosts } from '@/lib/clickhouseQuotePosts'
import { fetchDigestReplies } from '@/lib/digest/context'
import { mapDigestRun, mapPromptVersion, toJson } from '@/lib/digest/data'
import { createDigestAdminClient } from '@/lib/digest/database'
import {
  assembleDigestEditionContent,
  renderDigestPrompt,
  type EnrichedDigestCandidate,
} from '@/lib/digest/generation'
import { generateDigestWithModel } from '@/lib/digest/openai'
import type { DigestRunEvent } from '@/lib/digest/types'
import type { PortalTweet } from '@/lib/portal/types'
import { createServerServiceRoleClient } from '@/utils/supabase'

const event = (
  stage: DigestRunEvent['stage'],
  status: DigestRunEvent['status'],
  message: string,
  metadata?: DigestRunEvent['metadata'],
): DigestRunEvent => ({
  at: new Date().toISOString(),
  stage,
  status,
  message,
  ...(metadata ? { metadata } : {}),
})

const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

const quoteTweetToPortalTweet = (
  tweet: TweetData,
  banger: PortalTweet,
): PortalTweet => ({
  id: tweet.tweet_id,
  accountId: tweet.account_id,
  username: tweet.username,
  name: tweet.account_display_name,
  avatar: tweet.avatar_media_url ?? null,
  text: tweet.full_text,
  observedAt: tweet.created_at,
  createdAt: tweet.created_at,
  likes: Math.max(0, tweet.favorite_count ?? 0),
  rts: Math.max(0, tweet.retweet_count ?? 0),
  media: (tweet.media ?? []).map((media) => ({
    url: media.media_url,
    type: media.media_type,
    ...(media.width ? { width: media.width } : {}),
    ...(media.height ? { height: media.height } : {}),
  })),
  quotedTweet: {
    id: banger.id,
    accountId: banger.accountId,
    username: banger.username,
    name: banger.name,
    avatar: banger.avatar,
    text: banger.text,
    createdAt: banger.createdAt,
    likes: banger.likes,
    rts: banger.rts,
    media: banger.media ?? [],
  },
})

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let index = 0; index < values.length; index += concurrency) {
    results.push(
      ...(await Promise.all(
        values.slice(index, index + concurrency).map(worker),
      )),
    )
  }
  return results
}

async function executeDigestGeneration(runId: string) {
  'use step'

  const admin = createDigestAdminClient()
  const { data: runRow, error: runError } = await admin
    .from('digest_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  if (runError || !runRow) throw new Error('Digest run not found')

  const run = mapDigestRun(runRow)
  if (run.status === 'completed') return
  if (run.status !== 'running') {
    throw new Error(`Digest run is not queued: ${run.status}`)
  }

  const selected = run.candidates.filter(({ selected }) => selected)
  if (selected.length < 3) {
    throw new Error('Select at least three bangers first')
  }

  const { data: promptRow, error: promptError } = await admin
    .from('digest_prompt_versions')
    .select('*')
    .eq('id', run.promptVersionId)
    .maybeSingle()
  if (promptError || !promptRow) throw new Error('Prompt version not found')

  const prompt = mapPromptVersion(promptRow)
  const startedAt = run.startedAt ? new Date(run.startedAt) : new Date()
  let events: DigestRunEvent[] = [
    ...run.events,
    event(
      'commentary',
      'started',
      'Fetching archived replies and quote-post commentary.',
    ),
  ]
  await admin
    .from('digest_runs')
    .update({
      events: toJson(events),
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('status', 'running')

  const contextClient = createServerServiceRoleClient()
  const windowStartMs = Date.parse(run.windowStart)
  const windowEndMs = Date.parse(run.windowEnd)
  const contextResults = await mapWithConcurrency(
    selected,
    8,
    async (candidate) => {
      const [quotesResult, repliesResult] = await Promise.allSettled([
        fetchClickHouseQuotePosts(candidate.tweet.id, 100),
        fetchDigestReplies(contextClient, {
          bangerTweetId: candidate.tweet.id,
          windowStart: run.windowStart,
          windowEnd: run.windowEnd,
          limit: 8,
        }),
      ])
      const quotes =
        quotesResult.status === 'fulfilled'
          ? quotesResult.value.tweets
              .filter((tweet) => {
                const createdAt = Date.parse(tweet.created_at)
                return createdAt >= windowStartMs && createdAt < windowEndMs
              })
              .slice(0, 12)
              .map((tweet) => quoteTweetToPortalTweet(tweet, candidate.tweet))
          : []
      const replies =
        repliesResult.status === 'fulfilled' ? repliesResult.value.tweets : []
      const commentary = Array.from(
        new Map(
          [...quotes, ...replies].map((tweet) => [tweet.id, tweet] as const),
        ).values(),
      )
      return {
        enriched: {
          candidate,
          commentary,
          replyTweetIds: replies.map(({ id }) => id),
          totalReplyCount:
            quotes.length +
            (repliesResult.status === 'fulfilled'
              ? repliesResult.value.totalCount
              : 0),
        } satisfies EnrichedDigestCandidate,
        failedFetches:
          Number(quotesResult.status === 'rejected') +
          Number(repliesResult.status === 'rejected'),
      }
    },
  )
  const enrichedCandidates = contextResults.map(({ enriched }) => enriched)
  const failedCommentary = contextResults.reduce(
    (sum, result) => sum + result.failedFetches,
    0,
  )
  events = [
    ...events,
    event(
      'commentary',
      'completed',
      'Saved reply and quote-post context for the selected bangers.',
      {
        selected_count: selected.length,
        failed_fetches: failedCommentary,
        commentary_count: enrichedCandidates.reduce(
          (sum, candidate) => sum + candidate.commentary.length,
          0,
        ),
      },
    ),
  ]

  const userPrompt = renderDigestPrompt(prompt.userPromptTemplate, {
    digestDate: run.digestDate,
    windowStart: run.windowStart,
    windowEnd: run.windowEnd,
    candidates: enrichedCandidates,
  })
  const modelRequest = {
    promptVersion: prompt,
    renderedUserPrompt: userPrompt,
    candidateSnapshot: enrichedCandidates,
  }
  events.push(
    event('generation', 'started', 'The model is clustering and writing.', {
      model: prompt.model,
      selected_count: selected.length,
    }),
  )
  const { error: requestSaveError } = await admin
    .from('digest_runs')
    .update({
      model_request: toJson(modelRequest),
      model: prompt.model,
      events: toJson(events),
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('status', 'running')
  if (requestSaveError) throw requestSaveError

  const generated = await generateDigestWithModel({
    runId,
    model: prompt.model,
    systemPrompt: prompt.systemPrompt,
    userPrompt,
    reasoningEffort: prompt.parameters.reasoning_effort,
    maxOutputTokens: prompt.parameters.max_output_tokens,
    temperature: prompt.parameters.temperature,
  })
  const completedAt = new Date()
  const durationMs = completedAt.getTime() - startedAt.getTime()
  const { error: responseSaveError } = await admin
    .from('digest_runs')
    .update({
      raw_response: toJson(generated.response),
      response_id: generated.responseId,
      model: generated.model,
      input_tokens: generated.inputTokens,
      output_tokens: generated.outputTokens,
      total_tokens: generated.totalTokens,
      duration_ms: durationMs,
      updated_at: completedAt.toISOString(),
    })
    .eq('id', runId)
    .eq('status', 'running')
  if (responseSaveError) throw responseSaveError
  if (generated.outputError) throw new Error(generated.outputError)

  const content = assembleDigestEditionContent({
    runId,
    digestDate: run.digestDate,
    windowStart: run.windowStart,
    windowEnd: run.windowEnd,
    allCandidateCount: run.candidates.length,
    enrichedCandidates,
    modelOutput: generated.output,
    generatedAt: completedAt.toISOString(),
  })
  events.push(
    event(
      'generation',
      'completed',
      'Validated and saved structured digest output.',
      {
        duration_ms: durationMs,
        story_count: content.stories.length,
        total_tokens: generated.totalTokens,
      },
    ),
  )
  const { error: updateError } = await admin
    .from('digest_runs')
    .update({
      status: 'completed',
      raw_response: toJson(generated.response),
      parsed_output: toJson(content),
      response_id: generated.responseId,
      model: generated.model,
      input_tokens: generated.inputTokens,
      output_tokens: generated.outputTokens,
      total_tokens: generated.totalTokens,
      duration_ms: durationMs,
      error: null,
      completed_at: completedAt.toISOString(),
      updated_at: completedAt.toISOString(),
      events: toJson(events),
    })
    .eq('id', runId)
    .eq('status', 'running')
  if (updateError) throw updateError
}

executeDigestGeneration.maxRetries = 0

async function markDigestGenerationFailed(runId: string, message: string) {
  'use step'

  const admin = createDigestAdminClient()
  const { data: runRow } = await admin
    .from('digest_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  if (!runRow) return
  const run = mapDigestRun(runRow)
  if (run.status !== 'running') return
  const completedAt = new Date()
  const startedAt = run.startedAt ? Date.parse(run.startedAt) : NaN
  const events = [
    ...run.events,
    event('generation', 'failed', message.slice(0, 360)),
  ]
  await admin
    .from('digest_runs')
    .update({
      status: 'failed',
      error: message.slice(0, 4_000),
      duration_ms: Number.isFinite(startedAt)
        ? completedAt.getTime() - startedAt
        : null,
      completed_at: completedAt.toISOString(),
      updated_at: completedAt.toISOString(),
      events: toJson(events),
    })
    .eq('id', runId)
    .eq('status', 'running')
}

export async function generateDigestWorkflow(runId: string) {
  'use workflow'

  try {
    await executeDigestGeneration(runId)
  } catch (error) {
    await markDigestGenerationFailed(runId, describeError(error))
    throw error
  }
}
