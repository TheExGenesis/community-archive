import 'server-only'
import { getAdminClient } from './data'
import {
  ACTIVITY_KINDS,
  type ActivityEvent,
  type ActivityPage,
  type ActivityCursor,
  type ActivityKind,
} from './activityTypes'

function parseInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid activity filters')
  const value = input as Record<string, unknown>
  const kind = value.kind ?? ''
  if (kind !== '' && !ACTIVITY_KINDS.includes(kind as ActivityKind))
    throw new Error('Invalid activity type')
  if (value.search !== undefined && typeof value.search !== 'string')
    throw new Error('Invalid account search')
  const search = ((value.search as string | undefined) ?? '').trim()
  if (search.length > 64) throw new Error('Account search is too long')
  let cursor: ActivityCursor | null = null
  if (value.cursor !== undefined && value.cursor !== null) {
    if (typeof value.cursor !== 'object' || Array.isArray(value.cursor))
      throw new Error('Invalid activity cursor')
    const { id, occurred_at: date } = value.cursor as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      id.length > 100 ||
      !/^(upload|optin|optout|job|action):[a-z0-9-]+$/.test(id)
    )
      throw new Error('Invalid activity cursor')
    if (
      date !== null &&
      (typeof date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          date,
        ) ||
        !Number.isFinite(Date.parse(date)))
    )
      throw new Error('Invalid activity cursor date')
    cursor = { id, occurred_at: date as string | null }
  }
  return { kind: kind as ActivityKind | '', search, cursor }
}
export const ACTIVITY_PAGE_SIZE = 25
export async function loadActivityPage(
  input: unknown = {},
): Promise<ActivityPage> {
  // Authorize each page, including filter changes and infinite-scroll requests.
  const admin = await getAdminClient()
  const { kind, search, cursor } = parseInput(input)
  const { data, error } = await admin.rpc('admin_activity_page', {
    p_kind: kind || undefined,
    p_search: search,
    p_before_at: cursor?.occurred_at ?? undefined,
    p_before_id: cursor?.id,
    p_limit: ACTIVITY_PAGE_SIZE + 1,
  })
  if (error) {
    console.error('Admin activity read failed:', error)
    throw new Error('Activity could not be loaded. Please try again.')
  }
  const rows = (data ?? []) as ActivityEvent[]
  const events = rows.slice(0, ACTIVITY_PAGE_SIZE)
  const last = events[events.length - 1]
  return {
    events,
    nextCursor:
      rows.length > ACTIVITY_PAGE_SIZE && last
        ? { id: last.id, occurred_at: last.occurred_at }
        : null,
  }
}
