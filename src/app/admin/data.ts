import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

export const ADMIN_USERNAME = 'exgenesis'
const PRODUCTION_SUPABASE_HOST = 'fabxmporizzqflnftavs.supabase.co'

export const ACCOUNTS_PAGE_SIZE = 50

export type OptInRecord = {
  id: string
  user_id: string | null
  username: string
  twitter_user_id: string | null
  opted_in: boolean
  explicit_optout: boolean | null
  opt_out_reason: string | null
  updated_at: string | null
  opted_in_at: string | null
  opted_out_at: string | null
}

export type AccountRecord = {
  account_id: string
  username: string
  account_display_name: string
  num_tweets: number | null
  created_via: string
  updated_at: string | null
}

export type MergedRow = {
  key: string
  username: string
  account: AccountRecord | null
  archiveUploadCount: number
  /**
   * Actual `COUNT(*) FROM public.tweets WHERE account_id = ?`. Distinct from
   * `account.num_tweets`, which is the Twitter public-profile counter the
   * scraper writes — that number reflects what the account has on Twitter,
   * not what we have stored. For `twitter_import` accounts the two can
   * differ by 10–1000x; for `web` (uploaded archive) accounts they roughly
   * match (off by retweets/replies the archive sometimes excludes).
   */
  archivedTweetCount: number
  blockedFromScraping: boolean
  optInRecord: OptInRecord | null
  /** True when this row was sourced from public.optin (vs all_account only). */
  fromOptIn: boolean
}

export type AccountsPage = {
  rows: MergedRow[]
  nextCursor: AccountsCursor | null
  /** Warning shown once after the first load (e.g. scrape blocklist read failed). */
  warning: string | null
}

export type AccountsCursor = {
  /** ISO timestamp of the last seen all_account row, or null when none seen yet. */
  updatedAt: string | null
  /** account_id tie-breaker for stable keyset pagination. */
  accountId: string
}

const OPT_IN_SELECT =
  'id, user_id, username, twitter_user_id, opted_in, explicit_optout, opt_out_reason, updated_at, opted_in_at, opted_out_at'

const ACCOUNT_SELECT =
  'account_id, username, account_display_name, num_tweets, created_via, updated_at'

// SECURITY: only trust identity_data from the Twitter OAuth identity entry.
// user_metadata is user-mutable via supabase.auth.updateUser({ data: ... }) —
// reading user_name from there would let any logged-in user promote themselves
// to admin by setting user_metadata.user_name = 'exgenesis'. identity_data is
// set by Supabase during the OAuth callback from the provider's response and
// is not user-editable.
function getTwitterIdentity(user: User) {
  return (
    user.identities?.find((identity) =>
      ['twitter', 'x'].includes(identity.provider ?? ''),
    ) ?? null
  )
}

export const getTwitterUsername = (user: User): string | null => {
  const identity = getTwitterIdentity(user)
  if (!identity) return null
  const data = (identity.identity_data ?? {}) as Record<string, unknown>
  for (const key of ['user_name', 'preferred_username', 'screen_name', 'username']) {
    const v = data[key]
    if (typeof v === 'string' && v.trim()) {
      return v.trim().toLowerCase().replace(/^@/, '')
    }
  }
  return null
}

