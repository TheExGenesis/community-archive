import 'server-only'

import { createServerServiceRoleClient } from '@/utils/supabase'

/** The email lists one subscription can be on. */
export type DigestEmailList = 'daily' | 'weekly'

export const isDigestEmailList = (value: unknown): value is DigestEmailList =>
  value === 'daily' || value === 'weekly'

const LIST_COLUMN = {
  daily: 'daily_enabled',
  weekly: 'weekly_enabled',
} as const

/** Public aggregate only: never fetch addresses or unsubscribe tokens here. */
export async function getActiveDigestSubscriberCount(
  list: DigestEmailList = 'daily',
): Promise<number> {
  const { count, error } = await createServerServiceRoleClient()
    .from('digest_email_subscriptions')
    .select('id', { count: 'exact', head: true })
    .not('confirmed_at', 'is', null)
    .is('unsubscribed_at', null)
    .eq(LIST_COLUMN[list], true)
  if (error) throw error
  if (count === null) throw new Error('Digest subscriber count unavailable')
  return count
}

export interface DigestEmailSubscription {
  id: string
  email: string
  token: string
  accountId: string | null
  confirmedAt: string | null
  unsubscribedAt: string | null
  daily: boolean
  weekly: boolean
}

interface SubscriptionRow {
  id: string
  email: string
  token: string
  account_id: string | null
  confirmed_at: string | null
  unsubscribed_at: string | null
  daily_enabled: boolean
  weekly_enabled: boolean
}

const SUBSCRIPTION_COLUMNS =
  'id, email, token, account_id, confirmed_at, unsubscribed_at, daily_enabled, weekly_enabled'

const mapRow = (row: SubscriptionRow): DigestEmailSubscription => ({
  id: row.id,
  email: row.email,
  token: row.token,
  accountId: row.account_id,
  confirmedAt: row.confirmed_at,
  unsubscribedAt: row.unsubscribed_at,
  daily: row.daily_enabled,
  weekly: row.weekly_enabled,
})

/** Whether a subscription currently receives a list's emails. */
export const receivesList = (
  subscription: DigestEmailSubscription,
  list: DigestEmailList,
) =>
  Boolean(subscription.confirmedAt) &&
  !subscription.unsubscribedAt &&
  subscription[list]

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
 * Create or revive the subscription for an address and turn `list` on.
 * Single opt-in: confirmed_at is stamped on insert, on revival of an
 * unsubscribed row, and on any legacy row still waiting on the old
 * confirmation link. Reviving an unsubscribed address turns on only the
 * requested list; an active address keeps its other list as it was.
 */
export async function upsertSubscription(
  email: string,
  accountId?: string | null,
  list: DigestEmailList = 'daily',
): Promise<DigestEmailSubscription> {
  const normalized = normalizeSubscriptionEmail(email)
  const admin = createServerServiceRoleClient({ readSource: 'app' })
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
      daily_enabled?: boolean
      weekly_enabled?: boolean
    } = {}
    if (existing.data.unsubscribed_at) {
      patch.unsubscribed_at = null
      patch.daily_enabled = list === 'daily'
      patch.weekly_enabled = list === 'weekly'
    } else if (!existing.data[LIST_COLUMN[list]]) {
      patch[LIST_COLUMN[list]] = true
    }
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
      daily_enabled: list === 'daily',
      weekly_enabled: list === 'weekly',
    })
    .select(SUBSCRIPTION_COLUMNS)
    .single()
  if (inserted.error) throw inserted.error
  return mapRow(inserted.data)
}

