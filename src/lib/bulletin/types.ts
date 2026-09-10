import type { Database } from '@/database-types'

export type Notice = Omit<
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

/**
 * Chip order is deliberate: kinds where a response builds a connection come
 * first, and the one that is purely about receiving comes last.
 */
export const KIND_LABELS: Record<string, string> = {
  help: 'Help',
  intro: 'Introductions',
  invite: 'Invitations',
  feedback: 'Feedback',
  opportunity: 'Work & collaboration',
  free: 'Free things',
}
/** Phosphor icon name per kind; resolved in the client component. */
export const KIND_ICONS: Record<string, string> = {
  free: 'gift',
  opportunity: 'briefcase',
  invite: 'calendar',
  intro: 'users',
  help: 'hand-heart',
  feedback: 'chats',
}
/** Card label combining side and kind, indexed [offer, ask]. */
export const CARD_LABELS: Record<string, [string, string]> = {
  free: ['Free', 'Free wanted'],
  opportunity: ['Work offered', 'Work wanted'],
  invite: ['Invitation', 'Company wanted'],
  intro: ['Intro', 'Intro wanted'],
  help: ['Help', 'Help wanted'],
  feedback: ['Feedback', 'Feedback wanted'],
}
export function cardLabel(notice: { side: string; kind: string }) {
  const pair = CARD_LABELS[notice.kind]
  if (!pair) return notice.side === 'ask' ? 'Ask' : 'Offer'
  return pair[notice.side === 'ask' ? 1 : 0]
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
  /** 'all', or a sorted comma-separated set of kinds, e.g. 'feedback,help'. */
  kind: string
  side: string
  search: string
  past: boolean
  recommended: boolean
  ascending: boolean
}
export type BulletinPage = {
  notices: Notice[]
  counts: Record<string, number>
  cursors: Record<string, string | null>
  total: number
  now: number
  personal: {
    account_id: string
    username: string
    outgoing: Record<string, number>
    available: boolean
    /** Accounts the viewer follows / is followed by, from archive uploads. */
    following: string[]
    followers: string[]
  }
}
export function parseKinds(kind: string): string[] | null {
  if (kind === 'all') return []
  const parts = Array.from(new Set(kind.split(',').filter(Boolean))).sort()
  return parts.length && parts.every((k) => k in KIND_LABELS) ? parts : null
}
export function kindKey(kinds: string[]) {
  return kinds.length ? [...kinds].sort().join(',') : 'all'
}
export const BULLETIN_PAGE_SIZE = 18
export const DEFAULT_BULLETIN_FILTERS: BulletinFilters = {
  kind: 'all',
  side: 'all',
  search: '',
  past: false,
  recommended: true,
  ascending: false,
}
