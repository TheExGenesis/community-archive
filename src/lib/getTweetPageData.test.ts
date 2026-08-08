import type { TweetData } from '@/components/TweetComponent'
import { createServerClient } from '@/utils/supabase'
import { isClickHouseReadsEnabled } from './clickhouseGateway'
import { fetchClickHouseTweetPageData } from './clickhouseTweetPage'
import { getTweetPageData } from './getTweetPageData'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))
jest.mock('./clickhouseGateway', () => ({
  isClickHouseReadsEnabled: jest.fn(),
}))
jest.mock('./clickhouseTweetPage', () => ({
  fetchClickHouseTweetPageData: jest.fn(),
}))

const clickHouseEnabledMock = isClickHouseReadsEnabled as jest.MockedFunction<
  typeof isClickHouseReadsEnabled
>
const fetchClickHouseTweetPageDataMock =
  fetchClickHouseTweetPageData as jest.MockedFunction<
    typeof fetchClickHouseTweetPageData
  >
const createServerClientMock = createServerClient as jest.MockedFunction<
  typeof createServerClient
>

describe('getTweetPageData ClickHouse routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders a portal tweet without querying the staging Supabase seed', async () => {
    const tweet = {
      tweet_id: '2085473085399150817',
      account_id: '10',
      created_at: '2026-08-07T12:00:00.000Z',
      full_text: 'The linked portal tweet',
      retweet_count: 4,
      favorite_count: 25,
      reply_to_tweet_id: null,
      quote_tweet_id: null,
      retweeted_tweet_id: null,
      avatar_media_url: null,
      username: 'alice',
      account_display_name: 'Alice',
      media: [],
      urls: [],
    } satisfies TweetData
    clickHouseEnabledMock.mockReturnValue(true)
    fetchClickHouseTweetPageDataMock.mockResolvedValue(tweet)

    await expect(getTweetPageData('2085473085399150817')).resolves.toEqual({
      tweet,
      threadTree: null,
    })
    expect(fetchClickHouseTweetPageDataMock).toHaveBeenCalledWith(
      '2085473085399150817',
    )
    expect(createServerClientMock).not.toHaveBeenCalled()
  })
})
