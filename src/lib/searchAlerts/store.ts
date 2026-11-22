import 'server-only'

import { createServerServiceRoleClient } from '@/utils/supabase'
import type { SearchAlertInput, SearchAlertMode } from './input'

// Every read and write here goes through the service-role client and is
// scoped to a user id the caller has already verified. Reads stay on this
// app's own database even where staging reads production corpus data.
const db = () => createServerServiceRoleClient({ readSource: 'app' })

export interface SearchAlert {
  id: string
  query: string
  mode: SearchAlertMode
  fromUser: string | null
  emailEnabled: boolean
  lastCheckedAt: string
  createdAt: string
}

interface SearchAlertRow {
  id: string
  query: string
  mode: string
  from_user: string | null
  email_enabled: boolean
  last_checked_at: string
  created_at: string
}

const ALERT_COLUMNS =
  'id, query, mode, from_user, email_enabled, last_checked_at, created_at'

const mapAlert = (row: SearchAlertRow): SearchAlert => ({
  id: row.id,
  query: row.query,
  mode: row.mode === 'phrase' ? 'phrase' : 'all',
  fromUser: row.from_user,
  emailEnabled: row.email_enabled,
  lastCheckedAt: row.last_checked_at,
  createdAt: row.created_at,
})

export async function listSearchAlerts(userId: string): Promise<SearchAlert[]> {
  const { data, error } = await db()
    .from('search_alerts')
    .select(ALERT_COLUMNS)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) throw error
  return (data ?? []).map(mapAlert)
}

export type CreateSearchAlertResult =
  | { ok: true; alert: SearchAlert; created: boolean }
  | { ok: false; reason: 'cap' }

const isCapError = (error: { message?: string; hint?: string }) =>
  error.hint === 'search_alert_cap' ||
  /search alert limit reached/.test(error.message ?? '')

export async function createSearchAlert(
  userId: string,
  input: SearchAlertInput & { emailEnabled: boolean },
): Promise<CreateSearchAlertResult> {
  const client = db()
  const existing = await client
    .from('search_alerts')
    .select(ALERT_COLUMNS)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .ilike(
      'query',
      input.query.replace(/[\\%_]/g, (c) => `\\${c}`),
    )
    .eq('mode', input.mode)
  if (existing.error) throw existing.error
  const same = (existing.data ?? []).find(
    (row) => (row.from_user ?? null) === input.fromUser,
  )
  if (same) return { ok: true, alert: mapAlert(same), created: false }

  // The database trigger enforces the cap of 10 live alerts atomically.
  const { data, error } = await client
    .from('search_alerts')
    .insert({
      user_id: userId,
      query: input.query,
      mode: input.mode,
      from_user: input.fromUser,
      email_enabled: input.emailEnabled,
    })
    .select(ALERT_COLUMNS)
    .single()
  if (error) {
    if (isCapError(error)) return { ok: false, reason: 'cap' }
    throw error
  }
  return { ok: true, alert: mapAlert(data), created: true }
}