export const getTwitterProviderId = (user: User): string | null => {
  const identity = getTwitterIdentity(user)
  if (!identity) return null
  const data = (identity.identity_data ?? {}) as Record<string, unknown>
  const v = data.provider_id ?? data.sub ?? identity.id
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

const ADMIN_TWITTER_PROVIDER_ID =
  process.env.ADMIN_TWITTER_PROVIDER_ID?.trim() || null

const isKnownProductionSupabase = () =>
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(PRODUCTION_SUPABASE_HOST) ??
  false

const isStagingAdminAccessEnabled = () =>
  process.env.ENABLE_STAGING_DEV_LOGIN === 'true' &&
  process.env.ALLOW_STAGING_ADMIN_ON_PROD_SUPABASE !== 'true' &&
  !isKnownProductionSupabase()

// Specific staging usernames that get admin powers when dev-logged in. NOT
// every staging user — that was the old (overly permissive) behavior. Only
// these usernames pass the gate, and only when isStagingAdminAccessEnabled()
// is true (which can only happen off-prod).
const STAGING_ADMIN_USERNAMES = new Set(['xiq_dev'])

// Read the username Supabase Auth Admin set for this user. app_metadata is
// not mutable via the regular auth API (only the admin SDK can write to it),
// so reading it for an identity decision is safe — unlike user_metadata.
// Returns null on prod where the staging code path doesn't apply.
function getStagingAdminUsername(user: User): string | null {
  if (!isStagingAdminAccessEnabled()) return null
  const v = (user.app_metadata as { user_name?: unknown } | undefined)
    ?.user_name
  if (typeof v !== 'string') return null
  return v.trim().toLowerCase().replace(/^@/, '') || null
}

// Pure predicate: is this user the configured real admin? No redirects.
// Two paths:
//
//   1. Real Twitter OAuth identity matches ADMIN_USERNAME. On prod, this
//      is the only path that returns true — guarded by username plus,
//      when ADMIN_TWITTER_PROVIDER_ID is set, the immutable Twitter
//      numeric id (belt-and-suspenders against a future handle takeover).
//
//   2. (staging only) app_metadata.user_name is in the
//      STAGING_ADMIN_USERNAMES allowlist. The dev-login route sets
//      app_metadata.user_name to whatever username the dev-login form
//      requested, and app_metadata is server-set and not mutable via the
//      regular auth API — so this is a safe identity claim on staging.
export function isAdminUser(user: User): boolean {
  const twitterUsername = getTwitterUsername(user)
  if (twitterUsername === ADMIN_USERNAME) {
    if (ADMIN_TWITTER_PROVIDER_ID === null) return true
    return getTwitterProviderId(user) === ADMIN_TWITTER_PROVIDER_ID
  }
  const stagingName = getStagingAdminUsername(user)
  if (stagingName && STAGING_ADMIN_USERNAMES.has(stagingName)) return true
  return false
}

// Username to display at the top of the admin page. Identity_data first
// (real Twitter OAuth), staging dev-login app_metadata as fallback so the
// header shows '@xiq_dev' instead of '@' when signed in via dev-login.
export function getDisplayUsername(user: User): string | null {
  return getTwitterUsername(user) ?? getStagingAdminUsername(user)
}

// Non-throwing variant for places that need to *know* whether the visitor is
// admin (e.g. to hide nav links) but must not redirect.
export async function checkIsAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return false
  return isAdminUser(user)
}

export async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login?redirect=/admin')
  }

  // The staging allowance is now baked into isAdminUser (specific
  // usernames only); no blanket bypass.
  if (!isAdminUser(user)) {
    notFound()
  }

  return { user, cookieStore }
}

export async function getAdminClient() {
  // requireAdmin gates access via the user's session, then we hand out a real
  // service-role client (no cookies) so PostgREST sees service_role on the
  // wire. Otherwise RLS + RPC EXECUTE grants reject the calls.
  await requireAdmin()
  return createServerServiceRoleClient()
}

export const normalizeUsername = (value: string | undefined | null) =>
  (value ?? '').trim().replace(/^@/, '').toLowerCase().slice(0, 80)

// SECURITY: PostgREST's `.or(...)` accepts a comma-separated list of filter
// expressions, with parentheses for nested `and(...)` / `or(...)` groups.
// Interpolating untrusted input directly into that string lets a caller
// smuggle extra predicates onto the same table (filter injection).
//
// The admin search box only ever needs to match Twitter usernames
// (`[A-Za-z0-9_]+`) or numeric Twitter user IDs / account IDs (digits), so
// we collapse the input to that allowlist. Any `,`, `(`, `)`, `.`, `*`,
// quote, backslash, etc. is stripped — eliminating every metacharacter
// PostgREST's filter grammar treats as structural. Admin-only surface so
// the practical impact is self-exfil, but worth fixing as defense in depth.
export const sanitizeAdminSearch = (value: string | undefined | null) =>
  normalizeUsername(value).replace(/[^a-z0-9_]/g, '')

