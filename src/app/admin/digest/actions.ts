'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { TweetData } from '@/components/TweetComponent'
import { requireAdmin } from '@/app/admin/data'
import { fetchClickHouseQuotePosts } from '@/lib/clickhouseQuotePosts'
import { fetchPortalRecentBangers } from '@/lib/portal/analytics'
import type { PortalTweet } from '@/lib/portal/types'
import { createDigestAdminClient } from '@/lib/digest/database'
import {
  assembleDigestEditionContent,
  renderDigestPrompt,
  type EnrichedDigestCandidate,
} from '@/lib/digest/generation'
import { generateDigestWithOpenAI } from '@/lib/digest/openai'
import { mapDigestRun, mapPromptVersion, toJson } from '@/lib/digest/data'
import type { DigestCandidate, DigestRunEvent } from '@/lib/digest/types'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TWEET_ID_PATTERN = /^\d{1,20}$/
const MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,120}$/
const REASONING_EFFORTS = new Set(['none', 'low', 'medium', 'high'])

const formString = (formData: FormData, key: string) =>
  String(formData.get(key) ?? '').trim()

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

function redirectToLab(input: {
  runId?: string
  notice?: string
  error?: string
}): never {
  const params = new URLSearchParams()
  if (input.runId) params.set('run', input.runId)
  if (input.notice) params.set('notice', input.notice.slice(0, 180))
  if (input.error) params.set('error', input.error.slice(0, 180))
  redirect(`/admin/digest${params.size ? `?${params}` : ''}`)
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

const quoteTweetToPortalTweet = (tweet: TweetData): PortalTweet => ({
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
})

const revalidateDigestPaths = (digestDate?: string) => {
  revalidatePath('/')
  revalidatePath('/digest')
  revalidatePath('/admin/digest')
  if (digestDate) revalidatePath(`/digest/${digestDate}`)
}

export async function createDigestPromptVersionAction(formData: FormData) {
  const { user } = await requireAdmin()
  const label = formString(formData, 'label').slice(0, 120)
  const model = formString(formData, 'model')
  const systemPrompt = formString(formData, 'system_prompt')
  const userPromptTemplate = formString(formData, 'user_prompt_template')
  const reasoningEffort = formString(formData, 'reasoning_effort') || 'low'
  const maxOutputTokens = Number(formString(formData, 'max_output_tokens'))

  if (!label || !MODEL_PATTERN.test(model)) {
    redirectToLab({ error: 'Enter a label and a valid model name.' })
  }
  if (!systemPrompt || systemPrompt.length > 20_000) {
    redirectToLab({
      error: 'System prompt must be between 1 and 20,000 characters.',
    })
  }
  if (
    !userPromptTemplate.includes('{{candidate_json}}') ||
    userPromptTemplate.length > 20_000
  ) {
    redirectToLab({ error: 'User template must include {{candidate_json}}.' })
  }
  if (!REASONING_EFFORTS.has(reasoningEffort)) {
    redirectToLab({ error: 'Invalid reasoning effort.' })
  }
  if (
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1_000 ||
    maxOutputTokens > 20_000
  ) {
    redirectToLab({
      error: 'Max output tokens must be between 1,000 and 20,000.',
    })
  }

  const admin = createDigestAdminClient()
  const { error } = await admin.from('digest_prompt_versions').insert({
    label,
    model,
    system_prompt: systemPrompt,
    user_prompt_template: userPromptTemplate,
    parameters: toJson({
      reasoning_effort: reasoningEffort,
      max_output_tokens: maxOutputTokens,
    }),
    created_by: user.id,
  })
  if (error) redirectToLab({ error: `Could not save prompt: ${error.message}` })
  revalidatePath('/admin/digest')
  redirectToLab({ notice: 'Saved a new immutable prompt version.' })
}

export async function createDigestRunAction(formData: FormData) {
  const { user } = await requireAdmin()
  const promptVersionId = formString(formData, 'prompt_version_id')
  if (!UUID_PATTERN.test(promptVersionId)) {
    redirectToLab({ error: 'Choose a prompt version.' })
  }

  const admin = createDigestAdminClient()
  const { data: prompt, error: promptError } = await admin
    .from('digest_prompt_versions')
    .select('*')
    .eq('id', promptVersionId)
    .maybeSingle()
  if (promptError || !prompt) {
    redirectToLab({ error: 'Prompt version not found.' })
  }

  let createdRunId = ''
  let candidateCount = 0
  try {
    const windowEnd = new Date()
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1_000)
    const tweets = await fetchPortalRecentBangers(50, 24)
    const candidates: DigestCandidate[] = tweets.map((tweet, index) => ({
      tweet,
      sourceRank: index + 1,
      selected: index < 18,
    }))
    const initialEvent = event(
      'candidates',
      'completed',
      'Saved the exact rolling 24-hour ClickHouse candidate snapshot.',
      {
        candidate_count: candidates.length,
        default_selected_count: candidates.filter(({ selected }) => selected)
          .length,
      },
    )
    const { data: run, error } = await admin
      .from('digest_runs')
      .insert({
        digest_date: windowEnd.toISOString().slice(0, 10),
        prompt_version_id: promptVersionId,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        candidates: toJson(candidates),
        events: toJson([initialEvent]),
        created_by: user.id,
      })
      .select('*')
      .single()
    if (error) throw error
    createdRunId = run.id
    candidateCount = candidates.length
  } catch (error) {
    console.error('[daily digest] candidate pull failed:', error)
    redirectToLab({ error: `Candidate pull failed: ${describeError(error)}` })
  }

  revalidatePath('/admin/digest')
  redirectToLab({
    runId: createdRunId,
    notice: `Loaded ${candidateCount} banger candidates from the last 24 hours.`,
  })
}

