import { snapshotDigestTrends } from '@/lib/digest/snapshotTrends'
import { loadDigestCandidates } from '@/lib/digest/candidates'
import { enrichDigestCandidates } from '@/lib/digest/enrichment'
import {
  getDigestDateWindow,
  getLatestCompletedDigestDate,
} from '@/lib/digest/dateWindow'
import {
  assembleDigestEditionContent,
  renderDigestPrompt,
  type DigestContinuityContext,
  type EnrichedDigestCandidate,
} from '@/lib/digest/generation'
import {
  DIGEST_CONTENT_FILTER_FALLBACK_MODEL,
  DIGEST_JSON_SCHEMA,
  generateDigestWithModel,
  isContentFiltered,
  type DigestGenerationResponse,
} from '@/lib/digest/openai'
import type {
  DigestEditionContent,
  DigestPromptVersion,
  DigestRunEvent,
} from '@/lib/digest/types'

type JsonObject = Record<string, unknown>

interface PromptRow {
  id: string
  version: number
  label: string
  model: string
  parameters: unknown
  system_prompt: string
  user_prompt_template: string
  created_by: string | null
  created_at: string
}

interface RunRow {
  id: string
  status: string
  digest_date: string
  parsed_output: DigestEditionContent | null
  events: DigestRunEvent[] | null
}

interface EditionRow {
  id: string
  digest_date: string
  source_run_id: string
  status: string
  version: number
  content?: DigestEditionContent
}

const log = (message: string, metadata: JsonObject = {}) =>
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      service: 'community-archive-nightly-digest',
      message,
      ...metadata,
    }),
  )

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

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

class SupabaseRest {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor() {
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE
    if (!projectUrl || !serviceRole) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE are required',
      )
    }
    this.baseUrl = `${projectUrl}/rest/v1`
    this.headers = {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      'Content-Type': 'application/json',
    }
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    prefer?: string,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${path}`, {
      ...init,
      headers: {
        ...this.headers,
        ...(prefer ? { Prefer: prefer } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(60_000),
    })
    const body = await response.text()
    if (!response.ok) {
      throw new Error(
        `Supabase request failed (${response.status}): ${body.slice(0, 500)}`,
      )
    }
    return (body ? JSON.parse(body) : null) as T
  }

  select<T>(table: string, query: URLSearchParams) {
    return this.request<T[]>(`${table}?${query}`)
  }

  insert<T>(table: string, value: JsonObject) {
    return this.request<T[]>(
      table,
      { method: 'POST', body: JSON.stringify(value) },
      'return=representation',
    )
  }

  update<T>(table: string, query: URLSearchParams, value: JsonObject) {
    return this.request<T[]>(
      `${table}?${query}`,
      { method: 'PATCH', body: JSON.stringify(value) },
      'return=representation',
    )
  }

  rpc<T>(name: string, value: JsonObject) {
    return this.request<T>(`rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(value),
    })
  }
}

const query = (values: Record<string, string>) => new URLSearchParams(values)

