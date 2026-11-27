/**
 * Backfill progress for the admin dashboard (/admin/backfill).
 *
 * Two inputs, neither read per signed-out request:
 * - the per-member crawl snapshot that a timer on ca-autorefresh writes every
 *   30 minutes to the private `admin-snapshots` Storage bucket (only the
 *   service role can read it; consent is applied when it is built);
 * - tweets held per member, from the query gateway's `member-tweet-counts`
 *   route (one ClickHouse pass, cached 15 minutes in the gateway).
 *
 * This module only shapes data. Loading lives in backfillProgressData.ts.
 */

export const BACKFILL_SNAPSHOT_BUCKET = 'admin-snapshots'
export const BACKFILL_SNAPSHOT_PATH = 'backfill-progress/latest.json'

export type CrawlName = 'recent' | 'monthly' | 'new_members' | 'weekly'

export interface SnapshotRecentCrawl {
  status: string
  requests?: number
  tweets_gained?: number
  last_at?: string | null
  reason?: string | null
}

export interface SnapshotSearchCrawl extends SnapshotRecentCrawl {
  planned?: number | null
  done?: number
  with_tweets?: number
  failed?: number
  pending?: number | null
  oldest_reached?: string | null
  next_try_at?: string | null
  stop?: string | null
}

export interface SnapshotAccount {
  account_id: string
  username: string | null
  member_type: 'archive' | 'opted_in' | 'tracked'
  followers: number | null
  profile_tweets: number | null
  rank: number | null
  score: number | null
  pagerank: number | null
  collection_disabled: boolean
  crawls: {
    recent: SnapshotRecentCrawl
    monthly: SnapshotSearchCrawl | null
    new_members: SnapshotSearchCrawl | null
    weekly: SnapshotSearchCrawl | null
  }
  nightly: { last_refresh_at: string | null; waiting_full_timeline: boolean }
  last_activity_at: string | null
}

export interface CrawlTally {
  accounts: number
  by_status: Record<string, number>
  requests: number
  tweets_gained: number
  runner_status?: string | null
  eta_at?: string | null
  months_remaining?: number | null
}

export interface BackfillSnapshot {
  schema: 1
  generated_at: string
  ranking: { generated_at: string | null; method: string | null }
  quota: {
    limit: number | null
    remaining: number | null
    observed_at: string | null
    reset_at: string | null
    guard_state: string | null
    backfill_allowed: number | null
    nightly_reserve: number | null
    per_night_reserve: number | null
    nights_until_reset: number | null
  }
  crawls: Record<CrawlName, CrawlTally> & {
    nightly: { accounts_refreshed: number; waiting_full_timeline: number }
  }
  counts: {
    accounts: number
    excluded_by_consent: number
    members_without_account_id: number
  }
  accounts: SnapshotAccount[]
}

export interface MemberTweetCounts {
  generatedAt: string
  counts: Record<string, number>
}

/** Monthly-style progress: the monthly walk, or the new-member walk. */
export interface SearchProgress {
  status: string
  runner: 'monthly' | 'new_members' | 'weekly'
  planned: number | null
  done: number
  withTweets: number
  failed: number
  pending: number | null
  oldest: string | null
  nextTryAt: string | null
  reason: string | null
}

export interface BackfillRow {
  id: string
  username: string | null
  type: SnapshotAccount['member_type']
  followers: number | null
  profileTweets: number | null
  held: number | null
  /** held / profile tweets; null when either side is unknown. */
  completeness: number | null
  rank: number | null
  score: number | null
  pagerank: number | null
  consentExcluded: boolean
  recent: { status: string; reason: string | null }
  monthly: SearchProgress | null
  weekly: SearchProgress | null
  nightly: { lastRefreshAt: string | null; waiting: boolean }
  spend: Record<CrawlName, { requests: number; gained: number }>
  requests: number
  gained: number
  lastActivityAt: string | null
}