type AdminClient = Awaited<ReturnType<typeof getAdminClient>>

async function fetchScrapeBlocklist(
  admin: AdminClient,
  accountIds: string[],
): Promise<{ blocked: Set<string>; warning: string | null }> {
  if (!accountIds.length) {
    return { blocked: new Set(), warning: null }
  }

  const { data, error } = await admin.rpc(
    'admin_list_blocked_scraping_users' as never,
    { p_account_ids: accountIds } as never,
  )

  if (error) {
    return {
      blocked: new Set(),
      warning: `Could not read scrape blocklist: ${error.message}`,
    }
  }

  const blockedArray = Array.isArray(data) ? (data as string[]) : []
  return { blocked: new Set(blockedArray), warning: null }
}

async function fetchUploadCounts(
  admin: AdminClient,
  accountIds: string[],
): Promise<Map<string, number>> {
  if (!accountIds.length) return new Map()
  const { data, error } = await admin
    .from('archive_upload')
    .select('account_id')
    .in('account_id', accountIds)

  if (error) throw error

  return (data ?? []).reduce<Map<string, number>>((counts, row) => {
    counts.set(row.account_id, (counts.get(row.account_id) ?? 0) + 1)
    return counts
  }, new Map())
}

// Actual `COUNT(*)` of rows in public.tweets per account. We need this
// alongside all_account.num_tweets because the latter is the Twitter
// public-profile counter (what the scraper saw at ingest), not what we
// have stored — they can differ by 10–1000x for scrape-sourced accounts.
// Done as N parallel `head:true` counts (one per account) rather than a
// SELECT-then-aggregate, because:
//   - SELECT account_id would be capped at 1000 rows by PostgREST and we
//     could be summing across millions of tweet rows
//   - GROUP BY isn't expressible from supabase-js without an RPC
//   - 50 accounts × 10 concurrency = 5 batches, ~250ms end-to-end —
//     fine for a per-page admin view, no RPC migration needed
async function fetchArchivedTweetCounts(
  admin: AdminClient,
  accountIds: string[],
): Promise<Map<string, number>> {
  if (!accountIds.length) return new Map()
  const CONCURRENCY = 10
  const result = new Map<string, number>()
  for (let i = 0; i < accountIds.length; i += CONCURRENCY) {
    const batch = accountIds.slice(i, i + CONCURRENCY)
    const counts = await Promise.all(
      batch.map(async (id) => {
        const { count, error } = await admin
          .from('tweets')
          .select('tweet_id', { count: 'exact', head: true })
          .eq('account_id', id)
        return { id, count: error ? 0 : (count ?? 0) }
      }),
    )
    for (const c of counts) result.set(c.id, c.count)
  }
  return result
}

