/**
 * Shared, client-safe rules for search alerts: what a valid alert is and how
 * it maps onto the site's /search URL.
 */

export const MAX_SEARCH_ALERTS_PER_USER = 10
export const MAX_SEARCH_ALERT_QUERY_LENGTH = 200

export type SearchAlertMode = 'phrase' | 'all'

export interface SearchAlertInput {
  query: string
  mode: SearchAlertMode
  fromUser: string | null
}

/** The site search reads several words as a phrase and one word as a term. */
export const defaultSearchAlertMode = (query: string): SearchAlertMode =>
  query.trim().split(/\s+/).filter(Boolean).length > 1 ? 'phrase' : 'all'

/** "  \"open source\" " -> "open source" (the search page strips quotes too). */
export function normalizeSearchAlertQuery(raw: string): string {
  let query = raw.trim()
  if (query.length >= 2 && query.startsWith('"') && query.endsWith('"')) {
    query = query.slice(1, -1).trim()
  }
  return query.replace(/\s+/g, ' ')
}

export function normalizeSearchAlertFromUser(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().replace(/^@/, '').toLowerCase()
  return value || null
}

export type SearchAlertInputResult =
  | { ok: true; value: SearchAlertInput }
  | { ok: false; error: string }

export function parseSearchAlertInput(body: unknown): SearchAlertInputResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Send a JSON object.' }
  }
  const record = body as Record<string, unknown>
  if (typeof record.query !== 'string') {
    return { ok: false, error: 'query is required.' }
  }
  const query = normalizeSearchAlertQuery(record.query)
  if (!query) return { ok: false, error: 'query is required.' }
  if (query.length > MAX_SEARCH_ALERT_QUERY_LENGTH) {
    return {
      ok: false,
      error: `query must be ${MAX_SEARCH_ALERT_QUERY_LENGTH} characters or fewer.`,
    }
  }
  const mode =
    record.mode === undefined || record.mode === null
      ? defaultSearchAlertMode(query)
      : record.mode
  if (mode !== 'phrase' && mode !== 'all') {
    return { ok: false, error: 'mode must be "phrase" or "all".' }
  }
  const fromUser = normalizeSearchAlertFromUser(record.fromUser)
  if (fromUser && !/^[a-z0-9_]{1,15}$/.test(fromUser)) {
    return { ok: false, error: 'fromUser must be a valid username.' }
  }
  return { ok: true, value: { query, mode, fromUser } }
}

const isoDate = (value: string | Date) =>
  new Date(value).toISOString().slice(0, 10)

/** The site search for an alert, optionally from the day of `since`. */
export function searchAlertSearchHref(
  alert: { query: string; fromUser: string | null },
  since?: string | Date,
): string {
  const params = new URLSearchParams({ q: alert.query })
  if (alert.fromUser) params.set('fromUser', alert.fromUser)
  if (since) params.set('sinceDate', isoDate(since))
  return `/search?${params.toString()}`
}

/** How an alert reads in lists: `"open source" from @user`. */
export const searchAlertLabel = (alert: {
  query: string
  fromUser: string | null
}) => `“${alert.query}”${alert.fromUser ? ` from @${alert.fromUser}` : ''}`
