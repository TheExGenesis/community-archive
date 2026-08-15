'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { start } from 'workflow/api'
import { requireAdmin } from '@/app/admin/data'
import { fetchPortalRecentBangers } from '@/lib/portal/analytics'
import {
  getDigestDateWindow,
  isRecentPastDigestDate,
  listPastDigestDates,
} from '@/lib/digest/dateWindow'
import { createDigestAdminClient } from '@/lib/digest/database'
import { selectDailyDigestBangers } from '@/lib/digest/generation'
import { captureDigestPostHogEvent } from '@/lib/digest/posthogServer'
import { mapDigestEdition, mapDigestRun, toJson } from '@/lib/digest/data'
import {
  DIGEST_STORY_CATEGORIES,
  parseDigestEditionContent,
  type DigestCandidate,
  type DigestEditionContent,
  type DigestRunEvent,
} from '@/lib/digest/types'
import { generateDigestWorkflow } from '@/workflows/digestGeneration'

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

const revalidateDigestPaths = (digestDate?: string) => {
  revalidatePath('/')
  revalidatePath('/digest')
  revalidatePath('/admin/digest')
  if (digestDate) revalidatePath(`/digest/${digestDate}`)
}

function parseEditedDigestContent(
  formData: FormData,
  baseContent: DigestEditionContent,
  runId: string,
): DigestEditionContent {
  const executiveSummary = [0, 1, 2].map((index) =>
    formString(formData, `summary_${index}`).slice(0, 300),
  )
  if (executiveSummary.some((bullet) => !bullet)) {
    redirectToLab({ runId, error: 'All three summary bullets are required.' })
  }
  const stories = baseContent.stories.map((story, storyIndex) => {
    const category = formString(formData, `story_${storyIndex}_category`)
    const title = formString(formData, `story_${storyIndex}_title`).slice(
      0,
      300,
    )
    const subtitle = formString(formData, `story_${storyIndex}_subtitle`).slice(
      0,
      500,
    )
    const editorialNote = formString(
      formData,
      `story_${storyIndex}_editorial_note`,
    ).slice(0, 360)
    const bullets = story.bullets.map((_, bulletIndex) =>
      formString(formData, `story_${storyIndex}_bullet_${bulletIndex}`).slice(
        0,
        220,
      ),
    )
    if (
      !DIGEST_STORY_CATEGORIES.some((item) => item === category) ||
      !title ||
      !subtitle ||
      !editorialNote ||
      bullets.some((bullet) => !bullet)
    ) {
      redirectToLab({
        runId,
        error: `Complete every editable field in story ${storyIndex + 1}.`,
      })
    }
    return {
      ...story,
      category: category as (typeof DIGEST_STORY_CATEGORIES)[number],
      title,
      subtitle,
      editorialNote,
      bullets,
    }
  })
  const keywords = Array.from(
    new Set(
      formString(formData, 'keywords')
        .split(/[\n,]/)
        .map((keyword) => keyword.trim().slice(0, 60))
        .filter(Boolean),
    ),
  ).slice(0, 12)
  if (keywords.length < 3) {
    redirectToLab({ runId, error: 'Keep at least three edition keywords.' })
  }

  const content = parseDigestEditionContent({
    ...baseContent,
    executiveSummary,
    stories,
    keywords,
  })
  if (!content) {
    redirectToLab({ runId, error: 'The edited draft did not pass validation.' })
  }
  return content
}