export async function duplicateDigestRunAction(formData: FormData) {
  const { user } = await requireAdmin()
  const runId = formString(formData, 'run_id')
  const promptVersionId = formString(formData, 'prompt_version_id')
  if (!UUID_PATTERN.test(runId) || !UUID_PATTERN.test(promptVersionId)) {
    redirectToLab({ error: 'Choose a valid run and prompt version.' })
  }

  const admin = createDigestAdminClient()
  const [
    { data: sourceRow, error: sourceError },
    { data: promptRow, error: promptError },
  ] = await Promise.all([
    admin.from('digest_runs').select('*').eq('id', runId).maybeSingle(),
    admin
      .from('digest_prompt_versions')
      .select('id')
      .eq('id', promptVersionId)
      .maybeSingle(),
  ])
  if (sourceError || !sourceRow) redirectToLab({ error: 'Run not found.' })
  if (promptError || !promptRow) {
    redirectToLab({ runId, error: 'Prompt version not found.' })
  }
  const source = mapDigestRun(sourceRow)
  if (source.status === 'running') {
    redirectToLab({ runId, error: 'A running generation cannot be cloned.' })
  }

  const clonedEvent = event(
    'candidates',
    'completed',
    `Cloned the frozen candidate snapshot from run ${source.id.slice(0, 8)}.`,
    {
      candidate_count: source.candidates.length,
      selected_count: source.candidates.filter(({ selected }) => selected)
        .length,
    },
  )
  const { data: clone, error } = await admin
    .from('digest_runs')
    .insert({
      digest_date: source.digestDate,
      prompt_version_id: promptVersionId,
      window_start: source.windowStart,
      window_end: source.windowEnd,
      candidates: toJson(source.candidates),
      events: toJson([clonedEvent]),
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) {
    redirectToLab({
      runId,
      error: `Could not clone run: ${error.message}`,
    })
  }
  revalidatePath('/admin/digest')
  redirectToLab({
    runId: clone.id,
    notice: 'Cloned the exact source snapshot into a new generation run.',
  })
}

export async function updateDigestSelectionAction(formData: FormData) {
  await requireAdmin()
  const runId = formString(formData, 'run_id')
  if (!UUID_PATTERN.test(runId)) redirectToLab({ error: 'Invalid run ID.' })
  const selectedIds = new Set(
    formData
      .getAll('selected_tweet_id')
      .map(String)
      .filter((id) => TWEET_ID_PATTERN.test(id))
      .slice(0, 50),
  )
  if (selectedIds.size < 3) {
    redirectToLab({ runId, error: 'Select at least three bangers.' })
  }

  const admin = createDigestAdminClient()
  const { data, error } = await admin
    .from('digest_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  if (error || !data) redirectToLab({ error: 'Run not found.' })
  const run = mapDigestRun(data)
  if (run.status !== 'candidates_ready') {
    redirectToLab({
      runId,
      error: 'Clone this snapshot before changing a finished generation run.',
    })
  }
  const candidates = run.candidates.map((candidate) => ({
    ...candidate,
    selected: selectedIds.has(candidate.tweet.id),
  }))
  const events = [
    ...run.events,
    event('selection', 'completed', 'Saved the editor candidate selection.', {
      selected_count: selectedIds.size,
    }),
  ]
  const { data: updatedRun, error: updateError } = await admin
    .from('digest_runs')
    .update({
      candidates: toJson(candidates),
      events: toJson(events),
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('status', 'candidates_ready')
    .select('id')
    .maybeSingle()
  if (updateError || !updatedRun) {
    redirectToLab({
      runId,
      error: updateError
        ? `Selection failed: ${updateError.message}`
        : 'This run was claimed by a generation request before the selection saved.',
    })
  }
  revalidatePath('/admin/digest')
  redirectToLab({
    runId,
    notice: `Saved ${selectedIds.size} selected bangers.`,
  })
}

export async function generateDigestRunAction(formData: FormData) {
  await requireAdmin()
  const runId = formString(formData, 'run_id')
  if (!UUID_PATTERN.test(runId)) redirectToLab({ error: 'Invalid run ID.' })
  const admin = createDigestAdminClient()
  const { data: runRow, error: runError } = await admin
    .from('digest_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  if (runError || !runRow) redirectToLab({ error: 'Run not found.' })
  const run = mapDigestRun(runRow)
  if (run.status !== 'candidates_ready') {
    redirectToLab({
      runId,
      error: 'Clone this snapshot to create another generation attempt.',
    })
  }
  const selected = run.candidates.filter(({ selected }) => selected)
  if (selected.length < 3) {
    redirectToLab({ runId, error: 'Select at least three bangers first.' })
  }
  const { data: promptRow, error: promptError } = await admin
    .from('digest_prompt_versions')
    .select('*')
    .eq('id', run.promptVersionId)
    .maybeSingle()
  if (promptError || !promptRow) {
    redirectToLab({ runId, error: 'Prompt version not found.' })
  }
  const prompt = mapPromptVersion(promptRow)
  const startedAt = new Date()
  let events: DigestRunEvent[] = [
    ...run.events,
    event('commentary', 'started', 'Fetching archived quote-post commentary.'),
  ]
  const { data: claimedRun, error: claimError } = await admin
    .from('digest_runs')
    .update({
      status: 'running',
      started_at: startedAt.toISOString(),
      completed_at: null,
      error: null,
      events: toJson(events),
      updated_at: startedAt.toISOString(),
    })
    .eq('id', runId)
    .eq('status', 'candidates_ready')
    .select('id')
    .maybeSingle()
  if (claimError || !claimedRun) {
    redirectToLab({
      runId,
      error: 'This run was already claimed by another generation request.',
    })
  }

  try {
    const commentaryResults = await Promise.allSettled(
      selected.map(async (candidate): Promise<EnrichedDigestCandidate> => {
        const result = await fetchClickHouseQuotePosts(candidate.tweet.id, 4)
        return {
          candidate,
          commentary: result.tweets.map(quoteTweetToPortalTweet),
          totalReplyCount: result.totalCount,
        }
      }),
    )
    const enrichedCandidates = commentaryResults.map((result, index) =>
      result.status === 'fulfilled'
        ? result.value
        : {
            candidate: selected[index],
            commentary: [],
            totalReplyCount: selected[index].tweet.quoteCount ?? 0,
          },
    )
    const failedCommentary = commentaryResults.filter(
      (result) => result.status === 'rejected',
    ).length
    events = [
      ...events,
      event(
        'commentary',
        'completed',
        'Saved commentary context for the selected bangers.',
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
      event(
        'generation',
        'started',
        'Sent the saved prompt and snapshot to the model.',
        {
          model: prompt.model,
          selected_count: selected.length,
        },
      ),
    )
    await admin
      .from('digest_runs')
      .update({
        model_request: toJson(modelRequest),
        model: prompt.model,
        events: toJson(events),
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)

    const generated = await generateDigestWithOpenAI({
      runId,
      model: prompt.model,
      systemPrompt: prompt.systemPrompt,
      userPrompt,
      reasoningEffort: prompt.parameters.reasoning_effort,
      maxOutputTokens: prompt.parameters.max_output_tokens,
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
    if (updateError) throw updateError
  } catch (error) {
    const completedAt = new Date()
    const message = describeError(error)
    console.error('[daily digest] generation failed:', { runId, error })
    events.push(event('generation', 'failed', message))
    await admin
      .from('digest_runs')
      .update({
        status: 'failed',
        error: message.slice(0, 4_000),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        completed_at: completedAt.toISOString(),
        updated_at: completedAt.toISOString(),
        events: toJson(events),
      })
      .eq('id', runId)
    revalidatePath('/admin/digest')
    redirectToLab({ runId, error: `Generation failed: ${message}` })
  }

  revalidatePath('/admin/digest')
  redirectToLab({
    runId,
    notice: 'Generation completed and passed validation.',
  })
}

export async function stageDigestEditionAction(formData: FormData) {
  const { user } = await requireAdmin()
  const runId = formString(formData, 'run_id')
  if (!UUID_PATTERN.test(runId)) redirectToLab({ error: 'Invalid run ID.' })
  const admin = createDigestAdminClient()
  const { data: runRow, error: runError } = await admin
    .from('digest_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  if (runError || !runRow) redirectToLab({ error: 'Run not found.' })
  const run = mapDigestRun(runRow)
  if (run.status !== 'completed' || !run.parsedOutput) {
    redirectToLab({
      runId,
      error: 'Generate a valid digest before staging it.',
    })
  }
  const { data: latest } = await admin
    .from('digest_editions')
    .select('version')
    .eq('digest_date', run.digestDate)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const version = (latest?.version ?? 0) + 1
  const { error } = await admin.from('digest_editions').insert({
    digest_date: run.digestDate,
    version,
    status: 'draft',
    source_run_id: run.id,
    content: toJson(run.parsedOutput),
    created_by: user.id,
  })
  if (error) {
    redirectToLab({ runId, error: `Could not stage edition: ${error.message}` })
  }
  const events = [
    ...run.events,
    event('edition', 'completed', `Staged digest edition version ${version}.`),
  ]
  await admin
    .from('digest_runs')
    .update({ events: toJson(events), updated_at: new Date().toISOString() })
    .eq('id', runId)
  revalidateDigestPaths(run.digestDate)
  redirectToLab({ runId, notice: `Staged digest edition v${version}.` })
}

export async function publishDigestEditionAction(formData: FormData) {
  await requireAdmin()
  const editionId = formString(formData, 'edition_id')
  const runId = formString(formData, 'run_id')
  if (!UUID_PATTERN.test(editionId)) {
    redirectToLab({ runId, error: 'Invalid edition ID.' })
  }
  const admin = createDigestAdminClient()
  const { data: edition, error } = await admin.rpc('publish_digest_edition', {
    p_edition_id: editionId,
  })
  if (error) {
    redirectToLab({ runId, error: `Publish failed: ${error.message}` })
  }
  revalidateDigestPaths(edition.digest_date)
  redirectToLab({
    runId,
    notice: `Published ${edition.digest_date} edition v${edition.version}.`,
  })
}
