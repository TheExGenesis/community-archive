import type { Json } from '@/database-types'
import { getAdminClient } from './data'

const RECENT_ACTIVITY_LIMIT = 10
const RECENT_OPT_OUT_CANDIDATE_LIMIT = 100

const SELF_SERVICE_DELETE_ACTIONS = [
  'delete_archive',
  'delete_all_archives',
  'opt_out_and_delete',
] as const

export type ArchiveDeleteStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'recorded'
  | 'unknown'

export type RecentArchiveDelete = {
  id: string
  accountId: string | null
  username: string | null
  source: 'Admin worker' | 'Self-service log'
  status: ArchiveDeleteStatus
  activityAt: string
  requestedAt: string
  detail: string
  reason: string | null
  error: string | null
}

export type RecentOptOut = {
  id: string
  accountId: string | null
  username: string
  occurredAt: string
  reason: string | null
}

export type RecentPrivacyActivity = {
  archiveDeletes: RecentArchiveDelete[]
  optOuts: RecentOptOut[]
  warning: string | null
}

function metadataValue(metadata: Json | null, key: string): string | null {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
    return null
  }
  const value = metadata[key]
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  return null
}

function normalizeJobStatus(value: string): ArchiveDeleteStatus {
  switch (value.toUpperCase()) {
    case 'QUEUED':
      return 'queued'
    case 'PROCESSING':
      return 'processing'
    case 'DONE':
      return 'succeeded'
    case 'FAILED':
      return 'failed'
    default:
      return 'unknown'
  }
}

function selfServiceDeleteDetail(
  actionType: string,
  metadata: Json | null,
): string {
  if (actionType === 'delete_archive') {
    const archiveId = metadataValue(metadata, 'archive_upload_id')
    return archiveId
      ? `Deleted archive upload #${archiveId}`
      : 'Deleted one archive upload'
  }
  if (actionType === 'opt_out_and_delete') {
    return 'Deleted all archive data and explicitly opted out'
  }
  return 'Deleted all archive data'
}

const timeValue = (value: string) => {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function loadRecentPrivacyActivity(): Promise<RecentPrivacyActivity> {
  const admin = await getAdminClient()

  const [jobsResponse, actionLogResponse, optOutResponse] = await Promise.all([
    admin.rpc('admin_list_recent_delete_jobs', {
      p_limit: RECENT_ACTIVITY_LIMIT,
    }),
    admin
      .from('user_action_log')
      .select('id, account_id, action_type, metadata, created_at')
      .in('action_type', [...SELF_SERVICE_DELETE_ACTIONS])
      .order('created_at', { ascending: false })
      .limit(RECENT_ACTIVITY_LIMIT),
    admin
      .from('optin')
      .select(
        'id, username, twitter_user_id, opt_out_reason, opted_out_at, updated_at, created_at',
      )
      .eq('explicit_optout', true)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(RECENT_OPT_OUT_CANDIDATE_LIMIT),
  ])

  const warnings: string[] = []
  if (jobsResponse.error) {
    warnings.push(
      `Could not read admin delete jobs: ${jobsResponse.error.message}`,
    )
  }
  if (actionLogResponse.error) {
    warnings.push(
      `Could not read self-service delete history: ${actionLogResponse.error.message}`,
    )
  }
  if (optOutResponse.error) {
    warnings.push(
      `Could not read explicit opt-outs: ${optOutResponse.error.message}`,
    )
  }

  // Some admin-created opt-out rows predate opted_out_at being populated on
  // INSERT, so sort by the best available timestamp after fetching recent
  // updated candidates instead of putting all NULL opted_out_at rows last.
  const optOutCandidates: RecentOptOut[] = (optOutResponse.data ?? []).map(
    (row) => ({
      id: row.id,
      accountId: row.twitter_user_id,
      username: row.username,
      occurredAt: row.opted_out_at ?? row.updated_at ?? row.created_at ?? '',
      reason: row.opt_out_reason,
    }),
  )
  const optOuts = [...optOutCandidates]
    .sort((a, b) => timeValue(b.occurredAt) - timeValue(a.occurredAt))
    .slice(0, RECENT_ACTIVITY_LIMIT)

  const usernamesByAccountId = new Map(
    optOutCandidates
      .filter((row) => row.accountId)
      .map((row) => [row.accountId as string, row.username]),
  )

  const adminDeletes: RecentArchiveDelete[] = (jobsResponse.data ?? []).map(
    (row) => ({
      id: `job:${row.job_key}`,
      accountId: row.account_id,
      username: row.username,
      source: 'Admin worker',
      status: normalizeJobStatus(row.status),
      activityAt: row.updated_at,
      requestedAt: row.created_at,
      detail: `Delete job ${row.job_key.slice(0, 8)}`,
      reason: row.reason,
      error: row.error,
    }),
  )

  const selfServiceDeletes: RecentArchiveDelete[] = (
    actionLogResponse.data ?? []
  ).map((row) => ({
    id: `action:${row.id}`,
    accountId: row.account_id,
    username: row.account_id
      ? (usernamesByAccountId.get(row.account_id) ?? null)
      : null,
    source: 'Self-service log',
    // user_action_log is written by the browser after a successful RPC, but
    // it is not a server-side deletion receipt. Label it as recorded rather
    // than claiming the database independently verified completion.
    status: 'recorded',
    activityAt: row.created_at,
    requestedAt: row.created_at,
    detail: selfServiceDeleteDetail(row.action_type, row.metadata),
    reason: null,
    error: null,
  }))

  return {
    archiveDeletes: [...adminDeletes, ...selfServiceDeletes]
      .sort((a, b) => timeValue(b.activityAt) - timeValue(a.activityAt))
      .slice(0, RECENT_ACTIVITY_LIMIT),
    optOuts,
    warning: warnings.length ? warnings.join(' ') : null,
  }
}
