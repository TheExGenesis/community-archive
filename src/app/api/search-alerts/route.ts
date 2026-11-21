import { privateJson, searchAlertsUser } from '@/lib/searchAlerts/access'
import {
  MAX_SEARCH_ALERTS_PER_USER,
  parseSearchAlertInput,
} from '@/lib/searchAlerts/input'
import { createSearchAlert, listSearchAlerts } from '@/lib/searchAlerts/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, response } = await searchAlertsUser()
  if (response) return response
  const alerts = await listSearchAlerts(user.id)
  return privateJson({ alerts, limit: MAX_SEARCH_ALERTS_PER_USER })
}

export async function POST(request: Request) {
  const { user, response } = await searchAlertsUser()
  if (response) return response
  const body = await request.json().catch(() => null)
  const parsed = parseSearchAlertInput(body)
  if (!parsed.ok) return privateJson({ error: parsed.error }, { status: 400 })
  const emailEnabled =
    body && typeof body === 'object' && 'emailEnabled' in body
      ? (body as { emailEnabled: unknown }).emailEnabled === true
      : false
  const result = await createSearchAlert(user.id, {
    ...parsed.value,
    emailEnabled,
  })
  if (!result.ok) {
    return privateJson(
      {
        error: `You can keep up to ${MAX_SEARCH_ALERTS_PER_USER} search alerts. Delete one in settings to add another.`,
      },
      { status: 409 },
    )
  }
  return privateJson(
    { alert: result.alert, created: result.created },
    { status: result.created ? 201 : 200 },
  )
}
