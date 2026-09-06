import type { TweetData } from '@/components/TweetComponent'
import { getQuotingTweetsPage } from '@/lib/quotingTweets'
import type { PortalTweet } from '@/lib/portal/types'
import { loadDigestQuotePosts } from './quotePosts'

jest.mock('@/lib/quotingTweets', () => ({
  getQuotingTweetsPage: jest.fn(),
}))

const getQuotingTweetsPageMock = getQuotingTweetsPage as jest.MockedFunction<
  typeof getQuotingTweetsPage
>

const banger: PortalTweet = {
  id: '101',
  accountId: 'account-1',
  username: 'author',
  name: 'Author',
  avatar: null,
  text: 'The original post',
  observedAt: '2026-08-14T10:00:00Z',
  createdAt: '2026-08-14T10:00:00Z',
  likes: 278,
  rts: 26,
  media: [],
  quoteCount: 1,
}

const quotePost: TweetData = {
  tweet_id: '202',
  account_id: 'account-2',
  created_at: '2026-08-14T11:00:00Z',
  full_text: 'A useful quote post',
  retweet_count: 3,
  favorite_count: 12,
  reply_to_tweet_id: null,
  quote_tweet_id: '101',
  retweeted_tweet_id: null,
  avatar_media_url: null,
  username: 'commenter',
  account_display_name: 'Commenter',
  media: [],
  urls: [],
}

describe('loadDigestQuotePosts', () => {
  beforeEach(() => jest.clearAllMocks())

  test('loads and adapts archived quote posts for numeric bangers', async () => {
    getQuotingTweetsPageMock.mockResolvedValue({
      tweets: [quotePost],
      totalCount: 1,
      nextOffset: null,
    })

    await expect(
      loadDigestQuotePosts([banger, { ...banger, id: 'preview-id' }]),
    ).resolves.toEqual([
      {
        bangerId: '101',
        totalCount: 1,
        tweets: [
          expect.objectContaining({
            id: '202',
            text: 'A useful quote post',
            quotedTweet: expect.objectContaining({
              id: '101',
              text: 'The original post',
            }),
          }),
        ],
      },
    ])
    expect(getQuotingTweetsPageMock).toHaveBeenCalledWith('101', 0, 50)
  })

  test('keeps the article available when a quote-post read fails', async () => {
    getQuotingTweetsPageMock.mockRejectedValue(new Error('gateway down'))
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    await expect(loadDigestQuotePosts([banger])).resolves.toEqual([
      { bangerId: '101', tweets: [], totalCount: 0 },
    ])

    expect(consoleError).toHaveBeenCalledWith(
      'Digest quote-post read failed:',
      {
        tweetId: '101',
        error: 'gateway down',
      },
    )
    consoleError.mockRestore()
  })
})