async function fetchOptInRows(
  admin: AdminClient,
  search: string,
): Promise<OptInRecord[]> {
  let query = admin
    .from('optin')
    .select(OPT_IN_SELECT)
    .order('opted_in', { ascending: false })
    .order('explicit_optout', { ascending: false })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(500)

  // Defense in depth: callers already pass a normalized string, but we
  // re-sanitize at the chokepoint before building a PostgREST .or() filter.
  // See sanitizeAdminSearch for the threat model.
  const safeSearch = sanitizeAdminSearch(search)
  if (safeSearch) {
    query = query.or(
      `username.ilike.%${safeSearch}%,twitter_user_id.eq.${safeSearch}`,
    )
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as OptInRecord[]
}

async function fetchAccountsPage(
  admin: AdminClient,
  search: string,
  cursor: AccountsCursor | null,
  excludeAccountIds: Set<string>,
  excludeUsernames: Set<string>,
  limit: number,
): Promise<{ rows: AccountRecord[]; nextCursor: AccountsCursor | null }> {
  // Fetch slightly more than needed so we can drop dedupe collisions and still
  // hand back a full page when possible.
  const overscan = Math.min(limit * 3, limit + 50)
  let query = admin
    .from('all_account')
    .select(ACCOUNT_SELECT)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('account_id', { ascending: true })
    .limit(overscan)

  // Defense in depth: re-sanitize before interpolating into the PostgREST
  // .or() filter — see sanitizeAdminSearch for the threat model.
  const safeSearch = sanitizeAdminSearch(search)
  if (safeSearch) {
    query = query.or(
      `username.ilike.%${safeSearch}%,account_id.eq.${safeSearch}`,
    )
  }

  if (cursor) {
    // Keyset: (updated_at, account_id) strictly after the cursor under
    // (DESC NULLS LAST, ASC).
    if (cursor.updatedAt !== null) {
      query = query.or(
        `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},account_id.gt.${cursor.accountId})`,
      )
    } else {
      // Already in the NULL bucket — only ids strictly greater.
      query = query.is('updated_at', null).gt('account_id', cursor.accountId)
    }
  }

  const { data, error } = await query
  if (error) throw error

  const fetched = (data ?? []) as AccountRecord[]
  const filtered: AccountRecord[] = []
  for (const account of fetched) {
    if (excludeAccountIds.has(account.account_id)) continue
    if (excludeUsernames.has(account.username.toLowerCase())) continue
    filtered.push(account)
    if (filtered.length >= limit) break
  }

  // The cursor must point at the last raw fetched row (not the last filtered
  // row) so subsequent pages don't re-fetch the dropped duplicates.
  const last = fetched[fetched.length - 1]
  const reachedEnd = fetched.length < overscan
  const nextCursor: AccountsCursor | null =
    last && !reachedEnd
      ? { updatedAt: last.updated_at, accountId: last.account_id }
      : null

  return { rows: filtered, nextCursor }
}

function buildOptInMergedRows(
  records: OptInRecord[],
  accountsByUsername: Map<string, AccountRecord>,
  accountsById: Map<string, AccountRecord>,
  uploadCounts: Map<string, number>,
  archivedTweetCounts: Map<string, number>,
  blocked: Set<string>,
): MergedRow[] {
  return records.map((record) => {
    const account =
      (record.twitter_user_id
        ? accountsById.get(record.twitter_user_id)
        : null) ??
      accountsByUsername.get(record.username.toLowerCase()) ??
      null
    const effectiveAccountId =
      record.twitter_user_id ?? account?.account_id ?? ''
    return {
      key: `optin:${record.id}`,
      username: record.username,
      account,
      archiveUploadCount: account
        ? (uploadCounts.get(account.account_id) ?? 0)
        : 0,
      archivedTweetCount: effectiveAccountId
        ? (archivedTweetCounts.get(effectiveAccountId) ?? 0)
        : 0,
      blockedFromScraping: effectiveAccountId
        ? blocked.has(effectiveAccountId)
        : false,
      optInRecord: record,
      fromOptIn: true,
    }
  })
}

function buildAccountMergedRows(
  accounts: AccountRecord[],
  uploadCounts: Map<string, number>,
  archivedTweetCounts: Map<string, number>,
  blocked: Set<string>,
): MergedRow[] {
  return accounts.map((account) => ({
    key: `account:${account.account_id}`,
    username: account.username,
    account,
    archiveUploadCount: uploadCounts.get(account.account_id) ?? 0,
    archivedTweetCount: archivedTweetCounts.get(account.account_id) ?? 0,
    blockedFromScraping: blocked.has(account.account_id),
    optInRecord: null,
    fromOptIn: false,
  }))
}

export async function loadInitialAccounts(
  search: string,
): Promise<AccountsPage & { optInCount: number }> {
  const admin = await getAdminClient()

  const optInRecords = await fetchOptInRows(admin, search)

  const optInAccountIds = optInRecords
    .map((r) => r.twitter_user_id)
    .filter((id): id is string => Boolean(id))
  const optInUsernames = optInRecords.map((r) => r.username.toLowerCase())

  const accountLookupSelect = ACCOUNT_SELECT
  const [byId, byUsername] = await Promise.all([
    optInAccountIds.length
      ? admin
          .from('all_account')
          .select(accountLookupSelect)
          .in('account_id', optInAccountIds)
      : Promise.resolve({ data: [], error: null }),
    optInUsernames.length
      ? admin
          .from('all_account')
          .select(accountLookupSelect)
          .in('username', optInUsernames)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (byId.error) throw byId.error
  if (byUsername.error) throw byUsername.error

  const optInAccountList = [
    ...((byId.data ?? []) as AccountRecord[]),
    ...((byUsername.data ?? []) as AccountRecord[]),
  ]
  const accountsByIdMap = new Map<string, AccountRecord>()
  const accountsByUsernameMap = new Map<string, AccountRecord>()
  for (const account of optInAccountList) {
    accountsByIdMap.set(account.account_id, account)
    accountsByUsernameMap.set(account.username.toLowerCase(), account)
  }

  const excludeAccountIds = new Set<string>(accountsByIdMap.keys())
  const excludeUsernames = new Set<string>(accountsByUsernameMap.keys())

  const { rows: firstAccounts, nextCursor } = await fetchAccountsPage(
    admin,
    search,
    null,
    excludeAccountIds,
    excludeUsernames,
    ACCOUNTS_PAGE_SIZE,
  )

  const candidateAccountIds = [
    ...optInRecords.map((r) => r.twitter_user_id ?? ''),
    ...optInAccountList.map((a) => a.account_id),
    ...firstAccounts.map((a) => a.account_id),
  ].filter(Boolean)

  const accountIdsForCounts = Array.from(
    new Set([
      ...optInAccountList.map((a) => a.account_id),
      ...firstAccounts.map((a) => a.account_id),
      // Include opt-in rows' twitter_user_id even when no matching
      // all_account exists, so the archived count can still resolve from
      // tweets table (rare but possible for accounts the firehose touched
      // before user_directory got refreshed).
      ...optInRecords
        .map((r) => r.twitter_user_id)
        .filter((id): id is string => Boolean(id)),
    ]),
  )

  const [uploadCounts, archivedTweetCounts, scrapeBlocklist] =
    await Promise.all([
      fetchUploadCounts(admin, accountIdsForCounts),
      fetchArchivedTweetCounts(admin, accountIdsForCounts),
      fetchScrapeBlocklist(admin, candidateAccountIds),
    ])

  const optInRows = buildOptInMergedRows(
    optInRecords,
    accountsByUsernameMap,
    accountsByIdMap,
    uploadCounts,
    archivedTweetCounts,
    scrapeBlocklist.blocked,
  )
  const accountRows = buildAccountMergedRows(
    firstAccounts,
    uploadCounts,
    archivedTweetCounts,
    scrapeBlocklist.blocked,
  )

  return {
    rows: [...optInRows, ...accountRows],
    nextCursor,
    warning: scrapeBlocklist.warning,
    optInCount: optInRows.length,
  }
}

export async function loadMoreAccountsData(
  search: string,
  cursor: AccountsCursor,
  excludeAccountIds: string[],
  excludeUsernames: string[],
): Promise<AccountsPage> {
  const admin = await getAdminClient()

  const { rows: accounts, nextCursor } = await fetchAccountsPage(
    admin,
    search,
    cursor,
    new Set(excludeAccountIds),
    new Set(excludeUsernames.map((u) => u.toLowerCase())),
    ACCOUNTS_PAGE_SIZE,
  )

  const accountIds = accounts.map((a) => a.account_id)
  const [uploadCounts, archivedTweetCounts, scrapeBlocklist] =
    await Promise.all([
      fetchUploadCounts(admin, accountIds),
      fetchArchivedTweetCounts(admin, accountIds),
      fetchScrapeBlocklist(admin, accountIds),
    ])

  return {
    rows: buildAccountMergedRows(
      accounts,
      uploadCounts,
      archivedTweetCounts,
      scrapeBlocklist.blocked,
    ),
    nextCursor,
    warning: scrapeBlocklist.warning,
  }
}

export async function lookupAccountIdByUsername(
  admin: AdminClient,
  username: string,
): Promise<string | null> {
  const normalized = normalizeUsername(username)
  if (!normalized) return null
  const { data, error } = await admin
    .from('all_account')
    .select('account_id')
    .ilike('username', normalized)
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data?.account_id ?? null
}