export async function updateSearchAlert(
  userId: string,
  alertId: string,
  patch: { emailEnabled: boolean },
): Promise<SearchAlert | null> {
  const { data, error } = await db()
    .from('search_alerts')
    .update({
      email_enabled: patch.emailEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', alertId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select(ALERT_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data ? mapAlert(data) : null
}

/** Soft-deletes an alert and clears its unread notification. */
export async function deleteSearchAlert(
  userId: string,
  alertId: string,
): Promise<boolean> {
  const client = db()
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('search_alerts')
    .update({ deleted_at: now, updated_at: now, email_enabled: false })
    .eq('id', alertId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) return false
  const cleared = await client
    .from('notifications')
    .update({ read_at: now })
    .eq('alert_id', alertId)
    .eq('user_id', userId)
    .is('read_at', null)
  if (cleared.error) throw cleared.error
  return true
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface SearchAlertNotification {
  id: string
  kind: 'search_alert'
  alertId: string
  query: string
  mode: SearchAlertMode
  fromUser: string | null
  count: number
  tweetIds: string[]
  /** When the first match of this unread batch was recorded. */
  firstMatchedAt: string
  createdAt: string
  updatedAt: string
  readAt: string | null
}

interface NotificationRow {
  id: string
  kind: string
  alert_id: string | null
  payload: unknown
  created_at: string
  updated_at: string
  read_at: string | null
  search_alerts: Pick<SearchAlertRow, 'query' | 'mode' | 'from_user'> | null
}

const NOTIFICATION_COLUMNS =
  'id, kind, alert_id, payload, created_at, updated_at, read_at, search_alerts(query, mode, from_user)'

function mapNotification(row: NotificationRow): SearchAlertNotification | null {
  if (row.kind !== 'search_alert' || !row.alert_id || !row.search_alerts) {
    return null
  }
  const payload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Record<string, unknown>)
      : {}
  const count = Number(payload.count)
  return {
    id: row.id,
    kind: 'search_alert',
    alertId: row.alert_id,
    query: row.search_alerts.query,
    mode: row.search_alerts.mode === 'phrase' ? 'phrase' : 'all',
    fromUser: row.search_alerts.from_user,
    count: Number.isSafeInteger(count) && count > 0 ? count : 0,
    tweetIds: Array.isArray(payload.tweetIds)
      ? payload.tweetIds.filter(
          (id): id is string => typeof id === 'string' && /^\d{1,20}$/.test(id),
        )
      : [],
    firstMatchedAt:
      typeof payload.firstMatchedAt === 'string'
        ? payload.firstMatchedAt
        : row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readAt: row.read_at,
  }
}

export async function countUnreadNotifications(
  userId: string,
): Promise<number> {
  const { count, error } = await db()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function listNotifications(
  userId: string,
  limit = 20,
): Promise<SearchAlertNotification[]> {
  const { data, error } = await db()
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as NotificationRow[]).flatMap((row) => {
    const mapped = mapNotification(row)
    return mapped ? [mapped] : []
  })
}

export async function getNotification(
  userId: string,
  id: string,
): Promise<SearchAlertNotification | null> {
  const { data, error } = await db()
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? mapNotification(data as unknown as NotificationRow) : null
}

/** Marks the given notifications (or every unread one) read; returns how many. */
export async function markNotificationsRead(
  userId: string,
  ids: string[] | 'all',
): Promise<number> {
  let query = db()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
  if (ids !== 'all') query = query.in('id', ids)
  const { data, error } = await query.select('id')
  if (error) throw error
  return data?.length ?? 0
}

// ─── Match log ──────────────────────────────────────────────────────────────

export interface MatchedTweetRef {
  id: string
  replyToId: string | null
  createdAt: string
}

interface MatchRow {
  tweet_id: string
  reply_to_tweet_id: string | null
  tweet_created_at: string
}

const mapMatch = (row: MatchRow): MatchedTweetRef => ({
  id: row.tweet_id,
  replyToId: row.reply_to_tweet_id,
  createdAt: row.tweet_created_at,
})

/** Tweets first recorded for an alert at or after a time, newest tweet first. */
export async function listAlertMatches(
  userId: string,
  alertId: string,
  recordedSince: string,
  limit = 50,
): Promise<MatchedTweetRef[]> {
  const { data, error } = await db()
    .from('search_alert_matches')
    .select('tweet_id, reply_to_tweet_id, tweet_created_at')
    .eq('user_id', userId)
    .eq('alert_id', alertId)
    .gte('created_at', recordedSince)
    .order('tweet_created_at', { ascending: false })
    .order('tweet_id', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(mapMatch)
}

// ─── Matching cron ──────────────────────────────────────────────────────────

/**
 * How long the match log keeps a tweet. It must outlast the cron's lookback
 * window (7 days, see SEARCH_ALERT_LOOKBACK_DAYS): a tweet still inside the
 * window was recorded after it was created, so less than 8 days ago, and its
 * row is still here to stop it from being reported again.
 */
export const MATCH_LOG_RETENTION_DAYS = 30

export interface CheckableAlert {
  id: string
  userId: string
  query: string
  mode: SearchAlertMode
  fromUser: string | null
  lastCheckedAt: string
  /** History floor: tweets created before this are never reported. */
  createdAt: string
}

/** Live alerts, least recently checked first. */
export async function listCheckableAlerts(
  limit = 2000,
): Promise<CheckableAlert[]> {
  const { data, error } = await db()
    .from('search_alerts')
    .select('id, user_id, query, mode, from_user, last_checked_at, created_at')
    .is('deleted_at', null)
    .order('last_checked_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    query: row.query,
    mode: row.mode === 'phrase' ? 'phrase' : 'all',
    fromUser: row.from_user,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
  }))
}

export const recordedKey = (alertId: string, tweetId: string) =>
  `${alertId}:${tweetId}`

/** Which of these (alert, tweet) pairs are already in the match log. */
export async function listRecordedTweets(
  alertIds: string[],
  tweetIds: string[],
): Promise<Set<string>> {
  const recorded = new Set<string>()
  if (alertIds.length === 0 || tweetIds.length === 0) return recorded
  const { data, error } = await db()
    .from('search_alert_matches')
    .select('alert_id, tweet_id')
    .in('alert_id', alertIds)
    .in('tweet_id', tweetIds)
    .limit(alertIds.length * tweetIds.length)
  if (error) throw error
  for (const row of data ?? []) {
    recorded.add(recordedKey(row.alert_id, row.tweet_id))
  }
  return recorded
}

/**
 * Records a check: inserts the tweets not yet logged for the alert (never
 * ones created before it), updates its unread notification, and returns how
 * many were new (-1 when the alert was deleted meanwhile).
 */
export async function recordSearchAlertCheck(input: {
  alertId: string
  checkedAt: string
  tweets: MatchedTweetRef[]
}): Promise<number> {
  const { data, error } = await db().rpc('record_search_alert_check', {
    p_alert_id: input.alertId,
    p_checked_at: input.checkedAt,
    p_tweets: input.tweets as never,
  })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/** Notes a failed check; the next run searches the same window again. */
export async function recordSearchAlertFailure(
  alertIds: string[],
  message: string,
): Promise<void> {
  const { error } = await db()
    .from('search_alerts')
    .update({
      last_error: message.slice(0, 500),
      last_error_at: new Date().toISOString(),
    })
    .in('id', alertIds)
  if (error) throw error
}

/** Drops match log rows older than MATCH_LOG_RETENTION_DAYS. */
export async function pruneSearchAlertMatches(
  olderThanDays = MATCH_LOG_RETENTION_DAYS,
) {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString()
  const { error } = await db()
    .from('search_alert_matches')
    .delete()
    .lt('created_at', cutoff)
  if (error) throw error
}

// ─── Daily email ────────────────────────────────────────────────────────────

/** Unsent matches older than this are never emailed. */
export const EMAIL_MATCH_MAX_AGE_DAYS = 7

/** Users with unsent matches on email-enabled alerts. */
export async function listSearchAlertEmailUsers(
  limit = 500,
): Promise<string[]> {
  const since = new Date(
    Date.now() - EMAIL_MATCH_MAX_AGE_DAYS * 86_400_000,
  ).toISOString()
  const users = new Set<string>()
  const pageSize = 1000
  for (let offset = 0; users.size < limit; offset += pageSize) {
    const { data, error } = await db()
      .from('search_alert_matches')
      .select('id, user_id, search_alerts!inner(email_enabled, deleted_at)')
      .is('email_send_id', null)
      .gt('created_at', since)
      .eq('search_alerts.email_enabled', true)
      .is('search_alerts.deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    for (const row of data ?? []) users.add(row.user_id)
    if (!data || data.length < pageSize) break
  }
  return Array.from(users).slice(0, limit)
}

/** Claims a user's unsent matches for one email; null when there are none. */
export async function claimSearchAlertEmail(
  userId: string,
): Promise<string | null> {
  const { data, error } = await db().rpc('claim_search_alert_email', {
    p_user_id: userId,
    p_max_age: `${EMAIL_MATCH_MAX_AGE_DAYS} days`,
  })
  if (error) throw error
  return typeof data === 'string' ? data : null
}

export interface ClaimedAlertMatches {
  alertId: string
  query: string
  mode: SearchAlertMode
  fromUser: string | null
  count: number
  /** Creation time of the oldest match: the search link's start date. */
  since: string
  tweets: MatchedTweetRef[]
}

/** The claimed matches of one send, grouped by alert. */
export async function loadClaimedMatches(
  sendId: string,
): Promise<{ unsubscribeToken: string; alerts: ClaimedAlertMatches[] }> {
  const client = db()
  const [send, matches] = await Promise.all([
    client
      .from('search_alert_email_sends')
      .select('unsubscribe_token')
      .eq('id', sendId)
      .single(),
    client
      .from('search_alert_matches')
      .select(
        'alert_id, tweet_id, reply_to_tweet_id, tweet_created_at, search_alerts(query, mode, from_user)',
      )
      .eq('email_send_id', sendId)
      .order('tweet_created_at', { ascending: false })
      .order('tweet_id', { ascending: false })
      .limit(1000),
  ])
  if (send.error) throw send.error
  if (matches.error) throw matches.error
  const byAlert = new Map<string, ClaimedAlertMatches>()
  for (const row of (matches.data ?? []) as unknown as Array<
    MatchRow & {
      alert_id: string
      search_alerts: Pick<SearchAlertRow, 'query' | 'mode' | 'from_user'> | null
    }
  >) {
    if (!row.search_alerts) continue
    const entry = byAlert.get(row.alert_id) ?? {
      alertId: row.alert_id,
      query: row.search_alerts.query,
      mode: row.search_alerts.mode === 'phrase' ? 'phrase' : 'all',
      fromUser: row.search_alerts.from_user,
      count: 0,
      since: row.tweet_created_at,
      tweets: [],
    }
    entry.count += 1
    if (row.tweet_created_at < entry.since) entry.since = row.tweet_created_at
    entry.tweets.push(mapMatch(row))
    byAlert.set(row.alert_id, entry)
  }
  return {
    unsubscribeToken: send.data.unsubscribe_token,
    alerts: Array.from(byAlert.values()).sort((a, b) => b.count - a.count),
  }
}

export async function completeSearchAlertEmail(
  sendId: string,
  messageId: string,
): Promise<void> {
  const { error } = await db()
    .from('search_alert_email_sends')
    .update({
      status: 'sent',
      message_id: messageId,
      sent_at: new Date().toISOString(),
    })
    .eq('id', sendId)
  if (error) throw error
}

/** Deletes an unsent claim so its matches go out with the next run. */
export async function releaseSearchAlertEmail(sendId: string): Promise<void> {
  const { error } = await db()
    .from('search_alert_email_sends')
    .delete()
    .eq('id', sendId)
    .eq('status', 'sending')
  if (error) throw error
}

/** The account's auth email, or null when it has none. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await db().auth.admin.getUserById(userId)
  if (error) throw error
  return data.user?.email || null
}

/** One-click unsubscribe: turns email off for every alert of the token's user. */
export async function disableSearchAlertEmailByToken(
  token: string,
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false
  const client = db()
  const { data, error } = await client
    .from('search_alert_email_sends')
    .select('user_id')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  if (error) throw error
  if (!data) return false
  const updated = await client
    .from('search_alerts')
    .update({ email_enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', data.user_id)
    .eq('email_enabled', true)
  if (updated.error) throw updated.error
  return true
}
