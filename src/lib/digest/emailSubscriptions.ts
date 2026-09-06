import 'server-only'

import { createServerServiceRoleClient } from '@/utils/supabase'

export interface DigestEmailSubscription {
  id: string
  email: string
  token: string
  accountId: string | null
  confirmedAt: string | null
  unsubscribedAt: string | null
}

interface SubscriptionRow {
  id: string
  email: string
  token: string
  account_id: string | null
  confirmed_at: string | null
  unsubscribed_at: string | null
}

const SUBSCRIPTION_COLUMNS =
  'id, email, token, account_id, confirmed_at, unsubscribed_at'

const mapRow = (row: SubscriptionRow): DigestEmailSubscription => ({
  id: row.id,
  email: row.email,
  token: row.token,
  accountId: row.account_id,
  confirmedAt: row.confirmed_at,
  unsubscribedAt: row.unsubscribed_at,
})

/** "christine@example.com" -> "ch•••••••@example.com" for read-back UI. */
export const maskSubscriptionEmail = (email: string) => {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

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
 * Create or revive the subscription for an address and return it active.
 * Single opt-in: confirmed_at is stamped on insert, on revival of an
 * unsubscribed row, and on any legacy row still waiting on the old
 * confirmation link.
 */
export async function upsertSubscription(
  email: string,
  accountId?: string | null,
): Promise<DigestEmailSubscription> {
  const normalized = normalizeSubscriptionEmail(email)
  const admin = createServerServiceRoleClient()
  const existing = await admin
    .from('digest_email_subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('email', normalized)
    .maybeSingle()
  if (existing.error) throw existing.error

  if (existing.data) {
    const patch: {
      unsubscribed_at?: null
      confirmed_at?: string
      account_id?: string
    } = {}
    if (existing.data.unsubscribed_at) patch.unsubscribed_at = null
    if (existing.data.unsubscribed_at || !existing.data.confirmed_at) {
      patch.confirmed_at = new Date().toISOString()
    }
    // Backfill the association, but never overwrite one account's claim on an
    // address with another's.
    if (accountId && !existing.data.account_id) patch.account_id = accountId
    if (Object.keys(patch).length === 0) return mapRow(existing.data)
    const updated = await admin
      .from('digest_email_subscriptions')
      .update(patch)
      .eq('id', existing.data.id)
      .select(SUBSCRIPTION_COLUMNS)
      .single()
    if (updated.error) throw updated.error
    return mapRow(updated.data)
  }

  const inserted = await admin
    .from('digest_email_subscriptions')
    .insert({
      email: normalized,
      account_id: accountId ?? null,
      confirmed_at: new Date().toISOString(),
    })
    .select(SUBSCRIPTION_COLUMNS)
    .single()
  if (inserted.error) throw inserted.error
  return mapRow(inserted.data)
}

/** The subscription linked to a signed-in account, newest first if several. */
export async function getSubscriptionForAccount(
  accountId: string,
): Promise<DigestEmailSubscription | null> {
  const admin = createServerServiceRoleClient()
  const result = await admin
    .from('digest_email_subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1)
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

/** Active (confirmed_at set), not unsubscribed, and not yet sent this edition. */
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
      .select(SUBSCRIPTION_COLUMNS)
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
