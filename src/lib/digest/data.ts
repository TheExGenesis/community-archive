import { cookies } from 'next/headers'
import type { Json } from '@/database-types'
import {
  createDigestAdminClient,
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
  type DigestEdition,
  type DigestEditionStatus,
  type DigestPreview,
  type DigestPromptVersion,
  type DigestRun,
  type DigestRunStatus,
} from './types'
import { getPreviewDigestEdition } from './mock'

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
    },
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export function mapDigestRun(row: DigestRunRow): DigestRun {
  const status = RUN_STATUSES.has(row.status as DigestRunStatus)
    ? (row.status as DigestRunStatus)
    : 'failed'
  return {
    id: row.id,
    digestDate: row.digest_date,
    status,
    promptVersionId: row.prompt_version_id,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    candidates: parseDigestCandidates(row.candidates),
    modelRequest: isRecord(row.model_request) ? row.model_request : null,
    rawResponse: isRecord(row.raw_response) ? row.raw_response : null,
    parsedOutput: parseDigestEditionContent(row.parsed_output),
    events: parseDigestRunEvents(row.events),
    responseId: row.response_id,
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
      .limit(30),
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
    generationConfigured: Boolean(process.env.OPENAI_API_KEY),
  }
}

export async function getPublishedDigest(
  digestDate?: string,
): Promise<DigestEdition | null> {
  const preview = getPreviewDigestEdition(digestDate)
  if (preview) return preview
  const client = createDigestPublicClient(cookies())
  let query = client
    .from('digest_editions')
    .select('*')
    .eq('status', 'published')
  query = digestDate
    ? query.eq('digest_date', digestDate)
    : query.order('digest_date', { ascending: false }).limit(1)
  const { data, error } = await query.maybeSingle()
  if (error) {
    console.error('Published digest read failed:', error.message)
    return getPreviewDigestEdition(digestDate)
  }
  return data ? mapDigestEdition(data) : getPreviewDigestEdition(digestDate)
}

export async function getLatestDigestPreview(): Promise<DigestPreview | null> {
  const edition = await getPublishedDigest()
  if (!edition) return null
  return {
    href: `/digest/${edition.digestDate}`,
    digestDate: edition.digestDate,
    executiveSummary: edition.content.executiveSummary.join(' '),
    storyCount: edition.content.stories.length,
    storyTitles: edition.content.stories.map((story) => story.title),
    isPreview: edition.isPreview,
  }
}

export async function listPublishedDigests(
  limit = 14,
): Promise<DigestEdition[]> {
  const preview = getPreviewDigestEdition()
  if (preview) return [preview]
  const client = createDigestPublicClient(cookies())
  const safeLimit = Math.max(1, Math.min(60, Math.trunc(limit)))
  const { data, error } = await client
    .from('digest_editions')
    .select('*')
    .eq('status', 'published')
    .order('digest_date', { ascending: false })
    .limit(safeLimit)
  if (error) {
    console.error('Digest archive read failed:', error.message)
    return []
  }
  const editions = (data ?? []).flatMap((row) => {
    const edition = mapDigestEdition(row)
    return edition ? [edition] : []
  })
  return editions
    .sort((left, right) => right.digestDate.localeCompare(left.digestDate))
    .slice(0, safeLimit)
}
