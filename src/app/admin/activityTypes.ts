export const ACTIVITY_KINDS = [
  'archive_upload',
  'opt_in',
  'opt_out',
  'archive_delete',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  archive_upload: 'Archive upload',
  opt_in: 'Opt-in',
  opt_out: 'Opt-out',
  archive_delete: 'Archive deletion',
}
export type ActivityEvent = {
  id: string
  kind: ActivityKind
  occurred_at: string | null
  account_id: string | null
  username: string | null
  status: string
  detail: string
  reason: string | null
  error: string | null
  date_basis: string
}
export type ActivityCursor = Pick<ActivityEvent, 'id' | 'occurred_at'>
export type ActivityFilters = { kind: ActivityKind | ''; search: string }
export type ActivityPage = {
  events: ActivityEvent[]
  nextCursor: ActivityCursor | null
}
