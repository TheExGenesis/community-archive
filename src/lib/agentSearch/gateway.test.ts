jest.mock('@/lib/clickhouseGateway', () => ({
  ...jest.requireActual('@/lib/clickhouseGateway'),
  fetchAnalyticsGatewayJson: jest.fn(),
}))

import {
  AnalyticsGatewayError,
  fetchAnalyticsGatewayJson,
} from '@/lib/clickhouseGateway'
import {
  ApiV1Error,
  apiV1BaseUrl,
  getAccountTweets,
  getTweetsByIdsBatched,
  retryWhileBusy,
} from './gateway'

const v1Row = {
  tweet_id: '11',
  account_id: '7',
  username: 'maskys_',
  account_display_name: 'Kifah',
  avatar_media_url: null,
  created_at: '2025-03-18T12:00:00.000Z',
  full_text: 'hello',
  favorite_count: 5,
  retweet_count: 2,
  reply_to_tweet_id: '10',
  reply_to_user_id: '8',
  reply_to_username: 'bob',
  quoted_tweet_id: '9',
  retweeted_tweet_id: null,
  conversation_id: '10',
  media: [
    {
      media_id: 'm',
      media_url: 'https://x/m.jpg',
      media_type: 'photo',
      width: 10,
      height: 20,
    },
  ],
  urls: [],
  mentioned_account_ids: [],
}

