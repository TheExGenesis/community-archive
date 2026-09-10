import type { Database } from '@/database-types'

export type Opportunity = Omit<
  Database['public']['Functions']['get_bulletin_opportunities']['Returns'][number],
  'full_text' | 'model' | 'expires_at' | 'place'
> & {
  /** Current, policy-checked ClickHouse text for immediate card rendering. */
  preview_text?: string
  expires_at: string | null
  place: string | null
  account_created_at?: string | null
  display_name?: string
  avatar_url?: string | null
  replies?: number
  quotes?: number
  reply_account_ids?: string[]
  renewed_at?: string | null
}
export type RunCounts = Partial<
  Record<
    | 'eligible_originals'
    | 'rows_seen'
    | 'candidates_seen'
    | 'calls'
    | 'positive'
    | 'negative'
    | 'failed'
    | 'suppressed'
    | 'pending',
    number
  >
> & {
  source?: string
  window_start?: string
  window_end?: string
  scan_key?: string
}
export type BulletinRun = {
  id: string
  started_at: string
  finished_at: string | null
  status: string
  counts: RunCounts
  model: string
  prompt_version_id?: string | null
  prompt_body?: string | null
  classifier_version: string
  actual_usd: number
  unpriced_reserved_usd: number
}
export type RunDashboard = {
  preview_note?: string
  runs: BulletinRun[]
  queue: { pending: number; retrying: number; exhausted: number }
  last_success_at: string | null
}

export const KIND_LABELS: Record<string, string> = {
  free: 'Free things',
  opportunity: 'Work & collaboration',
  invite: 'Invitations',
  intro: 'Introductions',
  help: 'Help',
  feedback: 'Feedback',
}
export const RESPONSE_LABELS: Record<string, string> = {
  dm: 'Send a DM',
  reply: 'Reply to the post',
  link: 'Follow the link in the post',
  like: 'Like the post',
  unknown: 'Check the original post',
}
export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
export function formatTimestamp(value: string | null) {
  return value
    ? new Date(value).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : '—'
}
export function runStatus(run: BulletinRun) {
  if (
    run.status === 'running' &&
    Date.now() - Date.parse(run.started_at) > 25 * 60 * 1000
  )
    return 'Stopped reporting'
  const labels: Record<string, string> = {
    ok: 'Complete',
    running: 'Running',
    interrupted: 'Interrupted',
    classification_failed: 'Some decisions failed',
    pending_review: 'Work remaining',
    intake_backlog: 'Scan incomplete',
    time_limit: 'Time limit reached',
    budget_limit: 'Budget limit reached',
    enqueued_only: 'Scan only',
    oversize_candidate: 'Post too long',
  }
  return labels[run.status] ?? 'Failed'
}

export type PromptVersion = {
  id: string
  body: string
  note: string
  created_at: string | null
  created_by: string | null
}
export type PromptDashboard = {
  active: PromptVersion
  versions: PromptVersion[]
  read_only?: boolean
  preview_note?: string
}
export type PromptSaveResult = { error?: string; version?: string }

export type BulletinFilters = {
  kind: string
  side: string
  search: string
  past: boolean
  recommended: boolean
}
export type BulletinPage = {
  opportunities: Opportunity[]
  counts: Record<string, number>
  cursors: Record<string, string | null>
  total: number
  now: number
  personal: {
    account_id: string
    username: string
    outgoing: Record<string, number>
    available: boolean
  }
}
export const BULLETIN_PAGE_SIZE = 4
export const DEFAULT_BULLETIN_FILTERS: BulletinFilters = {
  kind: 'all',
  side: 'all',
  search: '',
  past: false,
  recommended: true,
}
