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
        createdAt: '2010-01-02T03:04:05.000Z',
        bio: 'Hello',
        website: 'https://alice.example',
        location: 'Internet',
        avatarUrl: 'https://pbs.twimg.com/profile_images/42/avatar_normal.jpg',
        headerUrl: 'https://example.com/header.jpg',
        followers: '12',
        following: '3',
        statusCount: '45',
        likeCount: '67',
      },
      membership: {
        isMember: true,
        hasArchive: true,
        isOptedIn: false,
        joinedAt: '2024-01-02T00:00:00.000Z',
        snapshotAt: '2026-08-17T12:00:00.000Z',
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
        avatar_media_url:
          'https://pbs.twimg.com/profile_images/42/avatar_normal.jpg',
        num_followers: 12,
        num_tweets: 45,
        num_likes: 67,
        created_at: '2010-01-02T03:04:05.000Z',
        website: 'https://alice.example',
        location: 'Internet',
        joined_at: '2024-01-02T00:00:00.000Z',
        has_archive: true,
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
      membershipResolved: true,
    }),
  )
  expect(fetchGateway).toHaveBeenCalledWith(
    ['user', '42'],
    new URLSearchParams({
      limit: '20',
      include_interactions: 'false',
      include_top_tweets: 'false',
    }),
    { revalidate: 300, timeoutMs: 8_000 },
  )
})

test('degrades to not found for an unavailable or invalid account', async () => {
  fetchGateway.mockRejectedValueOnce(new Error('not found'))
  await expect(getClickHouseUserProfile('missing')).resolves.toBeNull()
})