describe('API v1 timeline', () => {
  const env = { ...process.env }
  let fetchMock: jest.Mock

  beforeEach(() => {
    process.env.CLICKHOUSE_SEARCH_API_URL = 'http://gw.test/'
    process.env.CLICKHOUSE_ANALYTICS_API_TOKEN = 'site-token'
    delete process.env.COMMUNITY_ARCHIVE_API_V1_URL
    delete process.env.COMMUNITY_ARCHIVE_API_KEY
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [v1Row], next_cursor: 'n1' }),
    }))
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterAll(() => {
    process.env = env
  })

  test('asks for one page and maps the API fields to agent tweets', async () => {
    const page = await getAccountTweets({
      account: '@maskys_',
      order: 'asc',
      since: '2025-01-01',
      excludeRetweets: true,
      limit: 500,
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'http://gw.test/v1/accounts/maskys_/tweets?order=asc&limit=200&since=2025-01-01&exclude_retweets=true',
    )
    expect(init.headers.Authorization).toBe('Bearer site-token')
    expect(page.nextCursor).toBe('n1')
    expect(page.tweets[0]).toMatchObject({
      id: '11',
      username: 'maskys_',
      name: 'Kifah',
      text: 'hello',
      likes: 5,
      rts: 2,
      replyToTweetId: '10',
      replyToUsername: 'bob',
      quoteTweetId: '9',
      media: [{ url: 'https://x/m.jpg', type: 'photo', width: 10, height: 20 }],
    })
  })

  test('keeps the @ on a numeric username, and uses an explicit base and key', async () => {
    process.env.COMMUNITY_ARCHIVE_API_V1_URL = 'https://api.test/v1/'
    process.env.COMMUNITY_ARCHIVE_API_KEY = 'cak_test'
    await getAccountTweets({ account: '@12345', cursor: 'c2' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://api.test/v1/accounts/%4012345/tweets?order=desc&limit=200&cursor=c2',
    )
    expect(init.headers.Authorization).toBe('Bearer cak_test')
    expect(
      apiV1BaseUrl({ CLICKHOUSE_ANALYTICS_API_URL: 'http://a/analytics/' }),
    ).toBe('http://a/v1')
    expect(apiV1BaseUrl({})).toBeUndefined()
  })

  test('turns an API error into an ApiV1Error with its status and code', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 'not_found', message: 'account not found' },
        request_id: 'r',
      }),
    })
    await expect(getAccountTweets({ account: 'nobody' })).rejects.toEqual(
      expect.objectContaining({ status: 404, code: 'not_found' }),
    )
    await expect(
      getAccountTweets({ account: 'nobody' }),
    ).rejects.toBeInstanceOf(ApiV1Error)
  })

  /** A response with an optional Retry-After header. */
  const reply = (status: number, body: unknown, retryAfter?: string) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'retry-after' ? (retryAfter ?? null) : null,
    },
    json: async () => body,
  })
  const page = { data: [v1Row], next_cursor: null }
  const limited = (code: string) => ({
    error: { code, message: code },
    request_id: 'r',
  })

  describe('on 429 and 503', () => {
    afterEach(() => jest.useRealTimers())

    test('waits Retry-After, at most 10 s and 1 s when missing, then retries', async () => {
      jest.useFakeTimers()
      fetchMock
        .mockResolvedValueOnce(reply(429, limited('rate_limited'), '2'))
        .mockResolvedValueOnce(reply(503, limited('unavailable'), '600'))
        .mockResolvedValueOnce(reply(200, page))
      const result = getAccountTweets({ account: 'x' })
      await jest.advanceTimersByTimeAsync(1_999)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      // 600 s is cut to 10 s.
      await jest.advanceTimersByTimeAsync(9_999)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      await jest.advanceTimersByTimeAsync(1)
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect((await result).tweets[0].id).toBe('11')

      fetchMock.mockReset()
      fetchMock
        .mockResolvedValueOnce(reply(429, limited('rate_limited')))
        .mockResolvedValueOnce(reply(200, page))
      const unhinted = getAccountTweets({ account: 'x' })
      await jest.advanceTimersByTimeAsync(999)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(1)
      await expect(unhinted).resolves.toMatchObject({ nextCursor: null })
    })

    test('gives up after three attempts with the last status and code', async () => {
      fetchMock.mockResolvedValue(reply(503, limited('unavailable'), '0'))
      await expect(getAccountTweets({ account: 'x' })).rejects.toEqual(
        expect.objectContaining({ status: 503, code: 'unavailable' }),
      )
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    test('does not wait or retry past the run deadline', async () => {
      fetchMock.mockResolvedValue(reply(429, limited('rate_limited'), '8'))
      const started = Date.now()
      await expect(
        getAccountTweets({ account: 'x' }, { deadlineAt: Date.now() + 5_000 }),
      ).rejects.toEqual(expect.objectContaining({ status: 429 }))
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(Date.now() - started).toBeLessThan(1_000)
    })

    test('a stopped run ends the wait and the call', async () => {
      fetchMock.mockResolvedValue(reply(429, limited('rate_limited'), '8'))
      const run = new AbortController()
      const started = Date.now()
      const waiting = getAccountTweets(
        { account: 'x' },
        {
          abortSignal: run.signal,
        },
      )
      await new Promise((resolve) => setTimeout(resolve, 10))
      run.abort(new Error('stopped'))
      await expect(waiting).rejects.toThrow('stopped')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(Date.now() - started).toBeLessThan(1_000)

      // A request in flight is aborted too.
      const inFlight = new AbortController()
      fetchMock.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () =>
              reject(init.signal.reason),
            ),
          ),
      )
      const pending = getAccountTweets(
        { account: 'x' },
        {
          abortSignal: inFlight.signal,
        },
      )
      inFlight.abort(new Error('stopped mid-call'))
      await expect(pending).rejects.toThrow('stopped mid-call')
    })

    test("lets go of the run's signal after each attempt", async () => {
      fetchMock
        .mockResolvedValueOnce(reply(503, limited('unavailable'), '0'))
        .mockResolvedValueOnce(reply(200, page))
      const run = new AbortController()
      const added = jest.spyOn(run.signal, 'addEventListener')
      const removed = jest.spyOn(run.signal, 'removeEventListener')
      await getAccountTweets({ account: 'x' }, { abortSignal: run.signal })
      const abortListeners = (spy: jest.SpyInstance) =>
        spy.mock.calls.filter(([type]) => type === 'abort').length
      // Two attempts and the wait between them.
      expect(abortListeners(added)).toBe(3)
      expect(abortListeners(removed)).toBe(3)
    })
  })

  test('a 422 is not retried and keeps its code', async () => {
    fetchMock.mockResolvedValue(
      reply(422, limited('query_budget_exceeded'), '1'),
    )
    await expect(getAccountTweets({ account: 'x' })).rejects.toEqual(
      expect.objectContaining({ status: 422, code: 'query_budget_exceeded' }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('getTweetsByIdsBatched', () => {
  test('looks up every id, 100 per call and a few calls at once', async () => {
    let inFlight = 0
    let most = 0
    ;(fetchAnalyticsGatewayJson as jest.Mock).mockImplementation(
      async (_path: string[], params: URLSearchParams) => {
        most = Math.max(most, ++inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight--
        return {
          data: params
            .get('ids')!
            .split(',')
            .map((id) => ({
              tweet_id: id,
              account_id: '1',
              created_at: '2025-01-01 00:00:00',
              full_text: `t${id}`,
              reply_to_tweet_id: null,
              username: 'u',
            })),
        }
      },
    )
    const ids = Array.from({ length: 950 }, (_, i) => String(i + 1))
    const found = await getTweetsByIdsBatched([...ids, '1'])
    expect(found.map((t) => t.id).sort()).toEqual([...ids].sort())
    expect(fetchAnalyticsGatewayJson).toHaveBeenCalledTimes(10)
    expect(most).toBe(4)
  })
})

const busy = () =>
  new AnalyticsGatewayError(503, '{"error":"Search is busy; retry shortly."}')

test('retries a busy gateway and returns the later answer', async () => {
  const call = jest
    .fn()
    .mockRejectedValueOnce(busy())
    .mockRejectedValueOnce(busy())
    .mockResolvedValue('ok')
  await expect(retryWhileBusy({}, call, [1, 1])).resolves.toBe('ok')
  expect(call).toHaveBeenCalledTimes(3)
})

test('gives up once the retries are used', async () => {
  const call = jest.fn().mockRejectedValue(busy())
  await expect(retryWhileBusy({}, call, [1])).rejects.toThrow('(503)')
  expect(call).toHaveBeenCalledTimes(2)
})

test('does not retry other errors', async () => {
  const call = jest
    .fn()
    .mockRejectedValue(new AnalyticsGatewayError(500, 'boom'))
  await expect(retryWhileBusy({}, call, [1, 1])).rejects.toThrow('(500)')
  expect(call).toHaveBeenCalledTimes(1)
})

test('does not wait past the run deadline', async () => {
  const call = jest.fn().mockRejectedValue(busy())
  await expect(
    retryWhileBusy({ deadlineAt: Date.now() + 50 }, call, [1_000]),
  ).rejects.toThrow('(503)')
  expect(call).toHaveBeenCalledTimes(1)
})