export interface BackfillSummary {
  generatedAt: string
  countsGeneratedAt: string | null
  rankingGeneratedAt: string | null
  accounts: number
  excludedByConsent: number
  withoutAccountId: number
  held: number
  profileTweets: number
  /** Σ held / Σ profile tweets over rows where both are known. */
  completeness: number | null
  under50: number
  crawls: BackfillSnapshot['crawls']
  quota: BackfillSnapshot['quota']
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function validateBackfillSnapshot(
  value: unknown,
): asserts value is BackfillSnapshot {
  if (
    !isRecord(value) ||
    value.schema !== 1 ||
    typeof value.generated_at !== 'string' ||
    !Number.isFinite(Date.parse(value.generated_at)) ||
    !Array.isArray(value.accounts) ||
    !isRecord(value.crawls) ||
    !isRecord(value.quota) ||
    !isRecord(value.counts) ||
    !value.accounts.every(
      (row) =>
        isRecord(row) &&
        typeof row.account_id === 'string' &&
        /^\d{1,20}$/.test(row.account_id) &&
        isRecord(row.crawls) &&
        isRecord(row.crawls.recent) &&
        isRecord(row.nightly),
    )
  ) {
    throw new Error('Backfill progress snapshot is invalid')
  }
}

export function validateMemberTweetCounts(
  value: unknown,
): asserts value is MemberTweetCounts {
  if (
    !isRecord(value) ||
    typeof value.generatedAt !== 'string' ||
    !isRecord(value.counts) ||
    !Object.entries(value.counts).every(
      ([id, n]) => /^\d{1,20}$/.test(id) && Number.isSafeInteger(n),
    )
  ) {
    throw new Error('Member tweet counts are invalid')
  }
}

const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

function searchProgress(
  crawl: SnapshotSearchCrawl | null,
  runner: SearchProgress['runner'],
): SearchProgress | null {
  if (!crawl) return null
  return {
    status: crawl.status,
    runner,
    planned: crawl.planned ?? null,
    done: num(crawl.done),
    withTweets: num(crawl.with_tweets),
    failed: num(crawl.failed),
    pending: crawl.pending ?? null,
    oldest: crawl.oldest_reached ?? null,
    nextTryAt: crawl.next_try_at ?? null,
    reason: crawl.reason ?? null,
  }
}

export function toBackfillRow(
  account: SnapshotAccount,
  counts: MemberTweetCounts | null,
): BackfillRow {
  // Members without visible tweets are absent from the counts; with no
  // counts at all (gateway down) the held column is unknown, not zero.
  const held = counts ? (counts.counts[account.account_id] ?? 0) : null
  const profile = account.profile_tweets
  const completeness =
    held !== null && profile && profile > 0 ? held / profile : null
  const { crawls } = account
  const spend = {
    recent: {
      requests: num(crawls.recent.requests),
      gained: num(crawls.recent.tweets_gained),
    },
    monthly: {
      requests: num(crawls.monthly?.requests),
      gained: num(crawls.monthly?.tweets_gained),
    },
    new_members: {
      requests: num(crawls.new_members?.requests),
      gained: num(crawls.new_members?.tweets_gained),
    },
    weekly: {
      requests: num(crawls.weekly?.requests),
      gained: num(crawls.weekly?.tweets_gained),
    },
  }
  const totals = Object.values(spend)
  return {
    id: account.account_id,
    username: account.username,
    type: account.member_type,
    followers: account.followers,
    profileTweets: profile,
    held,
    completeness,
    rank: account.rank,
    score: account.score,
    pagerank: account.pagerank,
    consentExcluded: account.collection_disabled,
    recent: {
      status: crawls.recent.status,
      reason: crawls.recent.reason ?? null,
    },
    // The new-member walk is a monthly walk too; show it where the monthly
    // walk has not taken the account.
    monthly:
      searchProgress(crawls.monthly, 'monthly') ??
      searchProgress(crawls.new_members, 'new_members'),
    weekly: searchProgress(crawls.weekly, 'weekly'),
    nightly: {
      lastRefreshAt: account.nightly.last_refresh_at,
      waiting: account.nightly.waiting_full_timeline,
    },
    spend,
    requests: totals.reduce((sum, s) => sum + s.requests, 0),
    gained: totals.reduce((sum, s) => sum + s.gained, 0),
    lastActivityAt: account.last_activity_at,
  }
}

export function buildBackfillView(
  snapshot: BackfillSnapshot,
  counts: MemberTweetCounts | null,
): { rows: BackfillRow[]; summary: BackfillSummary } {
  const rows = snapshot.accounts.map((account) =>
    toBackfillRow(account, counts),
  )
  let held = 0
  let profileTweets = 0
  let under50 = 0
  for (const row of rows) {
    if (row.completeness === null) continue
    held += row.held ?? 0
    profileTweets += row.profileTweets ?? 0
    if (row.completeness < 0.5) under50 += 1
  }
  return {
    rows,
    summary: {
      generatedAt: snapshot.generated_at,
      countsGeneratedAt: counts?.generatedAt ?? null,
      rankingGeneratedAt: snapshot.ranking?.generated_at ?? null,
      accounts: rows.length,
      excludedByConsent: num(snapshot.counts.excluded_by_consent),
      withoutAccountId: num(snapshot.counts.members_without_account_id),
      held,
      profileTweets,
      completeness: profileTweets > 0 ? held / profileTweets : null,
      under50,
      crawls: snapshot.crawls,
      quota: snapshot.quota,
    },
  }
}

// ------------------------------------------------------------ table state

export type SortKey =
  | 'rank'
  | 'username'
  | 'followers'
  | 'pagerank'
  | 'completeness'
  | 'held'
  | 'monthly'
  | 'requests'
  | 'gained'
  | 'lastActivity'

export type StatusFilter =
  | 'monthly_pending'
  | 'monthly_done'
  | 'not_in_monthly'
  | 'recent_pending'
  | 'under_50'
  | 'waiting_full_timeline'
  | 'consent_excluded'

export const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'monthly_pending', label: 'Monthly pending' },
  { id: 'monthly_done', label: 'Monthly done' },
  { id: 'not_in_monthly', label: 'Not in monthly' },
  { id: 'recent_pending', label: 'Recent history not done' },
  { id: 'under_50', label: 'Under 50% complete' },
  { id: 'waiting_full_timeline', label: 'Waiting for nightly full timeline' },
  { id: 'consent_excluded', label: 'Excluded by consent' },
]

