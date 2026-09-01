import 'server-only'

import { createServerServiceRoleClient } from '@/utils/supabase'

export interface DigestEmailSubscription {
  id: string
  email: string
  token: string
  confirmedAt: string | null
  unsubscribedAt: string | null
}

interface SubscriptionRow {
  id: string
  email: string
  token: string
  confirmed_at: string | null
  unsubscribed_at: string | null
}

const mapRow = (row: SubscriptionRow): DigestEmailSubscription => ({
  id: row.id,
  email: row.email,
  token: row.token,
  confirmedAt: row.confirmed_at,
  unsubscribedAt: row.unsubscribed_at,
})

export const normalizeSubscriptionEmail = (email: string) =>
  email.trim().toLowerCase()

export const isValidSubscriptionEmail = (email: string) => {
  const normalized = normalizeSubscriptionEmail(email)
  return (
    normalized.length >= 3 &&
    normalized.length <= 320 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)
  )
}

/**
 * Create or revive the subscription for an address and return it. Called only
 * from the subscribe endpoint, so a previously unsubscribed address returns to
 * pending (never straight to confirmed) and gets a fresh confirmation email.
 */
export async function upsertSubscription(
  email: string,
): Promise<DigestEmailSubscription> {
  const normalized = normalizeSubscriptionEmail(email)
  const admin = createServerServiceRoleClient()
  const existing = await admin
    .from('digest_email_subscriptions')
    .select('id, email, token, confirmed_at, unsubscribed_at')
    .eq('email', normalized)
    .maybeSingle()
  if (existing.error) throw existing.error

  if (existing.data) {
    if (!existing.data.unsubscribed_at) return mapRow(existing.data)
    const revived = await admin
      .from('digest_email_subscriptions')
      .update({ unsubscribed_at: null, confirmed_at: null })
      .eq('id', existing.data.id)
      .select('id, email, token, confirmed_at, unsubscribed_at')
      .single()
    if (revived.error) throw revived.error
    return mapRow(revived.data)
  }

  const inserted = await admin
    .from('digest_email_subscriptions')
    .insert({ email: normalized })
    .select('id, email, token, confirmed_at, unsubscribed_at')
    .single()
  if (inserted.error) throw inserted.error
  return mapRow(inserted.data)
}

/** Returns the confirmed subscription, or null for an unknown/unsubscribed token. */
export async function confirmSubscription(
  token: string,
): Promise<DigestEmailSubscription | null> {
  const admin = createServerServiceRoleClient()
  const result = await admin
    .from('digest_email_subscriptions')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('token', token)
    .is('unsubscribed_at', null)
    .select('id, email, token, confirmed_at, unsubscribed_at')
    .maybeSingle()
  if (result.error) throw result.error
  return result.data ? mapRow(result.data) : null
}

/** Returns false only for an unknown token; unsubscribing twice succeeds. */
export async function unsubscribe(token: string): Promise<boolean> {
  const admin = createServerServiceRoleClient()
  const result = await admin
    .from('digest_email_subscriptions')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('token', token)
    .select('id')
    .maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data)
}

/** Confirmed, not unsubscribed, and not yet sent this edition. */
export async function listUnsentRecipients(
  editionId: string,
): Promise<DigestEmailSubscription[]> {
  // PostgREST caps result sets, so both reads paginate with stable ordering.
  const admin = createServerServiceRoleClient()
  const PAGE = 1000

  const subscriptions: SubscriptionRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await admin
      .from('digest_email_subscriptions')
      .select('id, email, token, confirmed_at, unsubscribed_at')
      .not('confirmed_at', 'is', null)
      .is('unsubscribed_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (page.error) throw page.error
    subscriptions.push(...page.data)
    if (page.data.length < PAGE) break
  }

  const alreadySent = new Set<string>()
  for (let offset = 0; ; offset += PAGE) {
    const page = await admin
      .from('digest_email_sends')
      .select('subscription_id')
      .eq('edition_id', editionId)
      .order('subscription_id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (page.error) throw page.error
    for (const row of page.data) alreadySent.add(row.subscription_id)
    if (page.data.length < PAGE) break
  }

  return subscriptions.filter((row) => !alreadySent.has(row.id)).map(mapRow)
}

export async function recordSend(
  editionId: string,
  subscriptionId: string,
  messageId: string,
): Promise<void> {
  const admin = createServerServiceRoleClient()
  const result = await admin.from('digest_email_sends').insert({
    edition_id: editionId,
    subscription_id: subscriptionId,
    message_id: messageId,
  })
  if (result.error) throw result.error
}
