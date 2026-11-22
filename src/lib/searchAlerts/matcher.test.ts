import {
  MAX_PAGES_PER_SEARCH,
  SEARCH_ALERT_LOOKBACK_DAYS,
  eligibleFor,
  groupSearchAlerts,
  runSearchAlertChecks,
  type SearchAlertRunDeps,
} from './matcher'
import {
  MATCH_LOG_RETENTION_DAYS,
  recordedKey,
  type CheckableAlert,
  type MatchedTweetRef,
} from './store'

const alert = (overrides: Partial<CheckableAlert> = {}): CheckableAlert => ({
  id: 'a',
  userId: 'u',
  query: 'community archive',
  mode: 'phrase',
  fromUser: null,
  lastCheckedAt: '2026-11-20T08:00:00.000Z',
  createdAt: '2026-11-15T00:00:00.000Z',
  ...overrides,
})

interface CorpusTweet {
  tweetId: string
  createdAt: string
  q?: string
}

/** A gateway over an in-memory corpus: newest first, `since` by day, paged. */
function gateway(corpus: CorpusTweet[]) {
  return jest.fn(async (_path: string[], params: URLSearchParams) => {
    const since = params.get('since')!
    const offset = Number(params.get('offset') ?? 0)
    const limit = Number(params.get('limit'))
    const rows = corpus
      .filter((t) => (t.q ?? 'community archive') === params.get('q'))
      .filter((t) => t.createdAt.slice(0, 10) >= since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { data: { tweets: rows.slice(offset, offset + limit) } }
  })
}

/** The match log with the database's rules: unique (alert, tweet), creation floor. */
function matchLog(alerts: () => CheckableAlert[]) {
  const rows = new Set<string>()
  const record = jest.fn(
    async ({
      alertId,
      tweets,
    }: {
      alertId: string
      tweets: MatchedTweetRef[]
    }) => {
      const owner = alerts().find((a) => a.id === alertId)!
      let inserted = 0
      for (const tweet of eligibleFor(tweets, owner)) {
        const key = recordedKey(alertId, tweet.id)
        if (rows.has(key)) continue
        rows.add(key)
        inserted += 1
      }
      return inserted
    },
  )
  const listRecorded = jest.fn(async (alertIds: string[], ids: string[]) => {
    const found = new Set<string>()
    for (const a of alertIds)
      for (const id of ids)
        if (rows.has(recordedKey(a, id))) found.add(recordedKey(a, id))
    return found
  })
  return { rows, record, listRecorded }
}

function setup(
  alerts: CheckableAlert[],
  corpus: CorpusTweet[],
  overrides: Partial<SearchAlertRunDeps> = {},
) {
  const log = matchLog(() => alerts)
  let now = new Date('2026-11-20T10:00:00.000Z')
  const deps = {
    listAlerts: jest.fn(async () => alerts),
    listRecorded: log.listRecorded,
    record: log.record,
    recordFailure: jest.fn(async () => undefined),
    now: () => now,
    ...overrides,
    fetcher: (overrides.fetcher ?? gateway(corpus)) as unknown as jest.Mock,
  }
  return {
    deps,
    log,
    corpus,
    run: () => runSearchAlertChecks(deps as SearchAlertRunDeps),
    setNow: (iso: string) => {
      now = new Date(iso)
    },
  }
}

test('groups identical searches regardless of case, stalest first', () => {
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

test('identical alerts share one gateway call over the lookback window', async () => {
  const { deps, run } = setup(
    [alert({ id: 'x' }), alert({ id: 'y', userId: 'v' })],
    [{ tweetId: '30', createdAt: '2026-11-20 09:30:00' }],
  )
  const result = await run()
  expect(deps.fetcher).toHaveBeenCalledTimes(1)
  // Seven days before now (the alerts are older than that window's start).
  expect(deps.fetcher.mock.calls[0][1].get('since')).toBe('2026-11-15')
  expect(result).toMatchObject({ newMatches: 2, alertsWithMatches: 2 })
})

test('a tweet created before the last check but first seen after it is reported once', async () => {
  const corpus: CorpusTweet[] = [
    { tweetId: '20', createdAt: '2026-11-20 08:30:00' },
  ]
  const { run, setNow, deps } = setup([alert()], corpus)

  expect(await run()).toMatchObject({ newMatches: 1 })

  // An hour later the archive ingests a tweet posted before the first check.
  corpus.push({ tweetId: '15', createdAt: '2026-11-19 22:00:00' })
  setNow('2026-11-20T11:00:00.000Z')
  expect(await run()).toMatchObject({ newMatches: 1 })
  expect(deps.record).toHaveBeenLastCalledWith(
    expect.objectContaining({
      tweets: [expect.objectContaining({ id: '15' })],
    }),
  )

  // Re-running reports nothing.
  setNow('2026-11-20T12:00:00.000Z')
  expect(await run()).toMatchObject({ newMatches: 0, alertsWithMatches: 0 })
})

test('a tweet created before the alert is never reported', async () => {
  const fresh = alert({ createdAt: '2026-11-20T09:00:00.000Z' })
  const { run, deps } = setup(
    [fresh],
    [
      { tweetId: '31', createdAt: '2026-11-20 09:30:00' },
      { tweetId: '29', createdAt: '2026-11-20 08:59:00' },
      { tweetId: '10', createdAt: '2026-11-18 08:00:00' },
    ],
  )
  // The search starts on the alert's creation day, not a week back.
  expect(await run()).toMatchObject({ newMatches: 1 })
  expect(deps.fetcher.mock.calls[0][1].get('since')).toBe('2026-11-20')
  expect(await run()).toMatchObject({ newMatches: 0 })
})

test('pages on while a page holds unseen tweets, up to four pages', async () => {
  const corpus = Array.from({ length: 260 }, (_, i) => ({
    tweetId: String(1000 - i),
    createdAt: new Date(Date.parse('2026-11-20T09:59:00Z') - i * 60_000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19),
  }))
  const { run, deps } = setup([alert()], corpus)
  expect(await run()).toMatchObject({ newMatches: 200, pagesRead: 4 })
  expect(deps.fetcher).toHaveBeenCalledTimes(MAX_PAGES_PER_SEARCH)
  expect(
    deps.fetcher.mock.calls.map((c) => (c[1] as URLSearchParams).get('offset')),
  ).toEqual([null, '50', '100', '150'])

  // Next run: the first page is all seen, so one page is enough.
  deps.fetcher.mockClear()
  expect(await run()).toMatchObject({ newMatches: 0, pagesRead: 1 })
  expect(deps.fetcher).toHaveBeenCalledTimes(1)
})

test('a short page ends the window without another request', async () => {
  const { run, deps } = setup(
    [alert()],
    [{ tweetId: '5', createdAt: '2026-11-20 09:00:00' }],
  )
  expect(await run()).toMatchObject({ pagesRead: 1 })
  expect(deps.fetcher).toHaveBeenCalledTimes(1)
})

test('a gateway failure records nothing and does not stop other searches', async () => {
  const corpus: CorpusTweet[] = [
    { tweetId: '7', createdAt: '2026-11-20 09:00:00', q: 'broken' },
    { tweetId: '8', createdAt: '2026-11-20 09:00:00', q: 'fine' },
  ]
  const healthy = gateway(corpus)
  let down = true
  const { run, deps } = setup(
    [alert({ id: 'b', query: 'broken' }), alert({ id: 'f', query: 'fine' })],
    corpus,
    {
      fetcher: jest.fn(async (path: string[], params: URLSearchParams) => {
        if (down && params.get('q') === 'broken') throw new Error('gateway 502')
        return healthy(path, params)
      }) as never,
    },
  )
  expect(await run()).toMatchObject({
    failedSearches: 1,
    failedAlerts: 1,
    newMatches: 1,
  })
  expect(deps.record).not.toHaveBeenCalledWith(
    expect.objectContaining({ alertId: 'b' }),
  )
  expect(deps.recordFailure).toHaveBeenCalledWith(['b'], 'gateway 502')

  // The tweet missed during the outage is reported on the next run.
  down = false
  expect(await run()).toMatchObject({ newMatches: 1, failedSearches: 0 })
})

test('a failed write for one alert does not fail the rest', async () => {
  const { run } = setup(
    [alert({ id: 'x' }), alert({ id: 'y', userId: 'v' })],
    [{ tweetId: '30', createdAt: '2026-11-20 09:30:00' }],
    {
      record: jest.fn(async ({ alertId }: { alertId: string }) => {
        if (alertId === 'x') throw new Error('db down')
        return 1
      }) as never,
    },
  )
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  expect(await run()).toMatchObject({ failedAlerts: 1, alertsWithMatches: 1 })
})

test('bounds the distinct searches per run', async () => {
  const { run, deps } = setup(
    Array.from({ length: 5 }, (_, i) =>
      alert({ id: String(i), query: `q${i}` }),
    ),
    [],
    { maxSearches: 2 },
  )
  expect(await run()).toMatchObject({ searches: 2, deferredSearches: 3 })
  expect(deps.fetcher).toHaveBeenCalledTimes(2)
})

test('stops starting searches after the run deadline', async () => {
  const { run, deps } = setup(
    Array.from({ length: 6 }, (_, i) =>
      alert({ id: String(i), query: `q${i}` }),
    ),
    [],
    { deadlineMs: -1 },
  )
  expect(await run()).toMatchObject({ searches: 0, deferredSearches: 6 })
  expect(deps.fetcher).not.toHaveBeenCalled()
})

test('the match log outlives the lookback, so pruning cannot cause re-reports', () => {
  // A tweet inside the window was recorded after it was created: at most
  // the lookback plus the day `since` rounds down to.
  expect(MATCH_LOG_RETENTION_DAYS).toBeGreaterThan(
    SEARCH_ALERT_LOOKBACK_DAYS + 1,
  )
})
