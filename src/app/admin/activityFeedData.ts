import 'server-only'
import { z } from 'zod'
import { getAdminClient } from './data'
import {
  ACTIVITY_KINDS,
  type ActivityEvent,
  type ActivityPage,
} from './activityTypes'

const inputSchema = z.object({
  kind: z.union([z.enum(ACTIVITY_KINDS), z.literal('')]).default(''),
  search: z.string().trim().max(64).default(''),
  cursor: z
    .object({
      id: z
        .string()
        .regex(/^(upload|optin|optout|job|action):[a-z0-9-]+$/)
        .max(100),
      occurred_at: z.string().datetime({ offset: true }).nullable(),
    })
    .nullable()
    .default(null),
})
export const ACTIVITY_PAGE_SIZE = 25
export async function loadActivityPage(
  input: unknown = {},
): Promise<ActivityPage> {
  // Authorize each page, including filter changes and infinite-scroll requests.
  const admin = await getAdminClient()
  const { kind, search, cursor } = inputSchema.parse(input)
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
