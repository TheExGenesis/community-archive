import {
  canPreviewTweetSearch,
  searchTweetPreviewsWithClickHouse,
  searchTweetsWithClickHouse,
} from './clickhouseSearch'

describe('searchTweetsWithClickHouse', () => {
  test('maps filters, pagination, accounts, and media to timeline tweets', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          data: {
            tweets: [
              {
                tweetId: '123',
                createdAt: '2025-01-01 00:00:00.000',
                fullText: 'Open source matters',
                replyToTweetId: null,
                favoriteCount: '4',
                retweetCount: '2',
                username: 'alice',
                accountDisplayName: 'Alice',
                avatarMediaUrl: 'https://example.com/avatar.jpg',
                media: [
                  {
                    mediaUrl: 'https://example.com/photo.jpg',
                    mediaType: 'photo',
                    width: 800,
                    height: 600,
                  },
                ],
              },
            ],
            nextOffset: 40,
          },
        }),
      ),
    })

    const tweets = await searchTweetsWithClickHouse(
      {
        searchQuery: 'Open & source',
        rawSearchQuery: 'Open source',
        fromUsername: 'alice',
        replyToUsername: 'bob',
        startDate: '2024-01-01',
        endDate: '2025-01-01',
        sort: 'likes',
      },
      2,
      20,
      fetchImpl as any,
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/tweet-search?q=Open+source&mode=phrase&limit=20&offset=20&from_user=alice&reply_to_user=bob&since=2024-01-01&until=2025-01-01&sort=likes',
      { cache: 'no-store' },
    )
    expect(tweets).toEqual([
      expect.objectContaining({
        tweet_id: '123',
        favorite_count: 4,
        retweet_count: 2,
        account: {
          username: 'alice',
          account_display_name: 'Alice',
          profile: {
            avatar_media_url: 'https://example.com/avatar.jpg',
          },
        },
        media: [
          {
            media_url: 'https://example.com/photo.jpg',
            media_type: 'photo',
            width: 800,
            height: 600,
          },
        ],
      }),
    ])
  })

  test('stops cleanly before requesting an offset beyond the gateway cap', async () => {
    const fetchImpl = jest.fn()

    const tweets = await searchTweetsWithClickHouse(
      { rawSearchQuery: 'archive', sort: 'likes' },
      252,
      20,
      fetchImpl as any,
    )

    expect(tweets).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('requests three newest non-retweets as a progressive preview', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          data: {
            tweets: ['123', '122', '121'].map((tweetId) => ({
              tweetId,
              accountId: '42',
              createdAt: '2026-08-13 00:00:00.000',
              fullText: 'Open source matters',
              replyToTweetId: null,
              favoriteCount: '4',
              retweetCount: '2',
              username: 'alice',
              accountDisplayName: 'Alice',
              avatarMediaUrl: null,
              media: [],
            })),
            nextOffset: null,
          },
        }),
      ),
    })

    const tweets = await searchTweetPreviewsWithClickHouse(
      {
        rawSearchQuery: 'Open source',
        excludeRetweets: true,
      },
      fetchImpl as any,
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/tweet-search?q=Open+source&mode=phrase&limit=3&offset=0&preview=true&exclude_retweets=true',
      { cache: 'no-store' },
    )
    expect(tweets.definitiveEmpty).toBe(false)
    expect(tweets.tweets.map((tweet) => tweet.tweet_id)).toEqual([
      '123',
      '122',
      '121',
    ])
  })

  test('only enables previews for ClickHouse newest text searches', () => {
    expect(canPreviewTweetSearch({ rawSearchQuery: 'archive' }, 'true')).toBe(
      true,
    )
    expect(
      canPreviewTweetSearch(
        { rawSearchQuery: 'archive', sort: 'likes' },
        'true',
      ),
    ).toBe(false)
    expect(canPreviewTweetSearch({ rawSearchQuery: 'archive' }, 'false')).toBe(
      false,
    )
  })
})
