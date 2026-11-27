import type { BackfillSnapshot, SnapshotAccount } from './backfillProgress'

// Test fixtures shared by backfillProgress.test.ts and BackfillTable.test.tsx.

export function account(
  id: string,
  overrides: Partial<SnapshotAccount> = {},
): SnapshotAccount {
  return {
    account_id: id,
    username: `user${id}`,
    member_type: 'opted_in',
    followers: 100,
    profile_tweets: 1000,
    rank: Number(id),
    score: 0.9,
    pagerank: 1.5,
    collection_disabled: false,
    crawls: {
      recent: { status: 'done', requests: 10, tweets_gained: 5 },
      monthly: null,
      new_members: null,
      weekly: null,
    },
    nightly: {
      last_refresh_at: '2026-11-27T03:40:00+00:00',
      waiting_full_timeline: false,
    },
    last_activity_at: '2026-11-27T03:40:00+00:00',
    ...overrides,
  }
}

export function snapshot(accounts: SnapshotAccount[]): BackfillSnapshot {
  const tally = { accounts: 0, by_status: {}, requests: 0, tweets_gained: 0 }
  return {
    schema: 1,
    generated_at: '2026-11-27T15:40:00+00:00',
    ranking: {
      generated_at: '2026-11-21T08:43:56+00:00',
      method: 'followers x PageRank',
    },
    quota: {
      limit: 2_000_000,
      remaining: 1_000_000,
      observed_at: null,
      reset_at: '2026-12-20T01:01:00+00:00',
      guard_state: 'open',
      backfill_allowed: 400_000,
      nightly_reserve: 500_000,
      per_night_reserve: 25_000,
      nights_until_reset: 23,
    },
    crawls: {
      recent: tally,
      monthly: tally,
      new_members: tally,
      weekly: tally,
      nightly: { accounts_refreshed: 0, waiting_full_timeline: 0 },
    },
    counts: {
      accounts: accounts.length,
      excluded_by_consent: 2,
      members_without_account_id: 1,
    },
    accounts,
  }
}