async function enqueueDigestGeneration(runId: string) {
  const admin = createDigestAdminClient()
  const { data: runRow, error: runError } = await admin
    .from('digest_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  if (runError || !runRow) throw new Error('Digest run not found')

  const run = mapDigestRun(runRow)
  if (run.status !== 'candidates_ready') {
    throw new Error('This run was already claimed by another generation job')
  }
  if (run.candidates.filter(({ selected }) => selected).length < 3) {
    throw new Error('Select at least three bangers first')
  }

  const startedAt = new Date()
  const events = [
    ...run.events,
    event(
      'generation',
      'started',
      'Queued a durable generation job. It is safe to leave this page.',
    ),
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
    throw new Error('This run was already claimed by another generation job')
  }

  try {
    const workflowRun = await start(generateDigestWorkflow, [runId])
    const { error: workflowIdError } = await admin
      .from('digest_runs')
      .update({
        workflow_run_id: workflowRun.runId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)
    if (workflowIdError) {
      console.warn('[daily digest] could not save workflow run ID:', {
        runId,
        error: workflowIdError,
      })
    }
  } catch (error) {
    const message = describeError(error)
    const completedAt = new Date()
    await admin
      .from('digest_runs')
      .update({
        status: 'failed',
        error: message.slice(0, 4_000),
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        updated_at: completedAt.toISOString(),
        events: toJson([
          ...events,
          event('generation', 'failed', `Could not start job: ${message}`),
        ]),
      })
      .eq('id', runId)
      .eq('status', 'running')
    throw error
  }
}

export async function createDigestPromptVersionAction(formData: FormData) {
  const { user } = await requireAdmin()
  const label = formString(formData, 'label').slice(0, 120)
  const model = formString(formData, 'model')
  const systemPrompt = formString(formData, 'system_prompt')
  const userPromptTemplate = formString(formData, 'user_prompt_template')
  const reasoningEffort = formString(formData, 'reasoning_effort') || 'high'
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
    const candidates: DigestCandidate[] = selectDailyDigestBangers(tweets).map(
      (tweet, index) => ({
        tweet,
        sourceRank: index + 1,
        selected: true,
      }),
    )
    const initialEvent = event(
      'candidates',
      'completed',
      'Saved up to 50 rolling 24-hour posts with a Community Archive banger score of at least two.',
      {
        candidate_count: candidates.length,
        default_selected_count: candidates.length,
        minimum_ca_quote_count: 2,
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
    await captureDigestPostHogEvent(user.id, {
      event: 'digest_generation_requested',
      properties: {
        source: 'admin_rolling_window',
        candidate_count: candidates.length,
        days_ago: 0,
      },
    })
  } catch (error) {
    console.error('[daily digest] candidate pull failed:', error)
    redirectToLab({ error: `Candidate pull failed: ${describeError(error)}` })
  }

  revalidatePath('/admin/digest')
  redirectToLab({
    runId: createdRunId,
    notice: `Loaded ${candidateCount} qualifying bangers from the last 24 hours.`,
  })
}

export async function createAndGenerateDigestDateAction(formData: FormData) {
  const { user } = await requireAdmin()
  const promptVersionId = formString(formData, 'prompt_version_id')
  const digestDate = formString(formData, 'digest_date')
  if (!UUID_PATTERN.test(promptVersionId)) {
    redirectToLab({ error: 'Choose a prompt version.' })
  }
  if (!isRecentPastDigestDate(digestDate, new Date(), 365)) {
    redirectToLab({ error: 'Choose a completed day from the past 12 months.' })
  }

  const admin = createDigestAdminClient()
  const [promptResult, runningResult] = await Promise.all([
    admin
      .from('digest_prompt_versions')
      .select('id')
      .eq('id', promptVersionId)
      .maybeSingle(),
    admin
      .from('digest_runs')
      .select('id')
      .eq('digest_date', digestDate)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (promptResult.error || !promptResult.data) {
    redirectToLab({ error: 'Prompt version not found.' })
  }
  if (runningResult.data) {
    redirectToLab({
      runId: runningResult.data.id,
      error: 'That date already has a generation in progress.',
    })
  }

  let createdRunId = ''
  let candidateCount = 0
  try {
    const window = getDigestDateWindow(digestDate)
    const tweets = await fetchPortalRecentBangers(
      50,
      24,
      undefined,
      window.windowEnd,
    )
    const candidates: DigestCandidate[] = selectDailyDigestBangers(tweets).map(
      (tweet, index) => ({
        tweet,
        sourceRank: index + 1,
        selected: true,
      }),
    )
    const initialEvent = event(
      'candidates',
      'completed',
      `Saved up to 50 bangers authored during the ${digestDate} Community Archive day (06:00 UTC to 05:59 UTC).`,
      {
        candidate_count: candidates.length,
        default_selected_count: candidates.length,
        minimum_ca_quote_count: 2,
        historical_window: true,
      },
    )
    const { data: run, error } = await admin
      .from('digest_runs')
      .insert({
        digest_date: digestDate,
        prompt_version_id: promptVersionId,
        window_start: window.windowStart,
        window_end: window.windowEnd,
        candidates: toJson(candidates),
        events: toJson([initialEvent]),
        created_by: user.id,
      })
      .select('id')
      .single()
    if (error) throw error
    createdRunId = run.id
    candidateCount = candidates.length

    const daysAgo = listPastDigestDates(365).indexOf(digestDate) + 1
    await captureDigestPostHogEvent(user.id, {
      event: 'digest_generation_requested',
      properties: {
        source: 'admin_past_day',
        candidate_count: candidates.length,
        days_ago: daysAgo,
      },
    })
  } catch (error) {
    console.error('[daily digest] historical candidate pull failed:', error)
    redirectToLab({
      runId: createdRunId || undefined,
      error: `Historical candidate pull failed: ${describeError(error)}`,
    })
  }

  if (candidateCount < 3) {
    redirectToLab({
      runId: createdRunId,
      error: `Only ${candidateCount} qualifying bangers were found for ${digestDate}; at least three are required.`,
    })
  }

  try {
    await enqueueDigestGeneration(createdRunId)
  } catch (error) {
    redirectToLab({
      runId: createdRunId,
      error: `Could not start generation: ${describeError(error)}`,
    })
  }

  revalidatePath('/admin/digest')
  redirectToLab({
    runId: createdRunId,
    notice: 'Generation started. You can refresh or leave this page safely.',
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
  const { user } = await requireAdmin()
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
  if (run.status === 'running') {
    redirectToLab({
      runId,
      error: 'Wait for the running generation before changing its selection.',
    })
  }
  const candidates = run.candidates.map((candidate) => ({
    ...candidate,
    selected: selectedIds.has(candidate.tweet.id),
  }))
  if (run.status !== 'candidates_ready') {
    const promptVersionId =
      formString(formData, 'prompt_version_id') || run.promptVersionId
    if (!UUID_PATTERN.test(promptVersionId)) {
      redirectToLab({ runId, error: 'Choose a valid prompt version.' })
    }
    const { data: promptRow, error: promptError } = await admin
      .from('digest_prompt_versions')
      .select('id')
      .eq('id', promptVersionId)
      .maybeSingle()
    if (promptError || !promptRow) {
      redirectToLab({ runId, error: 'Prompt version not found.' })
    }
    const forkEvent = event(
      'selection',
      'completed',
      `Forked the candidate selection from finished run ${run.id.slice(0, 8)}.`,
      { selected_count: selectedIds.size },
    )
    const { data: fork, error: forkError } = await admin
      .from('digest_runs')
      .insert({
        digest_date: run.digestDate,
        prompt_version_id: promptVersionId,
        window_start: run.windowStart,
        window_end: run.windowEnd,
        candidates: toJson(candidates),
        events: toJson([forkEvent]),
        created_by: user.id,
      })
      .select('id')
      .single()
    if (forkError) {
      redirectToLab({
        runId,
        error: `Could not save editable selection: ${forkError.message}`,
      })
    }
    revalidatePath('/admin/digest')
    redirectToLab({
      runId: fork.id,
      notice: `Saved ${selectedIds.size} selected bangers as a new editable run.`,
    })
  }
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

  try {
    await enqueueDigestGeneration(runId)
  } catch (error) {
    redirectToLab({
      runId,
      error: `Could not start generation: ${describeError(error)}`,
    })
  }

  revalidatePath('/admin/digest')
  redirectToLab({
    runId,
    notice: 'Generation started. You can refresh or leave this page safely.',
  })
}

export async function reviseDigestRunAction(formData: FormData) {
  const { user } = await requireAdmin()
  const runId = formString(formData, 'run_id')
  const promptVersionId = formString(formData, 'prompt_version_id')
  const instruction = formString(formData, 'revision_instruction')
  if (!UUID_PATTERN.test(runId) || !UUID_PATTERN.test(promptVersionId)) {
    redirectToLab({ error: 'Choose a valid run and prompt version.' })
  }
  if (!instruction || instruction.length > 2_000) {
    redirectToLab({
      runId,
      error: 'Describe the revision in 2,000 characters or fewer.',
    })
  }

  const admin = createDigestAdminClient()
  const [sourceResult, promptResult] = await Promise.all([
    admin.from('digest_runs').select('*').eq('id', runId).maybeSingle(),
    admin
      .from('digest_prompt_versions')
      .select('id')
      .eq('id', promptVersionId)
      .maybeSingle(),
  ])
  if (sourceResult.error || !sourceResult.data) {
    redirectToLab({ error: 'Run not found.' })
  }
  if (promptResult.error || !promptResult.data) {
    redirectToLab({ runId, error: 'Prompt version not found.' })
  }
  const source = mapDigestRun(sourceResult.data)
  if (source.status !== 'completed' || !source.parsedOutput) {
    redirectToLab({
      runId,
      error: 'Only a completed, validated run can be revised.',
    })
  }

  const revisionEvent = event(
    'selection',
    'completed',
    `Created an editorial revision of run ${source.id.slice(0, 8)}.`,
    {
      selected_count: source.candidates.filter(({ selected }) => selected)
        .length,
    },
  )
  const { data: revision, error } = await admin
    .from('digest_runs')
    .insert({
      digest_date: source.digestDate,
      prompt_version_id: promptVersionId,
      parent_run_id: source.id,
      revision_instruction: instruction,
      window_start: source.windowStart,
      window_end: source.windowEnd,
      candidates: toJson(source.candidates),
      events: toJson([revisionEvent]),
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) {
    redirectToLab({
      runId,
      error: `Could not create revision: ${error.message}`,
    })
  }

  try {
    await enqueueDigestGeneration(revision.id)
  } catch (error) {
    redirectToLab({
      runId: revision.id,
      error: `Could not start revision: ${describeError(error)}`,
    })
  }
  await captureDigestPostHogEvent(user.id, {
    event: 'digest_generation_requested',
    properties: {
      source: 'admin_revision',
      candidate_count: source.candidates.filter(({ selected }) => selected)
        .length,
      days_ago: listPastDigestDates(365).indexOf(source.digestDate) + 1,
    },
  })
  revalidatePath('/admin/digest')
  redirectToLab({
    runId: revision.id,
    notice: 'Revision started. It will keep running if you leave this page.',
  })
}

export async function stageDigestEditionAction(formData: FormData) {
  const { user } = await requireAdmin()
  const runId = formString(formData, 'run_id')
  if (!UUID_PATTERN.test(runId)) redirectToLab({ error: 'Invalid run ID.' })
  console.info('[daily digest] staging edition started', { runId })
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
  const { data: latest, error: latestError } = await admin
    .from('digest_editions')
    .select('version')
    .eq('digest_date', run.digestDate)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) {
    console.error('[daily digest] could not resolve edition version', {
      runId,
      error: latestError,
    })
    redirectToLab({
      runId,
      error: `Could not resolve draft version: ${latestError.message}`,
    })
  }
  const version = (latest?.version ?? 0) + 1
  const stagedContent = {
    ...run.parsedOutput,
    executiveSummary: run.parsedOutput.executiveSummary.slice(0, 3),
  }
  const { error } = await admin.from('digest_editions').insert({
    digest_date: run.digestDate,
    version,
    status: 'draft',
    source_run_id: run.id,
    content: toJson(stagedContent),
    created_by: user.id,
  })
  if (error) {
    redirectToLab({ runId, error: `Could not stage edition: ${error.message}` })
  }
  const events = [
    ...run.events,
    event('edition', 'completed', `Staged digest edition version ${version}.`),
  ]
  const { error: eventError } = await admin
    .from('digest_runs')
    .update({ events: toJson(events), updated_at: new Date().toISOString() })
    .eq('id', runId)
  if (eventError) {
    console.warn('[daily digest] staged edition but could not append event', {
      runId,
      version,
      error: eventError,
    })
  }
  await captureDigestPostHogEvent(user.id, {
    event: 'digest_page_created',
    properties: {
      source: 'generated',
      status: 'draft',
      story_count: stagedContent.stories.length,
      editorial_warning_count: stagedContent.editorialWarnings?.length ?? 0,
    },
  })
  console.info('[daily digest] staging edition completed', {
    runId,
    digestDate: run.digestDate,
    version,
  })
  revalidateDigestPaths(run.digestDate)
  redirectToLab({ runId, notice: `Staged digest edition v${version}.` })
}

export async function stageEditedDigestEditionAction(formData: FormData) {
  const { user } = await requireAdmin()
  const runId = formString(formData, 'run_id')
  const publishImmediately = formString(formData, 'intent') === 'publish'
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
      error: 'Generate a valid digest before editing it.',
    })
  }

  const content = parseEditedDigestContent(formData, run.parsedOutput, runId)
  const { data: latest, error: latestError } = await admin
    .from('digest_editions')
    .select('version')
    .eq('digest_date', run.digestDate)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) {
    redirectToLab({
      runId,
      error: `Could not resolve draft version: ${latestError.message}`,
    })
  }
  const version = (latest?.version ?? 0) + 1
  const { data: savedEdition, error } = await admin
    .from('digest_editions')
    .insert({
      digest_date: run.digestDate,
      version,
      status: 'draft',
      source_run_id: run.id,
      content: toJson(content),
      created_by: user.id,
    })
    .select('*')
    .single()
  if (error || !savedEdition) {
    redirectToLab({
      runId,
      error: `Could not save corrected draft: ${error?.message ?? 'No edition was returned.'}`,
    })
  }

  let publishedEdition: typeof savedEdition | null = null
  if (publishImmediately) {
    const { data, error: publishError } = await admin.rpc(
      'publish_digest_edition',
      { p_edition_id: savedEdition.id },
    )
    if (publishError || !data) {
      revalidateDigestPaths(run.digestDate)
      redirectToLab({
        runId,
        error: `Saved draft v${version}, but publish failed: ${publishError?.message ?? 'No published edition was returned.'}`,
      })
    }
    publishedEdition = data
  }

  const events = [
    ...run.events,
    event(
      'edition',
      'completed',
      publishImmediately
        ? `Saved inline corrections and published digest edition version ${version}.`
        : `Saved inline corrections as digest edition version ${version}.`,
    ),
  ]
  const [eventResult] = await Promise.allSettled([
    admin
      .from('digest_runs')
      .update({ events: toJson(events), updated_at: new Date().toISOString() })
      .eq('id', runId),
    captureDigestPostHogEvent(user.id, {
      event: 'digest_page_created',
      properties: {
        source: 'manual_edit',
        status: publishImmediately ? 'published' : 'draft',
        story_count: content.stories.length,
        editorial_warning_count: content.editorialWarnings?.length ?? 0,
      },
    }),
  ])
  const eventError =
    eventResult.status === 'fulfilled'
      ? eventResult.value.error
      : eventResult.reason
  if (eventError) {
    console.warn(
      '[daily digest] saved corrected draft but could not append event',
      { runId, version, error: eventError },
    )
  }
  console.info('[daily digest] inline corrections saved', {
    runId,
    digestDate: run.digestDate,
    version,
    published: publishImmediately,
  })
  revalidateDigestPaths(publishedEdition?.digest_date ?? run.digestDate)
  redirectToLab({
    runId,
    notice: publishImmediately
      ? `Saved corrections and published ${run.digestDate} edition v${version}.`
      : `Saved corrections as draft v${version}.`,
  })
}

export async function saveDigestEditionAction(formData: FormData) {
  const { user } = await requireAdmin()
  const editionId = formString(formData, 'edition_id')
  const runId = formString(formData, 'run_id')
  const publishImmediately = formString(formData, 'intent') === 'publish'
  if (!UUID_PATTERN.test(editionId)) {
    redirectToLab({ runId, error: 'Invalid edition ID.' })
  }

  const admin = createDigestAdminClient()
  const { data: editionRow, error: editionError } = await admin
    .from('digest_editions')
    .select('*')
    .eq('id', editionId)
    .maybeSingle()
  if (editionError || !editionRow) {
    redirectToLab({ runId, error: 'Draft edition not found.' })
  }
  const edition = mapDigestEdition(editionRow)
  if (!edition || edition.status !== 'draft') {
    redirectToLab({ runId, error: 'Only a draft edition can be edited.' })
  }

  const content = parseEditedDigestContent(formData, edition.content, runId)
  const { data: latest, error: latestError } = await admin
    .from('digest_editions')
    .select('version')
    .eq('digest_date', edition.digestDate)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) {
    redirectToLab({
      runId,
      error: `Could not resolve draft version: ${latestError.message}`,
    })
  }
  const version = (latest?.version ?? 0) + 1
  const { data: savedEdition, error } = await admin
    .from('digest_editions')
    .insert({
      digest_date: edition.digestDate,
      version,
      status: 'draft',
      source_run_id: edition.sourceRunId,
      content: toJson(content),
      created_by: user.id,
    })
    .select('*')
    .single()
  if (error || !savedEdition) {
    redirectToLab({
      runId,
      error: `Could not save draft: ${error?.message ?? 'No edition was returned.'}`,
    })
  }
  if (publishImmediately) {
    const { data: publishedEdition, error: publishError } = await admin.rpc(
      'publish_digest_edition',
      { p_edition_id: savedEdition.id },
    )
    if (publishError || !publishedEdition) {
      revalidateDigestPaths(edition.digestDate)
      redirectToLab({
        runId,
        error: `Saved draft v${version}, but publish failed: ${publishError?.message ?? 'No published edition was returned.'}`,
      })
    }
    await captureDigestPostHogEvent(user.id, {
      event: 'digest_page_created',
      properties: {
        source: 'manual_edit',
        status: 'published',
        story_count: content.stories.length,
        editorial_warning_count: content.editorialWarnings?.length ?? 0,
      },
    })
    revalidateDigestPaths(publishedEdition.digest_date)
    redirectToLab({
      runId,
      notice: `Saved and published ${publishedEdition.digest_date} edition v${publishedEdition.version}.`,
    })
  }
  await captureDigestPostHogEvent(user.id, {
    event: 'digest_page_created',
    properties: {
      source: 'manual_edit',
      status: 'draft',
      story_count: content.stories.length,
      editorial_warning_count: content.editorialWarnings?.length ?? 0,
    },
  })
  revalidateDigestPaths(edition.digestDate)
  redirectToLab({ runId, notice: `Saved edited draft v${version}.` })
}

export async function publishDigestEditionAction(formData: FormData) {
  await requireAdmin()
  const editionId = formString(formData, 'edition_id')
  const runId = formString(formData, 'run_id')
  if (!UUID_PATTERN.test(editionId)) {
    redirectToLab({ runId, error: 'Invalid edition ID.' })
  }
  console.info('[daily digest] publishing edition started', {
    editionId,
    runId: runId || null,
  })
  const admin = createDigestAdminClient()
  const { data: edition, error } = await admin.rpc('publish_digest_edition', {
    p_edition_id: editionId,
  })
  if (error) {
    console.error('[daily digest] publishing edition failed', {
      editionId,
      error,
    })
    redirectToLab({ runId, error: `Publish failed: ${error.message}` })
  }
  console.info('[daily digest] publishing edition completed', {
    editionId,
    digestDate: edition.digest_date,
    version: edition.version,
  })
  revalidateDigestPaths(edition.digest_date)
  redirectToLab({
    runId,
    notice: `Published ${edition.digest_date} edition v${edition.version}.`,
  })
}
