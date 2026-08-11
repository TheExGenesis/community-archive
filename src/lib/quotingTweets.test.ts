jest.mock('server-only', () => ({}), { virtual: true })

import { getQuotingTweetsPage } from './quotingTweets'
import { fetchClickHouseQuotePosts } from './clickhouseQuotePosts'
import { isClickHouseReadsEnabled } from './clickhouseGateway'

jest.mock('./clickhouseQuotePosts', () => ({
  fetchClickHouseQuotePosts: jest.fn(),
}))
jest.mock('./clickhouseGateway', () => ({
  isClickHouseReadsEnabled: jest.fn(),
}))

const fetchQuotePostsMock = fetchClickHouseQuotePosts as jest.MockedFunction<
  typeof fetchClickHouseQuotePosts
>
const isClickHouseReadsEnabledMock =
  isClickHouseReadsEnabled as jest.MockedFunction<
    typeof isClickHouseReadsEnabled
  >

describe('getQuotingTweetsPage', () => {
  beforeEach(() => {
    fetchQuotePostsMock.mockReset()
    isClickHouseReadsEnabledMock.mockReset().mockReturnValue(true)
  })

  test('pages ClickHouse quote posts and returns the next offset', async () => {
    fetchQuotePostsMock.mockResolvedValue({
      tweets: [
        {
          tweet_id: '202',
          account_id: '20',
          created_at: '2026-08-08T12:00:00.000Z',
          full_text: 'Complete quote post',
          retweet_count: 3,
          favorite_count: 12,
          reply_to_tweet_id: null,
          quote_tweet_id: '101',
          retweeted_tweet_id: null,
          avatar_media_url: null,
          username: 'bob',
          account_display_name: 'Bob',
          media: [
            {
              media_url: 'https://example.com/quote.jpg',
              media_type: 'photo',
            },
          ],
          urls: [],
        },
      ],
      totalCount: 20,
    })

    await expect(getQuotingTweetsPage('101', 12, 12)).resolves.toMatchObject({
      totalCount: 20,
      nextOffset: 13,
      tweets: [
        {
          tweet_id: '202',
          media: [{ media_url: 'https://example.com/quote.jpg' }],
        },
      ],
    })
    expect(fetchQuotePostsMock).toHaveBeenCalledWith('101', 12, 12)
  })
})
