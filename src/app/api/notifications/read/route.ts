import { privateJson, searchAlertsUser } from '@/lib/searchAlerts/access'
import { markNotificationsRead } from '@/lib/searchAlerts/store'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Body: {ids: string[]} or {all: true}. */
export async function POST(request: Request) {
  const { user, response } = await searchAlertsUser()
  if (response) return response
  const body = await request.json().catch(() => null)
  if (body?.all === true) {
    return privateJson({ updated: await markNotificationsRead(user.id, 'all') })
  }
  const ids = body?.ids
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 50 ||
    !ids.every((id: unknown) => typeof id === 'string' && UUID.test(id))
  ) {
    return privateJson(
      { error: 'Send {ids: [...]} (1–50 notification ids) or {all: true}.' },
      { status: 400 },
    )
  }
  return privateJson({ updated: await markNotificationsRead(user.id, ids) })
}
