import { fetchClickHouseQuotePosts } from './clickhouseQuotePosts'

describe('fetchClickHouseQuotePosts', () => {
  test('maps current-member reverse quotes into sidebar tweet data', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      data: [
        {
          tweetId: '2085742928454951350',
          accountId: '701664918588755968',
          username: 'puheenix',
          displayName: 'Puheenjohtaja',
          avatarUrl: 'https://pbs.twimg.com/puheenix.jpg',
          createdAt: '2026-08-07 15:00:40.000',
          fullText: 'Quoted commentary',
          favoriteCount: '13',
          retweetCount: '3',
        },
      ],
      query: { total: '7' },
    })

    const result = await fetchClickHouseQuotePosts(
      '2085375983708692599',
      12,
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledWith(
      ['quote-posts', '2085375983708692599'],
      new URLSearchParams({
        limit: '12',
        offset: '0',
        exclude_self: 'true',
        quote_ca_users_only: 'true',
      }),
      { revalidate: 600 },
    )
    expect(result).toEqual({
      totalCount: 7,
      tweets: [
        expect.objectContaining({
          tweet_id: '2085742928454951350',
          quote_tweet_id: '2085375983708692599',
          created_at: '2026-08-07T15:00:40.000Z',
          username: 'puheenix',
          account_display_name: 'Puheenjohtaja',
          favorite_count: 13,
          retweet_count: 3,
          media: [],
        }),
      ],
    })
  })

  test('rejects non-numeric route IDs before calling the gateway', async () => {
    const fetcher = jest.fn()

    await expect(
      fetchClickHouseQuotePosts('not-a-tweet', 12, fetcher),
    ).resolves.toEqual({ tweets: [], totalCount: 0 })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
