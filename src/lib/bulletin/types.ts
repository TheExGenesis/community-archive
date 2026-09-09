import type { Database } from '@/database-types'

export type Opportunity = Omit<
  Database['public']['Functions']['get_bulletin_opportunities']['Returns'][number],
  'full_text' | 'model'
>
export type RunCounts = Partial<
  Record<
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
>
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
  help: 'Help',
  feedback: 'Feedback',
  intro: 'Introductions',
  free: 'Free things',
  invite: 'Invitations',
  opportunity: 'Opportunities',
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
