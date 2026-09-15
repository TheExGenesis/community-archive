import 'server-only'
import { getAdminClient } from './data'

export const DIGEST_SUBSCRIBERS_PAGE_SIZE = 50

export async function loadDigestSubscribers(page = 1) {
  const admin = await getAdminClient()
  const safePage =
    Number.isSafeInteger(page) && page > 0 && page <= 1_000_000 ? page : 1
  const offset = (safePage - 1) * DIGEST_SUBSCRIBERS_PAGE_SIZE
  const { data, count, error } = await admin
    .from('digest_email_subscriptions')
    .select('id, email, confirmed_at', { count: 'exact' })
    .not('confirmed_at', 'is', null)
    .is('unsubscribed_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(offset, offset + DIGEST_SUBSCRIBERS_PAGE_SIZE - 1)
  if (error) throw error
  if (count === null) throw new Error('Digest subscribers unavailable')
  return { rows: data ?? [], total: count, page: safePage }
}
