import { createHash } from 'crypto'
import { GET as BATCH_GET } from '@/app/api/bulletin/tweets/route'
import { GET } from '@/app/api/bulletin/tweet/[id]/route'
import {
  loadBulletinBoardState,
  requireBulletinUser,
  type StoredNotice,
} from './data'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { fetchClickHouseTweetThreadPageData } from '@/lib/clickhouseTweetPage'
import type { TweetData } from '@/lib/tweets/types'

jest.mock('./data', () => ({
  loadBulletinBoardState: jest.fn(),
  requireBulletinUser: jest.fn(),
}))
jest.mock('@/lib/clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))
jest.mock('@/lib/clickhouseTweetPage', () => ({
  fetchClickHouseTweetThreadPageData: jest.fn(),
}))
const hash = createHash('sha256').update('Offer: help').digest('hex')
const notice = {
  tweet_id: '123',
  account_id: 'a',
  content_hash: hash,
} as StoredNotice
const detail = {
  tweet_id: '123',
  account_id: 'a',
  username: 'alice',
  account_display_name: 'Alice',
  full_text: 'Offer: help',
  media: [{ media_url: 'https://example.com/photo.jpg', media_type: 'photo' }],
} as TweetData
const call = () =>
  GET(new Request('http://localhost/api/bulletin/tweet/123'), {
    params: { id: '123' },
  })
beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(loadBulletinBoardState).mockResolvedValue({ notices: [notice] })
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({
    data: [
      {
        ...notice,
        full_text: 'Offer: help',
        reply_to_tweet_id: null,
        retweet: false,
      },
    ],
  })
  jest
    .mocked(fetchClickHouseTweetThreadPageData)
    .mockResolvedValue({ tweet: detail, threadTree: null })
})
test('starts independent reads together but does not publish until consent state resolves', async () => {
  let release!: (state: { notices: StoredNotice[] }) => void
  jest.mocked(loadBulletinBoardState).mockReturnValue(
    new Promise((resolve) => {
      release = resolve
    }),
  )
  const response = call()
  await Promise.resolve()
  expect(fetchAnalyticsGatewayJson).toHaveBeenCalledTimes(1)
  expect(fetchClickHouseTweetThreadPageData).toHaveBeenCalledTimes(1)
  release({ notices: [notice] })
  const result = await response
  expect(result.status).toBe(200)
  expect(result.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await result.json()).toMatchObject({
    text: 'Offer: help',
    media: [{ url: 'https://example.com/photo.jpg' }],
  })
})
test('never starts reads before authentication succeeds', async () => {
  jest.mocked(requireBulletinUser).mockRejectedValue(new Error('Sign in'))
  await expect(call()).rejects.toThrow('Sign in')
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
  expect(loadBulletinBoardState).not.toHaveBeenCalled()
})
test.each([
  'missing notice',
  'changed author',
  'changed text',
  'upstream failure',
])('fails closed for %s', async (reason) => {
  if (reason === 'missing notice')
    jest.mocked(loadBulletinBoardState).mockResolvedValue({ notices: [] })
  if (reason === 'changed author')
    jest.mocked(fetchClickHouseTweetThreadPageData).mockResolvedValue({
      tweet: { ...detail, account_id: 'b' },
      threadTree: null,
    })
  if (reason === 'changed text')
    jest.mocked(fetchClickHouseTweetThreadPageData).mockResolvedValue({
      tweet: { ...detail, full_text: 'Changed' },
      threadTree: null,
    })
  if (reason === 'upstream failure')
    jest
      .mocked(fetchAnalyticsGatewayJson)
      .mockRejectedValue(new Error('Unavailable'))
  const result = await call()
  expect(result.status).toBe(reason === 'missing notice' ? 404 : 503)
  expect(await result.json()).not.toHaveProperty('text')
})

test('a batch shares policy/source reads and suppresses a changed tweet independently', async () => {
  const other = { ...notice, tweet_id: '124' }
  jest
    .mocked(loadBulletinBoardState)
    .mockResolvedValue({ notices: [notice, other] })
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({
    data: [
      {
        ...notice,
        full_text: 'Offer: help',
        reply_to_tweet_id: null,
        retweet: false,
      },
      {
        ...other,
        full_text: 'Offer: help',
        reply_to_tweet_id: null,
        retweet: false,
      },
    ],
  })
  jest
    .mocked(fetchClickHouseTweetThreadPageData)
    .mockImplementation(async (id) => ({
      tweet: {
        ...detail,
        tweet_id: id,
        full_text: id === '124' ? 'changed' : detail.full_text,
      },
      threadTree: null,
    }))
  const response = await BATCH_GET(
    new Request('http://localhost/api/bulletin/tweets?ids=123,124'),
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ tweets: [{ id: '123' }] })
  expect(loadBulletinBoardState).toHaveBeenCalledTimes(1)
  expect(fetchAnalyticsGatewayJson).toHaveBeenCalledTimes(1)
  expect(fetchAnalyticsGatewayJson).toHaveBeenCalledWith(
    ['bulletin-sources'],
    new URLSearchParams({ ids: '123,124' }),
  )
})

test.each(['', 'bad', '1,2,3,4,5,6,7,8,9'])(
  'rejects invalid or oversized batches before reads: %s',
  async (ids) => {
    expect(
      (
        await BATCH_GET(
          new Request('http://localhost/api/bulletin/tweets?ids=' + ids),
        )
      ).status,
    ).toBe(400)
    expect(loadBulletinBoardState).not.toHaveBeenCalled()
    expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
  },
)

test('batch reads require authentication', async () => {
  jest.mocked(requireBulletinUser).mockRejectedValue(new Error('Sign in'))
  await expect(
    BATCH_GET(new Request('http://localhost/api/bulletin/tweets?ids=123')),
  ).rejects.toThrow('Sign in')
  expect(loadBulletinBoardState).not.toHaveBeenCalled()
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
})
test('returns archived replies beneath the notice, oldest first, without placeholders', async () => {
  const reply = (tweet_id: string, created_at: string, extra = {}) => ({
    tweet_id,
    account_id: 'r',
    username: 'ray',
    account_display_name: 'Ray',
    full_text: `Reply ${tweet_id}`,
    created_at,
    favorite_count: 1,
    retweet_count: 0,
    reply_to_tweet_id: '123',
    reply_to_user_id: null,
    reply_to_username: 'alice',
    ...extra,
  })
  jest.mocked(fetchClickHouseTweetThreadPageData).mockResolvedValue({
    tweet: detail,
    threadTree: {
      root: '123',
      roots: ['123'],
      tweets: {
        '123': reply('123', '2026-09-01T00:00:00Z'),
        '2': reply('2', '2026-09-03T00:00:00Z'),
        '3': reply('3', '2026-09-02T00:00:00Z'),
        '4': reply('4', '2026-09-04T00:00:00Z', {
          is_deleted_placeholder: true,
        }),
        '5': reply('5', '2026-09-05T00:00:00Z'),
      },
      children: { '123': ['2', '3', '4'], '4': ['5'] },
      parents: {},
      paths: {},
    } as never,
  })
  const body = await (await call()).json()
  expect(body.replies.map((r: { id: string }) => r.id)).toEqual(['3', '2', '5'])
  expect(body.replies[0]).toMatchObject({ username: 'ray', text: 'Reply 3' })
})
