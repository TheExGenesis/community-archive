import {
  buildBackfillView,
  filterRows,
  sortRows,
  validateBackfillSnapshot,
  validateMemberTweetCounts,
  type StatusFilter,
} from './backfillProgress'
import { account, snapshot } from './backfillProgress.fixtures'

const monthly = (status: string, done: number, planned: number) => ({
  status,
  planned,
  done,
  with_tweets: Math.min(done, 2),
  failed: 0,
  pending: planned - done,
  oldest_reached: '2013-05-01',
  requests: 40,
  tweets_gained: 300,
})

test('merges held counts into completeness and totals', () => {
  const view = buildBackfillView(
    snapshot([
      account('1', {
        crawls: { ...account('1').crawls, monthly: monthly('pending', 3, 10) },
      }),
      account('2', { profile_tweets: 500 }),
      account('3', { profile_tweets: null }),
    ]),
    {
      generatedAt: '2026-11-27T15:30:00Z',
      counts: { '1': 250, '2': 600, '3': 9 },
    },
  )
  const [one, two, three] = view.rows
  expect(one.held).toBe(250)
  expect(one.completeness).toBe(0.25)
  expect(one.monthly).toMatchObject({ runner: 'monthly', done: 3, planned: 10 })
  expect(one.requests).toBe(50)
  expect(one.gained).toBe(305)
  expect(two.completeness).toBe(1.2)
  expect(three.completeness).toBeNull()
  expect(view.summary.held).toBe(850)
  expect(view.summary.profileTweets).toBe(1500)
  expect(view.summary.under50).toBe(1)
  expect(view.summary.excludedByConsent).toBe(2)
})

test('an account absent from the counts holds zero; no counts at all is unknown', () => {
  const snap = snapshot([account('1')])
  expect(
    buildBackfillView(snap, { generatedAt: 'x', counts: {} }).rows[0].held,
  ).toBe(0)
  const unknown = buildBackfillView(snap, null)
  expect(unknown.rows[0].held).toBeNull()
  expect(unknown.rows[0].completeness).toBeNull()
  expect(unknown.summary.completeness).toBeNull()
})

test('the new-member walk fills the monthly column when monthly has not taken the account', () => {
  const crawls = {
    ...account('1').crawls,
    new_members: monthly('pending', 1, 4),
  }
  const [row] = buildBackfillView(
    snapshot([account('1', { crawls })]),
    null,
  ).rows
  expect(row.monthly?.runner).toBe('new_members')
})

test('sorts by any column with unknown values last', () => {
  const view = buildBackfillView(
    snapshot([
      account('1', { profile_tweets: 100 }),
      account('2', { profile_tweets: 100 }),
      account('3', { rank: null, profile_tweets: null }),
    ]),
    { generatedAt: 'x', counts: { '1': 90, '2': 20, '3': 5 } },
  )
  const ids = (rows: typeof view.rows) => rows.map((r) => r.id)
  expect(ids(sortRows(view.rows, 'rank', 'asc'))).toEqual(['1', '2', '3'])
  expect(ids(sortRows(view.rows, 'rank', 'desc'))).toEqual(['2', '1', '3'])
  expect(ids(sortRows(view.rows, 'completeness', 'asc'))).toEqual([
    '2',
    '1',
    '3',
  ])
  expect(ids(sortRows(view.rows, 'completeness', 'desc'))).toEqual([
    '1',
    '2',
    '3',
  ])
})

test('filters by text, member type and stacked statuses', () => {
  const view = buildBackfillView(
    snapshot([
      account('1', {
        username: 'Alice',
        crawls: { ...account('1').crawls, monthly: monthly('pending', 1, 4) },
      }),
      account('2', {
        username: 'bob',
        member_type: 'archive',
        crawls: { ...account('2').crawls, monthly: monthly('done', 4, 4) },
      }),
      account('3', {
        username: 'carol',
        nightly: { last_refresh_at: null, waiting_full_timeline: true },
      }),
    ]),
    { generatedAt: 'x', counts: { '1': 100, '2': 900, '3': 10 } },
  )
  const ids = (rows: typeof view.rows) => rows.map((r) => r.id)
  expect(ids(filterRows(view.rows, '@ali', new Set()))).toEqual(['1'])
  expect(ids(filterRows(view.rows, '2', new Set()))).toEqual(['2'])
  expect(
    ids(filterRows(view.rows, '', new Set<StatusFilter>(['monthly_pending']))),
  ).toEqual(['1'])
  expect(
    ids(filterRows(view.rows, '', new Set<StatusFilter>(['monthly_done']))),
  ).toEqual(['2'])
  expect(
    ids(filterRows(view.rows, '', new Set<StatusFilter>(['not_in_monthly']))),
  ).toEqual(['3'])
  expect(
    ids(filterRows(view.rows, '', new Set<StatusFilter>(['under_50']))),
  ).toEqual(['1', '3'])
  expect(
    ids(
      filterRows(
        view.rows,
        '',
        new Set<StatusFilter>(['under_50', 'waiting_full_timeline']),
      ),
    ),
  ).toEqual(['3'])
  expect(ids(filterRows(view.rows, '', new Set(), 'archive'))).toEqual(['2'])
})

test('rejects malformed snapshots and counts', () => {
  expect(() => validateBackfillSnapshot(snapshot([account('1')]))).not.toThrow()
  expect(() =>
    validateBackfillSnapshot({ ...snapshot([]), schema: 2 }),
  ).toThrow()
  expect(() => validateBackfillSnapshot(snapshot([account('x1')]))).toThrow()
  expect(() =>
    validateMemberTweetCounts({ generatedAt: 'x', counts: { '1': 2 } }),
  ).not.toThrow()
  expect(() =>
    validateMemberTweetCounts({ generatedAt: 'x', counts: { '1': '2' } }),
  ).toThrow()
  expect(() => validateMemberTweetCounts({ counts: {} })).toThrow()
})
