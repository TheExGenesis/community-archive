import { getTweetPageData } from '@/lib/getTweetPageData'
import { loadTweetPage } from './loadTweetPage'
import { getStoredTweetPageSummary } from './store'

jest.mock('server-only', () => ({}))
// React 18's client build has no cache(); per-request dedupe is irrelevant here.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}))
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => {
    throw new Error('the cached permalink must not read the request')
  }),
}))
jest.mock('@/lib/getTweetPageData', () => ({ getTweetPageData: jest.fn() }))
jest.mock('./store', () => ({ getStoredTweetPageSummary: jest.fn() }))

const tweet = {
  tweet_id: '123',
  account_id: '1',
  username: 'alice',
  account_display_name: 'Alice',
  created_at: '2026-10-20T00:00:00Z',
  full_text: 'The original tweet',
  favorite_count: 1,
  retweet_count: 0,
  reply_to_tweet_id: null,
  quote_tweet_id: null,
  retweeted_tweet_id: null,
  avatar_media_url: null,
  media: [],
  urls: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getTweetPageData as jest.Mock).mockResolvedValue({
    tweet,
    threadTree: null,
  })
})

test('a missing summary is reported, never generated, without reading the request', async () => {
  ;(getStoredTweetPageSummary as jest.Mock).mockResolvedValue('missing')

  expect(await loadTweetPage('123')).toMatchObject({
    summary: null,
    summaryMissing: true,
  })
})

test('a stored summary is shown to everyone', async () => {
  const summary = { title: 'A title', description: 'A description' }
  ;(getStoredTweetPageSummary as jest.Mock).mockResolvedValue(summary)

  expect(await loadTweetPage('125')).toMatchObject({
    summary,
    summaryMissing: false,
  })
})

test('a stored ineligible outcome stops the browser from asking again', async () => {
  ;(getStoredTweetPageSummary as jest.Mock).mockResolvedValue(null)

  expect(await loadTweetPage('126')).toMatchObject({
    summary: null,
    summaryMissing: false,
  })
})
