jest.mock('@/lib/clickhouseGateway', () => ({
  ...jest.requireActual('@/lib/clickhouseGateway'),
  fetchAnalyticsGatewayJson: jest.fn(),
}))

import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import {
  ApiV1Error,
  apiV1BaseUrl,
  getAccountTweets,
  getTweetsByIdsBatched,
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
