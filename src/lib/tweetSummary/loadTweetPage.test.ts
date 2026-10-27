import { canReadTweetConversation } from '@/lib/tweetConversationAccess'
import { getTweetPageData } from '@/lib/getTweetPageData'
import { loadTweetPage } from './loadTweetPage'
import { getStoredTweetPageSummary } from './store'

jest.mock('server-only', () => ({}))
// React 18's client build has no cache(); per-request dedupe is irrelevant here.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}))
jest.mock('next/headers', () => ({ cookies: jest.fn(async () => ({})) }))
jest.mock('@/lib/tweetConversationAccess', () => ({
  canReadTweetConversation: jest.fn(),
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

test('guests receive only the main tweet, even when real context and a stored summary exist', async () => {
  ;(canReadTweetConversation as jest.Mock).mockResolvedValue(false)
  ;(getTweetPageData as jest.Mock).mockResolvedValue({
    tweet,
    threadTree: { tweets: { private: { full_text: 'Hidden reply' } } },
    quotingTweets: [{ full_text: 'Hidden quote' }],
    quotingTweetCount: 1,
    quotePosts: Promise.resolve({
      tweets: [{ full_text: 'Deferred hidden quote' }],
    }),
  })
  expect(await loadTweetPage('123')).toMatchObject({
    tweet,
    threadTree: null,
    quotingTweets: [],
    quotingTweetCount: 0,
    quotePosts: undefined,
    subject: { kind: 'tweet', context: [] },
    summary: null,
    summaryPending: false,
    canReadConversation: false,
  })
  expect(getStoredTweetPageSummary).not.toHaveBeenCalled()
  expect(getTweetPageData).toHaveBeenCalledWith(
    '123',
    expect.objectContaining({ skipQuotePosts: true }),
  )
})

test('opted-in visitors can load stored summaries and generate missing ones', async () => {
  ;(canReadTweetConversation as jest.Mock).mockResolvedValue(true)
  ;(getStoredTweetPageSummary as jest.Mock).mockResolvedValue('missing')
  expect(await loadTweetPage('123')).toMatchObject({
    summary: null,
    summaryPending: true,
    canReadConversation: true,
  })
  const summary = { title: 'A title', description: 'A description' }
  ;(getStoredTweetPageSummary as jest.Mock).mockResolvedValue(summary)
  expect(await loadTweetPage('123')).toMatchObject({
    summary,
    summaryPending: false,
  })
})
