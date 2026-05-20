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

const getMetadataString = (
  metadata: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

export const getTwitterUsername = (user: User) => {
  const userMetadata = user.user_metadata ?? {}
  const appMetadata = user.app_metadata ?? {}
  const twitterIdentity =
    user.identities?.find((identity) =>
      ['twitter', 'x'].includes(identity.provider ?? ''),
    ) ?? user.identities?.[0]
  const identityData = twitterIdentity?.identity_data ?? {}

  return getMetadataString(
    { ...identityData, ...appMetadata, ...userMetadata },
    ['user_name', 'preferred_username', 'username', 'screen_name'],
  )?.toLowerCase()
}

const isKnownProductionSupabase = () =>
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(PRODUCTION_SUPABASE_HOST) ??
  false

const isStagingAdminAccessEnabled = () =>
  process.env.ENABLE_STAGING_DEV_LOGIN === 'true' &&
  process.env.ALLOW_STAGING_ADMIN_ON_PROD_SUPABASE !== 'true' &&
  !isKnownProductionSupabase()

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

  if (
    getTwitterUsername(user) !== ADMIN_USERNAME &&
    !isStagingAdminAccessEnabled()
  ) {
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

  if (search) {
    query = query.or(`username.ilike.%${search}%,twitter_user_id.eq.${search}`)
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

  if (search) {
    query = query.or(`username.ilike.%${search}%,account_id.eq.${search}`)
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
  blocked: Set<string>,
): MergedRow[] {
  return accounts.map((account) => ({
    key: `account:${account.account_id}`,
    username: account.username,
    account,
    archiveUploadCount: uploadCounts.get(account.account_id) ?? 0,
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

  const [uploadCounts, scrapeBlocklist] = await Promise.all([
    fetchUploadCounts(
      admin,
      Array.from(
        new Set([
          ...optInAccountList.map((a) => a.account_id),
          ...firstAccounts.map((a) => a.account_id),
        ]),
      ),
    ),
    fetchScrapeBlocklist(admin, candidateAccountIds),
  ])

  const optInRows = buildOptInMergedRows(
    optInRecords,
    accountsByUsernameMap,
    accountsByIdMap,
    uploadCounts,
    scrapeBlocklist.blocked,
  )
  const accountRows = buildAccountMergedRows(
    firstAccounts,
    uploadCounts,
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
  const [uploadCounts, scrapeBlocklist] = await Promise.all([
    fetchUploadCounts(admin, accountIds),
    fetchScrapeBlocklist(admin, accountIds),
  ])

  return {
    rows: buildAccountMergedRows(
      accounts,
      uploadCounts,
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
