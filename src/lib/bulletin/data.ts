import 'server-only'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/portal/auth'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { getAdminClient, requireAdmin, checkIsAdmin } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import type { Opportunity, RunDashboard } from './types'

export const OPPORTUNITY_LIMIT = 200
export const RUN_PAGE_SIZE = 25

export async function requireOpportunityUser() {
  if ((await getLocalAdminPreview()) === 'admin') return null
  // Member-preview cookies never authorize reads. The explicit loopback-only
  // local admin read preview follows the same convention as Birdseye.
  const user = await getCurrentUser()
  if (!user || user.is_anonymous) redirect('/login?redirect=/opportunities')
  return user
}
export async function loadOpportunities(): Promise<Opportunity[]> {
  await requireOpportunityUser()
  const { data, error } = await createServerServiceRoleClient().rpc(
    'get_bulletin_opportunities',
    { max_results: OPPORTUNITY_LIMIT },
  )
  if (error) throw new Error('Opportunities could not be loaded')
  return (data ?? []).map(
    ({ full_text: _text, model: _model, ...notice }) => notice,
  )
}
export async function isBulletinAdmin() {
  return (await getLocalAdminPreview()) === 'admin' || (await checkIsAdmin())
}
export async function requireBulletinAdmin() {
  if ((await getLocalAdminPreview()) !== 'admin')
    await requireAdmin('/admin/opportunities')
}
export async function loadRunDashboard(before?: string): Promise<RunDashboard> {
  const localPreview = (await getLocalAdminPreview()) === 'admin'
  if (localPreview && process.env.BULLETIN_LOCAL_RUN_PREVIEW_URL) {
    const url = new URL(process.env.BULLETIN_LOCAL_RUN_PREVIEW_URL)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
      throw new Error('Invalid local preview URL')
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error('Local run snapshot unavailable')
    return response.json() as Promise<RunDashboard>
  }
  const admin = localPreview
    ? createServerServiceRoleClient()
    : await getAdminClient()
  const beforeId = before === undefined ? undefined : Number(before)
  if (
    before !== undefined &&
    (!/^\d+$/.test(before) || !Number.isSafeInteger(beforeId) || beforeId! < 1)
  )
    throw new Error('Invalid run cursor')
  const { data, error } = await admin.rpc('get_bulletin_runs', {
    before_id: beforeId,
    max_results: RUN_PAGE_SIZE + 1,
  })
  if (error || !data) throw new Error('Run history could not be loaded')
  return data as unknown as RunDashboard
}
