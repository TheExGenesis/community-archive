import { fetchAnalyticsGatewayJson } from './clickhouseGateway'
import { getClickHouseUserProfile } from './clickhouseUserProfile'

jest.mock('./clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))

const fetchGateway = fetchAnalyticsGatewayJson as jest.MockedFunction<
  typeof fetchAnalyticsGatewayJson
>

test('maps a corpus account into the public profile contract', async () => {
  fetchGateway.mockResolvedValueOnce({
    data: {
      account: {
        accountId: '42',
        username: 'alice',
        displayName: 'Alice',
        bio: 'Hello',
        avatarUrl: 'https://example.com/avatar.jpg',
        headerUrl: 'https://example.com/header.jpg',
        followers: '12',
        following: '3',
        statusCount: '45',
      },
      topTweets: [
        {
          tweetId: '99',
          createdAt: '2024-01-02T03:04:05.000Z',
          fullText: 'A top tweet',
          replyToUsername: 'bob',
          favoriteCount: '8',
          retweetCount: 2,
        },
      ],
    },
  })

  await expect(getClickHouseUserProfile('42')).resolves.toEqual(
    expect.objectContaining({
      user: expect.objectContaining({
        account_id: '42',
        username: 'alice',
        account_display_name: 'Alice',
        num_followers: 12,
        num_tweets: 45,
        has_archive: false,
        is_opted_in: false,
      }),
      topTweets: [
        {
          tweetId: '99',
          createdAt: '2024-01-02T03:04:05.000Z',
          fullText: 'A top tweet',
          replyToUsername: 'bob',
          favoriteCount: 8,
          retweetCount: 2,
        },
      ],
    }),
  )
})

test('degrades to not found for an unavailable or invalid account', async () => {
  fetchGateway.mockRejectedValueOnce(new Error('not found'))
  await expect(getClickHouseUserProfile('missing')).resolves.toBeNull()
})
