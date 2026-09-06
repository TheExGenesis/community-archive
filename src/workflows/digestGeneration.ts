import type { TweetData } from '@/components/TweetComponent'
import { fetchClickHouseQuotePosts } from '@/lib/clickhouseQuotePosts'
import {
  loadDigestCandidates,
  MINIMUM_DIGEST_CANDIDATE_POOL,
} from '@/lib/digest/candidates'
import { fetchDigestReplies } from '@/lib/digest/context'
import {
  mapDigestEdition,
  mapDigestRun,
  mapPromptVersion,
  toJson,
} from '@/lib/digest/data'
import { createDigestAdminClient } from '@/lib/digest/database'
import { getDigestDateWindow } from '@/lib/digest/dateWindow'
import {
  assembleDigestEditionContent,
  renderDigestPrompt,
  renderDigestRevisionPrompt,
  type EnrichedDigestCandidate,
} from '@/lib/digest/generation'
import { generateDigestWithModel } from '@/lib/digest/openai'
import type { DigestEditionContent, DigestRunEvent } from '@/lib/digest/types'
import type { PortalTweet } from '@/lib/portal/types'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getWorkflowMetadata } from 'workflow'

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
  let revisionBase: DigestEditionContent | null = null
  if (run.parentRunId && run.revisionInstruction) {
    const { data: parentRow, error: parentError } = await admin
      .from('digest_runs')
      .select('*')
      .eq('id', run.parentRunId)
      .maybeSingle()
    if (parentError || !parentRow) {
      throw new Error('Revision source run not found')
    }
    const parentRun = mapDigestRun(parentRow)
    if (parentRun.status !== 'completed' || !parentRun.parsedOutput) {
      throw new Error('Revision source must be a completed digest run')
    }
    revisionBase = parentRun.parsedOutput
  }
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

  const { data: priorEditionRows, error: priorEditionsError } = await admin
    .from('digest_editions')
    .select('*')
    .eq('status', 'published')
    .lt('digest_date', run.digestDate)
    .order('digest_date', { ascending: false })
    .order('version', { ascending: false })
    .limit(7)
  if (priorEditionsError) throw priorEditionsError

  const priorDigests = (priorEditionRows ?? []).flatMap((row) => {
    const edition = mapDigestEdition(row)
    return edition
      ? [
          {
            digestDate: edition.digestDate,
            executiveSummary: edition.content.executiveSummary,
            storyTitles: edition.content.stories.map(({ title }) => title),
            keywords: edition.content.keywords,
          },
        ]
      : []
  })
  events.push(
    event(
      'commentary',
      'completed',
      `Loaded ${priorDigests.length} published digest${priorDigests.length === 1 ? '' : 's'} for continuity.`,
      { past_digest_count: priorDigests.length },
    ),
  )

  const baseUserPrompt = renderDigestPrompt(prompt.userPromptTemplate, {
    digestDate: run.digestDate,
    windowStart: run.windowStart,
    windowEnd: run.windowEnd,
    candidates: enrichedCandidates,
    priorDigests,
  })
  const userPrompt =
    revisionBase && run.revisionInstruction
      ? renderDigestRevisionPrompt({
          basePrompt: baseUserPrompt,
          instruction: run.revisionInstruction,
          current: revisionBase,
        })
      : baseUserPrompt
  const modelRequest = {
    promptVersion: prompt,
    renderedUserPrompt: userPrompt,
    candidateSnapshot: enrichedCandidates,
    continuityContext: priorDigests,
    ...(revisionBase && run.revisionInstruction
      ? {
          revision: {
            parentRunId: run.parentRunId,
            instruction: run.revisionInstruction,
            baseContent: revisionBase,
          },
        }
      : {}),
  }
  events.push(
    event(
      'generation',
      'started',
      revisionBase
        ? 'The model is applying the editorial revision.'
        : 'The model is clustering and writing.',
      {
        model: prompt.model,
        selected_count: selected.length,
        revision: Boolean(revisionBase),
      },
    ),
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

  let generated
  try {
    generated = await generateDigestWithModel({
      runId,
      model: prompt.model,
      systemPrompt: prompt.systemPrompt,
      userPrompt,
      reasoningEffort: prompt.parameters.reasoning_effort,
      maxOutputTokens: prompt.parameters.max_output_tokens,
      temperature: prompt.parameters.temperature,
    })
  } catch (error) {
    console.error('[daily digest workflow] model generation failed', {
      runId,
      model: prompt.model,
      error: describeError(error),
      ...(error instanceof Error ? { stack: error.stack } : {}),
    })
    throw error instanceof Error ? error : new Error(describeError(error))
  }
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

async function recordDigestWorkflowRun(runId: string, workflowRunId: string) {
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
  const events = [
    ...run.events,
    event(
      'selection',
      'completed',
      'The durable workflow accepted this generation job.',
      { workflow_run_id: workflowRunId },
    ),
  ]
  const updatedAt = new Date().toISOString()
  const { error } = await admin
    .from('digest_runs')
    .update({
      workflow_run_id: workflowRunId,
      events: toJson(events),
      updated_at: updatedAt,
    })
    .eq('id', runId)
    .eq('status', 'running')

  if (!error) return

  console.warn(
    '[daily digest workflow] could not save workflow run ID column',
    {
      runId,
      workflowRunId,
      error,
    },
  )
  await admin
    .from('digest_runs')
    .update({ events: toJson(events), updated_at: updatedAt })
    .eq('id', runId)
    .eq('status', 'running')
}

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

type NightlyDigestClaim =
  | { action: 'generate'; runId: string }
  | { action: 'publish'; runId: string }
  | {
      action: 'skip'
      reason: 'already-published' | 'already-running' | 'failed'
      runId: string | null
    }

async function claimNightlyDigestRun(
  digestDate: string,
  workflowRunId: string,
): Promise<NightlyDigestClaim> {
  'use step'

  const admin = createDigestAdminClient()
  const { data: published, error: publishedError } = await admin
    .from('digest_editions')
    .select('source_run_id')
    .eq('digest_date', digestDate)
    .eq('status', 'published')
    .limit(1)
    .maybeSingle()
  if (publishedError) throw publishedError
  if (published) {
    return {
      action: 'skip',
      reason: 'already-published',
      runId: published.source_run_id,
    }
  }

  const findExistingAutomatedRun = () =>
    admin
      .from('digest_runs')
      .select('*')
      .eq('digest_date', digestDate)
      .is('created_by', null)
      .is('parent_run_id', null)
      .not('workflow_run_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  const existingResult = await findExistingAutomatedRun()
  if (existingResult.error) throw existingResult.error
  if (existingResult.data) {
    const existing = mapDigestRun(existingResult.data)
    if (existing.status === 'completed') {
      return { action: 'publish', runId: existing.id }
    }
    if (
      existing.status === 'running' &&
      existing.workflowRunId === workflowRunId
    ) {
      return { action: 'generate', runId: existing.id }
    }
    return {
      action: 'skip',
      reason: existing.status === 'failed' ? 'failed' : 'already-running',
      runId: existing.id,
    }
  }

  const { data: promptRow, error: promptError } = await admin
    .from('digest_prompt_versions')
    .select('id')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (promptError || !promptRow) {
    throw promptError ?? new Error('No digest prompt version is configured')
  }

  const window = getDigestDateWindow(digestDate)
  const snapshot = await loadDigestCandidates(window.windowEnd, false)
  const startedAt = new Date()
  const hasEnoughCandidates = snapshot.candidates.length >= 3
  const initialEvents: DigestRunEvent[] = [
    event(
      'candidates',
      'completed',
      `Saved ${digestDate} nightly candidates from all authors, with Community Archive authors marked for editorial preference.`,
      {
        automation: true,
        candidate_count: snapshot.candidates.length,
        community_authored_count: snapshot.communityAuthoredCount,
        default_selected_count: snapshot.candidates.length,
        interaction_fallback_count: snapshot.fallbackCount,
        minimum_candidate_pool: MINIMUM_DIGEST_CANDIDATE_POOL,
        minimum_ca_quote_count: 2,
        qualifying_banger_count: snapshot.bangerCount,
        target_author_population: 'all_authors',
        workflow_run_id: workflowRunId,
      },
    ),
  ]
  if (!hasEnoughCandidates) {
    initialEvents.push(
      event(
        'generation',
        'failed',
        `Only ${snapshot.candidates.length} candidates were found; at least three are required.`,
      ),
    )
  }
  const { data: created, error: createError } = await admin
    .from('digest_runs')
    .insert({
      digest_date: digestDate,
      status: hasEnoughCandidates ? 'running' : 'failed',
      prompt_version_id: promptRow.id,
      window_start: window.windowStart,
      window_end: window.windowEnd,
      candidates: toJson(snapshot.candidates),
      workflow_run_id: workflowRunId,
      events: toJson(initialEvents),
      started_at: hasEnoughCandidates ? startedAt.toISOString() : null,
      completed_at: hasEnoughCandidates ? null : startedAt.toISOString(),
      error: hasEnoughCandidates
        ? null
        : `Only ${snapshot.candidates.length} digest candidates were found`,
      created_by: null,
    })
    .select('id')
    .single()

  if (createError) {
    if (createError.code !== '23505') throw createError
    const duplicateResult = await findExistingAutomatedRun()
    if (duplicateResult.error || !duplicateResult.data) {
      throw duplicateResult.error ?? createError
    }
    const duplicate = mapDigestRun(duplicateResult.data)
    if (duplicate.status === 'completed') {
      return { action: 'publish', runId: duplicate.id }
    }
    return {
      action: 'skip',
      reason: duplicate.status === 'failed' ? 'failed' : 'already-running',
      runId: duplicate.id,
    }
  }

  return hasEnoughCandidates
    ? { action: 'generate', runId: created.id }
    : { action: 'skip', reason: 'failed', runId: created.id }
}

async function publishNightlyDigestRun(runId: string) {
  'use step'

  const admin = createDigestAdminClient()
  const { data: runRow, error: runError } = await admin
    .from('digest_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  if (runError || !runRow) throw runError ?? new Error('Digest run not found')
  const run = mapDigestRun(runRow)
  if (run.status !== 'completed' || !run.parsedOutput) {
    throw new Error('Nightly digest run did not complete with valid output')
  }

  const { data: alreadyPublished, error: publishedError } = await admin
    .from('digest_editions')
    .select('id, source_run_id, version')
    .eq('digest_date', run.digestDate)
    .eq('status', 'published')
    .limit(1)
    .maybeSingle()
  if (publishedError) throw publishedError
  if (alreadyPublished) {
    return {
      digestDate: run.digestDate,
      editionId: alreadyPublished.id,
      status:
        alreadyPublished.source_run_id === runId
          ? ('published' as const)
          : ('editorial-edition-preserved' as const),
      version: alreadyPublished.version,
    }
  }

  const { data: existingDraft, error: draftError } = await admin
    .from('digest_editions')
    .select('id, version')
    .eq('source_run_id', runId)
    .eq('status', 'draft')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (draftError) throw draftError

  let draft = existingDraft
  if (!draft) {
    const { data: latest, error: latestError } = await admin
      .from('digest_editions')
      .select('version')
      .eq('digest_date', run.digestDate)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw latestError

    const version = (latest?.version ?? 0) + 1
    const { data: createdDraft, error: createError } = await admin
      .from('digest_editions')
      .insert({
        digest_date: run.digestDate,
        version,
        status: 'draft',
        source_run_id: run.id,
        content: toJson({
          ...run.parsedOutput,
          executiveSummary: run.parsedOutput.executiveSummary.slice(0, 3),
        }),
        created_by: null,
      })
      .select('id, version')
      .single()
    if (createError) throw createError
    draft = createdDraft
  }

  const { data: published, error: publishError } = await admin.rpc(
    'publish_digest_edition',
    { p_edition_id: draft.id },
  )
  if (publishError || !published) {
    throw publishError ?? new Error('Digest publication returned no edition')
  }

  const events = [
    ...run.events,
    event(
      'edition',
      'completed',
      `Nightly automation published digest edition version ${published.version}.`,
      { automation: true, edition_id: published.id },
    ),
  ]
  const { error: eventError } = await admin
    .from('digest_runs')
    .update({ events: toJson(events), updated_at: new Date().toISOString() })
    .eq('id', runId)
  if (eventError) {
    console.warn(
      '[daily digest workflow] published edition but could not append event',
      { runId, editionId: published.id, error: eventError },
    )
  }

  console.info('[daily digest workflow] nightly edition published', {
    digestDate: published.digest_date,
    editionId: published.id,
    runId,
    version: published.version,
  })
  return {
    digestDate: published.digest_date,
    editionId: published.id,
    status: 'published' as const,
    version: published.version,
  }
}

export async function generateDigestWorkflow(runId: string) {
  'use workflow'

  try {
    const { workflowRunId } = getWorkflowMetadata()
    await recordDigestWorkflowRun(runId, workflowRunId)
    await executeDigestGeneration(runId)
  } catch (error) {
    await markDigestGenerationFailed(runId, describeError(error))
    throw error
  }
}

export async function publishNightlyDigestWorkflow(digestDate: string) {
  'use workflow'

  const { workflowRunId } = getWorkflowMetadata()
  const claim = await claimNightlyDigestRun(digestDate, workflowRunId)
  if (claim.action === 'skip') {
    return {
      digestDate,
      reason: claim.reason,
      runId: claim.runId,
      status: 'skipped' as const,
    }
  }

  if (claim.action === 'generate') {
    try {
      await executeDigestGeneration(claim.runId)
    } catch (error) {
      await markDigestGenerationFailed(claim.runId, describeError(error))
      throw error
    }
  }

  return publishNightlyDigestRun(claim.runId)
}
