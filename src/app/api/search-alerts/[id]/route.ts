import { privateJson, searchAlertsUser } from '@/lib/searchAlerts/access'
import { deleteSearchAlert, updateSearchAlert } from '@/lib/searchAlerts/store'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Context) {
  const { user, response } = await searchAlertsUser()
  if (response) return response
  const { id } = await params
  if (!UUID.test(id))
    return privateJson({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.emailEnabled !== 'boolean') {
    return privateJson(
      { error: 'emailEnabled must be true or false.' },
      { status: 400 },
    )
  }
  const alert = await updateSearchAlert(user.id, id, {
    emailEnabled: body.emailEnabled,
  })
  if (!alert) return privateJson({ error: 'Not found' }, { status: 404 })
  return privateJson({ alert })
}

export async function DELETE(_request: Request, { params }: Context) {
  const { user, response } = await searchAlertsUser()
  if (response) return response
  const { id } = await params
  if (!UUID.test(id))
    return privateJson({ error: 'Not found' }, { status: 404 })
  const deleted = await deleteSearchAlert(user.id, id)
  if (!deleted) return privateJson({ error: 'Not found' }, { status: 404 })
  return privateJson({ deleted: true })
}
