import { createServerClient } from '@/utils/supabase'
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
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))
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

function signIn(user: object | null) {
  ;(createServerClient as jest.Mock).mockReturnValue({
    auth: { getUser: async () => ({ data: { user } }) },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getTweetPageData as jest.Mock).mockResolvedValue({
    tweet,
    threadTree: null,
  })
})

test('a missing summary is generated only for a signed-in visitor', async () => {
  ;(getStoredTweetPageSummary as jest.Mock).mockResolvedValue('missing')

  signIn(null)
  expect(await loadTweetPage('123')).toMatchObject({
    summary: null,
    summaryPending: false,
  })

  signIn({ id: 'user-1' })
  expect(await loadTweetPage('124')).toMatchObject({
    summary: null,
    summaryPending: true,
  })
})

test('a stored summary is shown to everyone without checking auth', async () => {
  const summary = { title: 'A title', description: 'A description' }
  ;(getStoredTweetPageSummary as jest.Mock).mockResolvedValue(summary)

  expect(await loadTweetPage('125')).toMatchObject({
    summary,
    summaryPending: false,
  })
  expect(createServerClient).not.toHaveBeenCalled()
})