/** Prefer an active subscription; an explicit id must still belong to the account. */
export async function getSubscriptionForAccount(
  accountId: string,
  subscriptionId?: string,
): Promise<DigestEmailSubscription | null> {
  const admin = createServerServiceRoleClient({ readSource: 'app' })
  let query = admin
    .from('digest_email_subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('account_id', accountId)
  if (subscriptionId) query = query.eq('id', subscriptionId)
  const result = await query
    .order('unsubscribed_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data ? mapRow(result.data) : null
}

/**
 * Stop emails for a token. Without `list` every email stops; with a list only
 * that list turns off, and the whole subscription ends once no list is left.
 * Returns false only for an unknown token; unsubscribing twice succeeds.
 */
export async function unsubscribe(
  token: string,
  list?: DigestEmailList,
): Promise<boolean> {
  const admin = createServerServiceRoleClient()
  if (!list) {
    const result = await admin
      .from('digest_email_subscriptions')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('token', token)
      .select('id')
      .maybeSingle()
    if (result.error) throw result.error
    return Boolean(result.data)
  }
  const existing = await admin
    .from('digest_email_subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('token', token)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (!existing.data) return false
  await setListEnabled(mapRow(existing.data), list, false)
  return true
}

/**
 * Turn one list on or off for a subscription. Turning the last list off ends
 * the subscription; turning a list on for an ended one revives it with only
 * that list.
 */
export async function setListEnabled(
  subscription: DigestEmailSubscription,
  list: DigestEmailList,
  enabled: boolean,
): Promise<DigestEmailSubscription> {
  const other: DigestEmailList = list === 'daily' ? 'weekly' : 'daily'
  const patch: {
    daily_enabled?: boolean
    weekly_enabled?: boolean
    unsubscribed_at?: string | null
    confirmed_at?: string
  } = { [LIST_COLUMN[list]]: enabled }
  if (enabled && subscription.unsubscribedAt) {
    patch.unsubscribed_at = null
    patch[LIST_COLUMN[other]] = false
    patch.confirmed_at = new Date().toISOString()
  } else if (enabled && !subscription.confirmedAt) {
    patch.confirmed_at = new Date().toISOString()
  } else if (!enabled && !subscription[other] && !subscription.unsubscribedAt) {
    patch.unsubscribed_at = new Date().toISOString()
  }
  const result = await createServerServiceRoleClient({ readSource: 'app' })
    .from('digest_email_subscriptions')
    .update(patch)
    .eq('id', subscription.id)
    .select(SUBSCRIPTION_COLUMNS)
    .single()
  if (result.error) throw result.error
  return mapRow(result.data)
}

/**
 * Daily-list subscribers (confirmed_at set, not unsubscribed) not yet sent
 * this edition.
 */
export async function listUnsentRecipients(
  editionId: string,
): Promise<DigestEmailSubscription[]> {
  return listUnsent('daily', editionId)
}

/** Weekly-list subscribers not yet sent this weekly edition. */
export async function listUnsentWeeklyRecipients(
  editionId: string,
): Promise<DigestEmailSubscription[]> {
  return listUnsent('weekly', editionId)
}

async function listUnsent(
  list: DigestEmailList,
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
      .eq(LIST_COLUMN[list], true)
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
      .from(
        list === 'daily' ? 'digest_email_sends' : 'digest_weekly_email_sends',
      )
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
  openToken: string,
): Promise<void> {
  const admin = createServerServiceRoleClient()
  const result = await admin.from('digest_email_sends').insert({
    edition_id: editionId,
    subscription_id: subscriptionId,
    message_id: messageId,
    open_token: openToken,
  })
  if (result.error) throw result.error
}

export async function recordWeeklySend(
  editionId: string,
  subscriptionId: string,
  messageId: string,
): Promise<void> {
  const result = await createServerServiceRoleClient()
    .from('digest_weekly_email_sends')
    .insert({
      edition_id: editionId,
      subscription_id: subscriptionId,
      message_id: messageId,
    })
  if (result.error) throw result.error
}

/** Aggregate for the private digest lab; no recipient data leaves this helper. */
export async function getDigestEmailOpenStats(editionId: string) {
  const admin = createServerServiceRoleClient()
  const [sent, opened] = await Promise.all([
    admin
      .from('digest_email_sends')
      .select('edition_id', { count: 'exact', head: true })
      .eq('edition_id', editionId),
    admin
      .from('digest_email_sends')
      .select('edition_id', { count: 'exact', head: true })
      .eq('edition_id', editionId)
      .not('opened_at', 'is', null),
  ])
  if (sent.error) throw sent.error
  if (opened.error) throw opened.error
  return { sent: sent.count ?? 0, opened: opened.count ?? 0 }
}
