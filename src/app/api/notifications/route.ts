import { privateJson, searchAlertsUser } from '@/lib/searchAlerts/access'
import {
  countUnreadNotifications,
  listNotifications,
} from '@/lib/searchAlerts/store'

export const dynamic = 'force-dynamic'

/**
 * The bell's data. `?view=count` returns only the unread count (one head-only
 * count query); the default also lists the most recent notifications.
 */
export async function GET(request: Request) {
  const { user, response } = await searchAlertsUser()
  if (response) return response
  const view = new URL(request.url).searchParams.get('view')
  if (view === 'count') {
    return privateJson({ unreadCount: await countUnreadNotifications(user.id) })
  }
  const notifications = await listNotifications(user.id)
  return privateJson({
    notifications,
    unreadCount: notifications.filter((n) => !n.readAt).length,
  })
}
