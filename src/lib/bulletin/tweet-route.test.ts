import { createHash } from 'crypto'
import { GET } from '@/app/api/bulletin/tweet/[id]/route'
import {
  loadBulletinBoardState,
  requireOpportunityUser,
  type StoredNotice,
} from './data'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import type { TweetData } from '@/lib/tweets/types'

jest.mock('./data', () => ({
  loadBulletinBoardState: jest.fn(),
  requireOpportunityUser: jest.fn(),
}))
jest.mock('@/lib/clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))
jest.mock('@/lib/clickhouseTweetPage', () => ({
  fetchClickHouseTweetPageData: jest.fn(),
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
  jest.mocked(fetchClickHouseTweetPageData).mockResolvedValue(detail)
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
  expect(fetchClickHouseTweetPageData).toHaveBeenCalledTimes(1)
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
  jest.mocked(requireOpportunityUser).mockRejectedValue(new Error('Sign in'))
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
    jest
      .mocked(fetchClickHouseTweetPageData)
      .mockResolvedValue({ ...detail, account_id: 'b' })
  if (reason === 'changed text')
    jest
      .mocked(fetchClickHouseTweetPageData)
      .mockResolvedValue({ ...detail, full_text: 'Changed' })
  if (reason === 'upstream failure')
    jest
      .mocked(fetchAnalyticsGatewayJson)
      .mockRejectedValue(new Error('Unavailable'))
  const result = await call()
  expect(result.status).toBe(reason === 'missing notice' ? 404 : 503)
  expect(await result.json()).not.toHaveProperty('text')
})