const monthlyRatio = (row: BackfillRow) =>
  row.monthly?.planned
    ? (row.monthly.done + row.monthly.failed) / row.monthly.planned
    : null

const sortValue = (row: BackfillRow, key: SortKey): number | string | null => {
  switch (key) {
    case 'rank':
      return row.rank
    case 'username':
      return row.username?.toLowerCase() ?? null
    case 'followers':
      return row.followers
    case 'pagerank':
      return row.pagerank
    case 'completeness':
      return row.completeness
    case 'held':
      return row.held
    case 'monthly':
      return monthlyRatio(row)
    case 'requests':
      return row.requests
    case 'gained':
      return row.gained
    case 'lastActivity':
      return row.lastActivityAt
  }
}

/** Unknown values always sort last, whichever the direction. */
export function sortRows(
  rows: BackfillRow[],
  key: SortKey,
  direction: 'asc' | 'desc',
): BackfillRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = sortValue(a, key)
    const right = sortValue(b, key)
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    if (left < right) return -sign
    if (left > right) return sign
    return (a.rank ?? Infinity) - (b.rank ?? Infinity)
  })
}

function matchesStatus(row: BackfillRow, filter: StatusFilter): boolean {
  switch (filter) {
    case 'monthly_pending':
      return (
        !!row.monthly &&
        row.monthly.status !== 'done' &&
        row.monthly.status !== 'excluded_consent'
      )
    case 'monthly_done':
      return row.monthly?.status === 'done'
    case 'not_in_monthly':
      return !row.monthly
    case 'recent_pending':
      return !['done', 'excluded_consent'].includes(row.recent.status)
    case 'under_50':
      return row.completeness !== null && row.completeness < 0.5
    case 'waiting_full_timeline':
      return row.nightly.waiting
    case 'consent_excluded':
      return row.consentExcluded
  }
}

export function filterRows(
  rows: BackfillRow[],
  query: string,
  statuses: ReadonlySet<StatusFilter>,
  type: BackfillRow['type'] | 'all' = 'all',
): BackfillRow[] {
  const needle = query.trim().replace(/^@/, '').toLowerCase()
  return rows.filter(
    (row) =>
      (!needle ||
        row.id.includes(needle) ||
        (row.username ?? '').toLowerCase().includes(needle)) &&
      (type === 'all' || row.type === type) &&
      Array.from(statuses).every((status) => matchesStatus(row, status)),
  )
}
