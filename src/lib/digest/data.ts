import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { publicDataConfig } from '@/lib/publicDataSource'
import { measureServerRead } from '@/lib/performance/server'
import { cookies } from 'next/headers'
import type { Json } from '@/database-types'
import {
  createDigestAdminClient,
  createDigestReadClient,
  createDigestPublicClient,
  type DigestEditionRow,
  type DigestPromptVersionRow,
  type DigestRunRow,
} from './database'
import {
  isRecord,
  parseDigestCandidates,
  parseDigestEditionContent,
  parseDigestRunEvents,
  type DigestCalendarDay,
  type DigestEdition,
  type DigestEditionStatus,
  type DigestPreview,
  type DigestPromptVersion,
  type DigestRun,
  type DigestRunStatus,
} from './types'
import { getPreviewDigestEdition } from './mock'
import { getCurrentUser } from '@/lib/portal/auth'
import { mergeDigestCalendarDays } from './archive'

const RUN_STATUSES = new Set<DigestRunStatus>([
  'candidates_ready',
  'running',
  'completed',
  'failed',
])
const EDITION_STATUSES = new Set<DigestEditionStatus>([
  'draft',
  'published',
  'archived',
])

export const toJson = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json

export function mapPromptVersion(
  row: DigestPromptVersionRow,
): DigestPromptVersion {
  const parameters = isRecord(row.parameters) ? row.parameters : {}
  return {
    id: row.id,
    version: Number(row.version),
    label: row.label,
    systemPrompt: row.system_prompt,
    userPromptTemplate: row.user_prompt_template,
    model: row.model,
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

export function mapDigestRun(row: DigestRunRow): DigestRun {
  const status = RUN_STATUSES.has(row.status as DigestRunStatus)
    ? (row.status as DigestRunStatus)
    : 'failed'
  const events = parseDigestRunEvents(row.events)
  const eventWorkflowRunId = [...events]
    .reverse()
    .map(({ metadata }) => metadata?.workflow_run_id)
    .find((value): value is string => typeof value === 'string')
  return {
    id: row.id,
    digestDate: row.digest_date,
    status,
    promptVersionId: row.prompt_version_id,
    parentRunId: row.parent_run_id,
    revisionInstruction: row.revision_instruction,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    candidates: parseDigestCandidates(row.candidates),
    modelRequest: isRecord(row.model_request) ? row.model_request : null,
    rawResponse: isRecord(row.raw_response) ? row.raw_response : null,
    parsedOutput: parseDigestEditionContent(row.parsed_output),
    events,
    responseId: row.response_id,
    workflowRunId: row.workflow_run_id ?? eventWorkflowRunId ?? null,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    durationMs: row.duration_ms,
    error: row.error,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  }
}

export function mapDigestEdition(row: DigestEditionRow): DigestEdition | null {
  const content = parseDigestEditionContent(row.content)
  if (!content) return null
  const status = EDITION_STATUSES.has(row.status as DigestEditionStatus)
    ? (row.status as DigestEditionStatus)
    : null
  if (!status) return null
  return {
    id: row.id,
    issueNumber: Number(row.issue_number),
    digestDate: row.digest_date,
    version: row.version,
    status,
    sourceRunId: row.source_run_id,
    content,
    createdBy: row.created_by,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }
}

export async function loadDigestLabState(runId?: string) {
  const admin = createDigestAdminClient()
  const [promptResult, runsResult, editionsResult] = await Promise.all([
    admin
      .from('digest_prompt_versions')
      .select('*')
      .order('version', { ascending: false }),
    admin
      .from('digest_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('digest_editions')
      .select('*')
      .order('digest_date', { ascending: false })
      .order('version', { ascending: false })
      .limit(100),
  ])

  if (promptResult.error) throw promptResult.error
  if (runsResult.error) throw runsResult.error
  if (editionsResult.error) throw editionsResult.error

  const prompts = (promptResult.data ?? []).map(mapPromptVersion)
  const runs = (runsResult.data ?? []).map(mapDigestRun)
  const editions = (editionsResult.data ?? []).flatMap((row) => {
    const edition = mapDigestEdition(row)
    return edition ? [edition] : []
  })
  const activeRun = runs.find((run) => run.id === runId) ?? runs[0] ?? null

  return {
    prompts,
    runs,
    editions,
    activeRun,
    generationConfigured: Boolean(
      process.env.OPENROUTER_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.DEEPSEEK_API_KEY,
    ),
  }
}

export const PUBLISHED_DIGEST_TAG = 'published-digests'

// Read the small publication pointer fresh. An opt-out archives/tombstones a
// saved edition in PostgreSQL; a shared body cache must never revive that copy.
const cachedPublishedDigest = unstable_cache(
  async (
    id: string,
    updatedAt: string,
    _source: string,
  ): Promise<DigestEdition | null> => {
    const { data, error } = await createDigestReadClient()
      .from('digest_editions')
      .select('*')
      .eq('status', 'published')
      .eq('id', id)
      .eq('updated_at', updatedAt)
      .maybeSingle()
    if (error) throw new Error('Published digest is temporarily unavailable')
    return data ? mapDigestEdition(data) : null
  },
  ['published-digest-body-v2'],
  { revalidate: 300, tags: [PUBLISHED_DIGEST_TAG] },
)

async function readPublishedEditions(
  digestDate: string | undefined,
  offset: number,
  limit: number,
): Promise<DigestEdition[]> {
  let query = createDigestReadClient()
    .from('digest_editions')
    .select('id,updated_at')
    .eq('status', 'published')
    .order('digest_date', { ascending: false })
    .range(offset, offset + limit - 1)
  if (digestDate) query = query.eq('digest_date', digestDate)
  const { data, error } = await query
  if (error) throw new Error('Published digest is temporarily unavailable')
  const source = publicDataConfig().sourceId
  const editions = await Promise.all(
    (data ?? []).map((row) =>
      cachedPublishedDigest(row.id, row.updated_at, source),
    ),
  )
  return editions.filter(
    (edition): edition is DigestEdition => edition !== null,
  )
}

export async function getPublishedDigestEditions(offset: number, limit = 2) {
  return measureServerRead('digest.editions', () =>
    readPublishedEditions(undefined, offset, limit),
  )
}

async function readPublishedDigest(
  digestDate?: string,
  options: { strict?: boolean } = {},
): Promise<DigestEdition | null> {
  const preview = getPreviewDigestEdition(digestDate)
  if (preview) return preview
  try {
    const editions = await measureServerRead('digest.edition', () =>
      readPublishedEditions(digestDate, 0, 1),
    )
    return editions[0] ?? null
  } catch (error) {
    if (options.strict)
      throw new Error('Published digest is temporarily unavailable')
    console.error('Published digest read failed:', error)
    return getPreviewDigestEdition(digestDate)
  }
}

// Next supplies request-local cache in RSC; plain React 18 test runtimes do not.
const requestCache = cache ?? ((loader: typeof readPublishedDigest) => loader)
export const getPublishedDigest = requestCache(readPublishedDigest)

export interface DigestLikeState {
  count: number
  likedByViewer: boolean
}

/**
 * Public like count for an edition plus whether the current session already
 * liked it. Preview fixtures are not real rows, so they report an empty state.
 */
export async function getDigestLikeState(
  edition: DigestEdition | null,
): Promise<DigestLikeState> {
  const empty = { count: 0, likedByViewer: false }
  if (!edition || edition.isPreview) return empty

  const client = createDigestPublicClient(await cookies())
  const user = await getCurrentUser()

  const [countResult, likedResult] = await Promise.all([
    createDigestReadClient()
      .from('digest_edition_likes')
      .select('*', { count: 'exact', head: true })
      .eq('edition_id', edition.id),
    user
      ? client
          .from('digest_edition_likes')
          .select('id')
          .eq('edition_id', edition.id)
          .eq('user_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (countResult.error) {
    console.error('Digest like count read failed:', countResult.error.message)
    return empty
  }

  return {
    count: countResult.count ?? 0,
    likedByViewer: Boolean(likedResult.data),
  }
}

/**
 * Server-rendered comment count for the initial paint. The list itself is
 * fetched client-side so the page's 5 minute revalidate cannot stale it.
 */
export async function getDigestCommentCount(
  edition: DigestEdition | null,
): Promise<number> {
  if (!edition || edition.isPreview) return 0

  const { count, error } = await createDigestReadClient()
    .from('digest_edition_comments')
    .select('*', { count: 'exact', head: true })
    .eq('edition_id', edition.id)
    .is('deleted_at', null)

  if (error) {
    console.error('Digest comment count read failed:', error.message)
    return 0
  }
  return count ?? 0
}

export async function getLatestDigestPreview(): Promise<DigestPreview | null> {
  const edition = await getPublishedDigest()
  if (!edition) return null
  return {
    href: `/digest/${edition.digestDate}`,
    digestDate: edition.digestDate,
    headline: edition.content.executiveSummary[0] ?? '',
    storyCount: edition.content.stories.length,
    stories: edition.content.stories.slice(0, 3).map((story) => ({
      slug: story.slug,
      // Older saved editions predate categories; the keyword is the fallback label.
      tag: story.category ?? story.keyword,
      title: story.title,
      blurb: story.subtitle,
    })),
    isPreview: edition.isPreview,
  }
}

export async function listPublishedDigestDays(): Promise<DigestCalendarDay[]> {
  const preview = getPreviewDigestEdition()
  const client = createDigestReadClient()
  const published: DigestCalendarDay[] = []
  const pageSize = 1_000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('digest_editions')
      .select('digest_date')
      .eq('status', 'published')
      .order('digest_date', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('Digest calendar read failed:', error.message)
      return mergeDigestCalendarDays(
        published,
        preview ? { digestDate: preview.digestDate, isPreview: true } : null,
      )
    }

    const rows = data ?? []
    published.push(
      ...rows.map(({ digest_date }) => ({ digestDate: digest_date })),
    )
    if (rows.length < pageSize) break
  }

  return mergeDigestCalendarDays(
    published,
    preview ? { digestDate: preview.digestDate, isPreview: true } : null,
  )
}
