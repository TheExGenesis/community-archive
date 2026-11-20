import {
  groupSearchAlerts,
  matchesAfter,
  runSearchAlertChecks,
  type SearchAlertRunDeps,
} from './matcher'
import type { CheckableAlert } from './store'

const alert = (overrides: Partial<CheckableAlert>): CheckableAlert => ({
  id: 'a',
  userId: 'u',
  query: 'community archive',
  mode: 'phrase',
  fromUser: null,
  lastCheckedAt: '2026-11-20T08:00:00.000Z',
  ...overrides,
})

const tweets = [
  { tweetId: '30', createdAt: '2026-11-20 09:30:00' },
  { tweetId: '20', createdAt: '2026-11-20 08:30:00' },
  { tweetId: '10', createdAt: '2026-11-20 07:30:00' },
]

const deps = (
  overrides: Partial<SearchAlertRunDeps> = {},
): SearchAlertRunDeps & {
  record: jest.Mock
  recordFailure: jest.Mock
  fetcher: jest.Mock
} =>
  ({
    listAlerts: jest.fn(async () => []),
    record: jest.fn(async () => true),
    recordFailure: jest.fn(async () => undefined),
    fetcher: jest.fn(async () => ({ data: { tweets } })),
    now: () => new Date('2026-11-20T10:00:00.000Z'),
    ...overrides,
  }) as never

test('groups identical searches regardless of case, oldest watermark first', () => {
  const groups = groupSearchAlerts([
    alert({ id: '1', lastCheckedAt: '2026-11-20T09:00:00Z' }),
    alert({ id: '2', query: 'Community Archive', userId: 'v' }),
    alert({ id: '3', mode: 'all' }),
    alert({
      id: '4',
      fromUser: 'exgenesis',
      lastCheckedAt: '2026-11-19T00:00:00Z',
    }),
  ])
  expect(groups.map((g) => g.alerts.map((a) => a.id))).toEqual([
    ['4'],
    ['1', '2'],
    ['3'],
  ])
})

test('each distinct search hits the gateway once and each alert keeps its own window', async () => {
  const d = deps({
    listAlerts: async () => [
      alert({ id: 'early', lastCheckedAt: '2026-11-20T08:00:00.000Z' }),
      alert({
        id: 'late',
        userId: 'v',
        lastCheckedAt: '2026-11-20T09:00:00.000Z',
      }),
    ],
  })
  const result = await runSearchAlertChecks(d)

  expect(d.fetcher).toHaveBeenCalledTimes(1)
  expect(d.fetcher.mock.calls[0][1].get('since')).toBe('2026-11-20')
  expect(d.record).toHaveBeenCalledWith({
    alertId: 'early',
    expectedCheckedAt: '2026-11-20T08:00:00.000Z',
    checkedAt: '2026-11-20T10:00:00.000Z',
    tweets: [
      { id: '30', replyToId: null, createdAt: '2026-11-20T09:30:00.000Z' },
      { id: '20', replyToId: null, createdAt: '2026-11-20T08:30:00.000Z' },
    ],
  })
  expect(d.record).toHaveBeenCalledWith(
    expect.objectContaining({
      alertId: 'late',
      tweets: [expect.objectContaining({ id: '30' })],
    }),
  )
  expect(result).toMatchObject({
    alerts: 2,
    searches: 1,
    newMatches: 3,
    alertsWithMatches: 2,
    failedSearches: 0,
  })
})

test('a gateway failure leaves the watermark alone and does not stop other searches', async () => {
  const d = deps({
    listAlerts: async () => [
      alert({ id: 'broken', query: 'broken' }),
      alert({
        id: 'fine',
        query: 'fine',
        lastCheckedAt: '2026-11-20T09:00:00.000Z',
      }),
    ],
    fetcher: jest.fn(async (_path: string[], params: URLSearchParams) => {
      if (params.get('q') === 'broken') throw new Error('gateway 502')
      return { data: { tweets } }
    }) as never,
  })
  const result = await runSearchAlertChecks(d)

  expect(d.record).toHaveBeenCalledTimes(1)
  expect(d.record).toHaveBeenCalledWith(
    expect.objectContaining({ alertId: 'fine' }),
  )
  expect(d.recordFailure).toHaveBeenCalledWith(['broken'], 'gateway 502')
  expect(result).toMatchObject({
    failedSearches: 1,
    failedAlerts: 1,
    searches: 2,
  })
})

test('records a check with no matches so the watermark still advances', async () => {
  const d = deps({
    listAlerts: async () => [
      alert({ lastCheckedAt: '2026-11-20T09:45:00.000Z' }),
    ],
  })
  await runSearchAlertChecks(d)
  expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ tweets: [] }))
})

test('a failed write for one alert does not fail the rest', async () => {
  const d = deps({
    listAlerts: async () => [
      alert({ id: 'x' }),
      alert({ id: 'y', userId: 'v' }),
    ],
    record: jest.fn(async ({ alertId }: { alertId: string }) => {
      if (alertId === 'x') throw new Error('db down')
      return true
    }) as never,
  })
  const result = await runSearchAlertChecks(d)
  expect(result).toMatchObject({ failedAlerts: 1, alertsWithMatches: 1 })
})

test('bounds the distinct searches per run', async () => {
  const d = deps({
    listAlerts: async () =>
      Array.from({ length: 5 }, (_, i) =>
        alert({ id: String(i), query: `q${i}` }),
      ),
    maxSearches: 2,
  })
  const result = await runSearchAlertChecks(d)
  expect(d.fetcher).toHaveBeenCalledTimes(2)
  expect(result).toMatchObject({ searches: 2, deferredSearches: 3 })
})

test('keeps only tweets strictly newer than the watermark, newest first', () => {
  expect(
    matchesAfter(
      [
        { id: '1', replyToId: null, createdAt: '2026-11-20T08:00:00.000Z' },
        { id: '3', replyToId: null, createdAt: '2026-11-20T09:00:00.000Z' },
        { id: '2', replyToId: null, createdAt: '2026-11-20T09:00:00.000Z' },
      ],
      '2026-11-20T08:00:00.000Z',
    ).map((t) => t.id),
  ).toEqual(['3', '2'])
})
