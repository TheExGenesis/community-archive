import { NextRequest } from 'next/server'
import { GET } from '@/app/api/tweets/[tweet_id]/quotes/route'
import { canReadTweetConversation } from './tweetConversationAccess'
import { getQuotingTweetsPage } from './quotingTweets'

jest.mock('./tweetConversationAccess', () => ({
  canReadTweetConversation: jest.fn(),
}))
jest.mock('./quotingTweets', () => ({ getQuotingTweetsPage: jest.fn() }))

beforeEach(() => jest.resetAllMocks())

test('the pagination endpoint cannot bypass the preview', async () => {
  ;(canReadTweetConversation as jest.Mock).mockResolvedValue(false)
  const response = await GET(
    new NextRequest('https://example.com/api/tweets/123/quotes'),
    { params: { tweet_id: '123' } },
  )
  expect(response.status).toBe(403)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(getQuotingTweetsPage).not.toHaveBeenCalled()
})

test('opted-in visitors can still paginate quotes', async () => {
  ;(canReadTweetConversation as jest.Mock).mockResolvedValue(true)
  ;(getQuotingTweetsPage as jest.Mock).mockResolvedValue({
    tweets: [],
    totalCount: 0,
  })
  const response = await GET(
    new NextRequest('https://example.com/api/tweets/123/quotes?offset=12'),
    { params: { tweet_id: '123' } },
  )
  expect(response.status).toBe(200)
  expect(getQuotingTweetsPage).toHaveBeenCalledWith('123', 12, 12)
})