const mapPrompt = (row: PromptRow): DigestPromptVersion => {
  const parameters =
    row.parameters && typeof row.parameters === 'object'
      ? (row.parameters as JsonObject)
      : {}
  return {
    id: row.id,
    version: Number(row.version),
    label: row.label,
    model: row.model,
    systemPrompt: row.system_prompt,
    userPromptTemplate: row.user_prompt_template,
    parameters: {
      ...(typeof parameters.reasoning_effort === 'string'
        ? { reasoning_effort: parameters.reasoning_effort }
        : {}),
      ...(typeof parameters.max_output_tokens === 'number'
        ? { max_output_tokens: parameters.max_output_tokens }
        : {}),
      ...(typeof parameters.temperature === 'number'
        ? { temperature: parameters.temperature }
        : {}),
    },
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

const getPublished = async (db: SupabaseRest, digestDate: string) => {
  const rows = await db.select<EditionRow>(
    'digest_editions',
    query({
      select: 'id,digest_date,source_run_id,status,version',
      digest_date: `eq.${digestDate}`,
      status: 'eq.published',
      limit: '1',
    }),
  )
  return rows[0] ?? null
}

const getAutomatedRun = async (db: SupabaseRest, digestDate: string) => {
  const rows = await db.select<RunRow>(
    'digest_runs',
    query({
      select: 'id,status,digest_date,parsed_output,events',
      digest_date: `eq.${digestDate}`,
      workflow_run_id: `eq.systemd:${digestDate}`,
      order: 'created_at.desc',
      limit: '1',
    }),
  )
  return rows[0] ?? null
}

const getPrompt = async (db: SupabaseRest) => {
  const rows = await db.select<PromptRow>(
    'digest_prompt_versions',
    query({
      select: '*',
      model: 'eq.anthropic/claude-opus-5.5',
      order: 'version.desc',
      limit: '1',
    }),
  )
  if (!rows[0])
    throw new Error('No anthropic/claude-opus-5.5 digest prompt is configured')
  return mapPrompt(rows[0])
}

const getContinuity = async (
  db: SupabaseRest,
  digestDate: string,
): Promise<DigestContinuityContext[]> => {
  const rows = await db.select<EditionRow>(
    'digest_editions',
    query({
      select: 'content,digest_date,id,source_run_id,status,version',
      status: 'eq.published',
      digest_date: `lt.${digestDate}`,
      order: 'digest_date.desc,version.desc',
      limit: '7',
    }),
  )
  return rows.flatMap(({ digest_date: priorDate, content }) =>
    content
      ? [
          {
            digestDate: priorDate,
            executiveSummary: content.executiveSummary,
            storyTitles: content.stories.map(({ title }) => title),
            keywords: content.keywords,
          },
        ]
      : [],
  )
}

const sumTokens = (
  attempts: DigestGenerationResponse[],
  key: 'inputTokens' | 'outputTokens' | 'totalTokens',
) => {
  const values = attempts.map((attempt) => attempt[key])
  return values.every((value): value is number => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null
}

export async function generateValidated(input: {
  runId: string
  digestDate: string
  windowStart: string
  windowEnd: string
  candidates: EnrichedDigestCandidate[]
  prompt: DigestPromptVersion
  renderedPrompt: string
  onAttempt?: (attempts: DigestGenerationResponse[]) => Promise<void>
}) {
  const attempts: DigestGenerationResponse[] = []
  let lastError = ''
  let rejectedOutput: unknown = null
  let model = input.prompt.model

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const userPrompt =
      attempt === 1
        ? input.renderedPrompt
        : `${input.renderedPrompt}\n\nREPAIR THE REJECTED RESPONSE\nThe previous JSON was rejected by the deterministic receiver: ${lastError}\nReturn one corrected JSON object only. Do not add Markdown or prose. Preserve grounded content while fixing every validation error. Shorten overlong fields by rewriting complete sentences; never truncate them.\n\nREQUIRED JSON SCHEMA\n${JSON.stringify(DIGEST_JSON_SCHEMA)}\n\nREJECTED RESPONSE\n${JSON.stringify(rejectedOutput)}`
    const request = {
      runId: input.runId,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt,
      reasoningEffort: input.prompt.parameters.reasoning_effort,
      maxOutputTokens: input.prompt.parameters.max_output_tokens,
      temperature: attempt === 1 ? input.prompt.parameters.temperature : 0,
    }
    let generated = await generateDigestWithModel({ ...request, model })
    attempts.push(generated)
    await input.onAttempt?.(attempts)
    if (
      isContentFiltered(generated) &&
      model !== DIGEST_CONTENT_FILTER_FALLBACK_MODEL
    ) {
      log('content filter; retrying with fallback model', {
        attempt,
        from: model,
        to: DIGEST_CONTENT_FILTER_FALLBACK_MODEL,
      })
      model = DIGEST_CONTENT_FILTER_FALLBACK_MODEL
      generated = await generateDigestWithModel({ ...request, model })
      attempts.push(generated)
      await input.onAttempt?.(attempts)
    }
    rejectedOutput = generated.output
    try {
      if (generated.outputError) throw new Error(generated.outputError)
      const content = assembleDigestEditionContent({
        runId: input.runId,
        digestDate: input.digestDate,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        allCandidateCount: input.candidates.length,
        enrichedCandidates: input.candidates,
        modelOutput: generated.output,
      })
      return { attempts, content, generated }
    } catch (error) {
      lastError = describeError(error)
      log('model output rejected', { attempt, error: lastError })
      if (attempt === 2) throw error
    }
  }
  throw new Error(lastError || 'Digest generation failed')
}

export async function publishCompletedRun(
  db: SupabaseRest,
  run: RunRow,
  digestDate: string,
) {
  if (!run.parsed_output) throw new Error('Completed run has no parsed output')
  const alreadyPublished = await getPublished(db, digestDate)
  if (alreadyPublished) {
    return { status: 'already-published', edition: alreadyPublished }
  }

  const existingDrafts = await db.select<EditionRow>(
    'digest_editions',
    query({
      select: 'id,digest_date,source_run_id,status,version,content',
      source_run_id: `eq.${run.id}`,
      status: 'eq.draft',
      order: 'version.desc',
      limit: '1',
    }),
  )
  let draft = existingDrafts[0]
  if (!draft) {
    const latest = await db.select<EditionRow>(
      'digest_editions',
      query({
        select: 'id,digest_date,source_run_id,status,version',
        digest_date: `eq.${digestDate}`,
        order: 'version.desc',
        limit: '1',
      }),
    )
    ;[draft] = await db.insert<EditionRow>('digest_editions', {
      digest_date: digestDate,
      version: (latest[0]?.version ?? 0) + 1,
      status: 'draft',
      source_run_id: run.id,
      content: run.parsed_output,
      created_by: null,
    })
  }
  if (!draft?.content) throw new Error('Digest draft content is unavailable')
  const frozenContent = await snapshotDigestTrends(draft.content)
  if (frozenContent !== draft.content) {
    const updated = await db.update<EditionRow>(
      'digest_editions',
      query({ id: `eq.${draft.id}`, status: 'eq.draft' }),
      { content: frozenContent },
    )
    if (!updated.length)
      throw new Error('Digest draft changed before trends were saved')
  }
  const published = await db.rpc<EditionRow>('publish_digest_edition', {
    p_edition_id: draft.id,
  })
  return { status: 'published', edition: published }
}

export async function publishNightlyDigest(
  options: {
    digestDate?: string
    dryRun?: boolean
  } = {},
) {
  const digestDate = options.digestDate ?? getLatestCompletedDigestDate()
  const dryRun = options.dryRun === true
  const db = new SupabaseRest()
  const window = getDigestDateWindow(digestDate)

  if (!dryRun) {
    const published = await getPublished(db, digestDate)
    if (published) {
      log('digest already published; skipping', {
        digestDate,
        editionId: published.id,
      })
      return { status: 'already-published', edition: published }
    }
    const existing = await getAutomatedRun(db, digestDate)
    if (existing?.status === 'completed') {
      const result = await publishCompletedRun(db, existing, digestDate)
      log('completed run publication recovered', {
        digestDate,
        runId: existing.id,
        status: result.status,
      })
      return result
    }
    if (existing) {
      throw new Error(
        `Automated run ${existing.id} already exists with status ${existing.status}`,
      )
    }
  }

  const [prompt, snapshot, priorDigests] = await Promise.all([
    getPrompt(db),
    loadDigestCandidates(window.windowEnd, false),
    getContinuity(db, digestDate),
  ])
  if (snapshot.candidates.length < 3) {
    throw new Error(
      `Only ${snapshot.candidates.length} digest candidates were found`,
    )
  }
  const { enrichedCandidates, failedFetches } = await enrichDigestCandidates(
    snapshot.candidates,
    window,
  )
  const runId = crypto.randomUUID()
  const startedAt = new Date()
  let events: DigestRunEvent[] = [
    event(
      'candidates',
      'completed',
      `Saved ${digestDate} candidates from all authors, with Community Archive authors marked for preference.`,
      {
        automation: !dryRun,
        candidate_count: snapshot.candidates.length,
        community_authored_count: snapshot.communityAuthoredCount,
        interaction_fallback_count: snapshot.fallbackCount,
        qualifying_banger_count: snapshot.bangerCount,
      },
    ),
    event(
      'commentary',
      'completed',
      'Saved thread, quote-post and reply context for the candidates.',
      {
        failed_fetches: failedFetches,
        commentary_count: enrichedCandidates.reduce(
          (sum, candidate) => sum + candidate.commentary.length,
          0,
        ),
      },
    ),
  ]
  const renderedPrompt = renderDigestPrompt(prompt.userPromptTemplate, {
    ...window,
    candidates: enrichedCandidates,
    priorDigests,
  })

  if (!dryRun) {
    await db.insert<RunRow>('digest_runs', {
      id: runId,
      digest_date: digestDate,
      status: 'running',
      prompt_version_id: prompt.id,
      window_start: window.windowStart,
      window_end: window.windowEnd,
      candidates: snapshot.candidates,
      workflow_run_id: `systemd:${digestDate}`,
      events,
      started_at: startedAt.toISOString(),
      created_by: null,
      model: prompt.model,
      model_request: {
        promptVersion: prompt,
        renderedUserPrompt: renderedPrompt,
        candidateSnapshot: enrichedCandidates,
        continuityContext: priorDigests,
      },
    })
  }

  log('generation started', {
    digestDate,
    dryRun,
    runId,
    candidateCount: snapshot.candidates.length,
    communityAuthoredCount: snapshot.communityAuthoredCount,
    model: prompt.model,
  })

  try {
    const result = await generateValidated({
      runId,
      ...window,
      candidates: enrichedCandidates,
      prompt,
      renderedPrompt,
      onAttempt: dryRun
        ? undefined
        : async (attempts) => {
            const latest = attempts[attempts.length - 1]
            await db.update(
              'digest_runs',
              query({ id: `eq.${runId}`, status: 'eq.running' }),
              {
                raw_response: {
                  attempts: attempts.map(({ response }) => response),
                },
                response_id: latest.responseId,
                input_tokens: sumTokens(attempts, 'inputTokens'),
                output_tokens: sumTokens(attempts, 'outputTokens'),
                total_tokens: sumTokens(attempts, 'totalTokens'),
                updated_at: new Date().toISOString(),
              },
            )
          },
    })
    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()
    events = [
      ...events,
      event('generation', 'completed', 'Validated structured digest output.', {
        attempts: result.attempts.length,
        duration_ms: durationMs,
        story_count: result.content.stories.length,
      }),
    ]

    if (dryRun) {
      log('dry-run validated; no database writes made', {
        digestDate,
        attempts: result.attempts.length,
        durationMs,
        storyCount: result.content.stories.length,
        communityBangersPublished: result.content.stories.reduce(
          (sum, story) =>
            sum +
            story.bangers.filter(({ communityAuthored }) => communityAuthored)
              .length,
          0,
        ),
      })
      return { status: 'dry-run', content: result.content }
    }

    const [completedRun] = await db.update<RunRow>(
      'digest_runs',
      query({ id: `eq.${runId}`, status: 'eq.running' }),
      {
        status: 'completed',
        raw_response: {
          attempts: result.attempts.map(({ response }) => response),
        },
        parsed_output: result.content,
        response_id: result.generated.responseId,
        model: result.generated.model,
        input_tokens: sumTokens(result.attempts, 'inputTokens'),
        output_tokens: sumTokens(result.attempts, 'outputTokens'),
        total_tokens: sumTokens(result.attempts, 'totalTokens'),
        duration_ms: durationMs,
        error: null,
        completed_at: completedAt.toISOString(),
        updated_at: completedAt.toISOString(),
        events,
      },
    )
    if (!completedRun)
      throw new Error('Digest run could not be marked completed')
    const publication = await publishCompletedRun(db, completedRun, digestDate)
    await db.update<RunRow>('digest_runs', query({ id: `eq.${runId}` }), {
      events: [
        ...events,
        event(
          'edition',
          'completed',
          'Systemd automation published the digest.',
          {
            automation: true,
            edition_id: publication.edition.id,
          },
        ),
      ],
      updated_at: new Date().toISOString(),
    })
    log('digest published', {
      digestDate,
      runId,
      editionId: publication.edition.id,
      version: publication.edition.version,
      attempts: result.attempts.length,
    })
    return publication
  } catch (error) {
    const message = describeError(error)
    if (!dryRun) {
      const completedAt = new Date()
      await db.update<RunRow>(
        'digest_runs',
        query({ id: `eq.${runId}`, status: 'eq.running' }),
        {
          status: 'failed',
          error: message.slice(0, 4_000),
          duration_ms: completedAt.getTime() - startedAt.getTime(),
          completed_at: completedAt.toISOString(),
          updated_at: completedAt.toISOString(),
          events: [
            ...events,
            event('generation', 'failed', message.slice(0, 360)),
          ],
        },
      )
    }
    throw error
  }
}

/** Retry infrastructure failures through the date-idempotent entry point. */
export async function publishNightlyDigestWithRetries(
  options: Parameters<typeof publishNightlyDigest>[0] = {},
) {
  // Resolve once so a delayed retry cannot switch to another editorial date.
  const digestDate = options.digestDate ?? getLatestCompletedDigestDate()
  const delays = options.dryRun ? [] : [60_000, 300_000]
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await publishNightlyDigest({ ...options, digestDate })
    } catch (error) {
      const message = describeError(error)
      const transient =
        /^(ClickHouse analytics|Supabase) request failed \((429|5\d\d)\)/.test(
          message,
        ) ||
        (error instanceof Error &&
          (error.name === 'TimeoutError' ||
            /^(fetch failed|Failed to fetch|The socket connection was closed unexpectedly)/i.test(
              message,
            )))
      const delayMs = delays[attempt]
      if (!transient || delayMs === undefined) throw error
      log('publisher retry scheduled', {
        digestDate,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        delayMs,
        error: message,
      })
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

if (process.argv[1]?.endsWith('/nightly-digest/publish.ts')) {
  const args = process.argv.slice(2)
  const dateIndex = args.indexOf('--date')
  const digestDate =
    dateIndex >= 0 ? args[dateIndex + 1] : getLatestCompletedDigestDate()

  publishNightlyDigestWithRetries({
    digestDate,
    dryRun: args.includes('--dry-run'),
  }).catch((error) => {
    log('publisher failed', {
      digestDate,
      error: describeError(error),
    })
    process.exitCode = 1
  })
}
