import type { AnalyticsGatewayFetcher } from '@/lib/clickhouseGateway'
import {
  fetchClickHouseProfileInteractions,
  fetchClickHouseProfileMedia,
  fetchClickHouseProfileSidebar,
} from './clickhouseSidebar'

const response = (year: number | null) => ({
  data: {
    media: [
      {
        tweetId: '501',
        createdAt: '2025-02-03 04:05:06.000',
        fullText: 'A photo post',
        favoriteCount: '44',
        mediaUrl: 'https://pbs.twimg.com/media/501.jpg',
        mediaType: 'photo',
        width: '1200',
        height: '800',
      },
    ],
    mediaCount: '7',
    people: [
      {
        accountId: '7',
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: 'https://pbs.twimg.com/profile_images/7/avatar_normal.jpg',
        interactionCount: '9',
        mentionCount: '2',
        replyCount: '3',
        quoteCount: '1',
        repostCount: '3',
      },
    ],
  },
  query: {
    accountId: '42',
    year,
    mediaLimit: 6,
    peopleLimit: 8,
  },
})

test('maps year-scoped ClickHouse media and interactions for the sidebar', async () => {
  const fetcher = jest.fn(async () =>
    response(2025),
  ) as unknown as AnalyticsGatewayFetcher

  await expect(
    fetchClickHouseProfileSidebar('42', 2025, fetcher),
  ).resolves.toEqual({
    media: [
      {
        tweet_id: '501',
        created_at: '2025-02-03T04:05:06.000Z',
        favorite_count: 44,
        media_url: 'https://pbs.twimg.com/media/501.jpg',
        media_type: 'photo',
        width: 1200,
        height: 800,
      },
    ],
    mediaCount: 7,
    people: [
      {
        user_id: '7',
        screen_name: 'bob',
        name: 'Bob',
        interactions: 9,
        avatar_media_url:
          'https://pbs.twimg.com/profile_images/7/avatar_normal.jpg',
        in_archive: true,
      },
    ],
  })
  expect(fetcher).toHaveBeenCalledWith(
    ['user', '42', 'sidebar'],
    new URLSearchParams({
      media_limit: '6',
      people_limit: '8',
      year: '2025',
    }),
    { timeoutMs: 30_000 },
  )
})

test('loads media and interactions through independent gateway resources', async () => {
  const fetcher = jest.fn(async () =>
    response(2025),
  ) as unknown as AnalyticsGatewayFetcher

  const [media, interactions] = await Promise.all([
    fetchClickHouseProfileMedia('42', 2025, fetcher),
    fetchClickHouseProfileInteractions('42', 2025, fetcher),
  ])

  expect(media).toMatchObject({ mediaCount: 7, media: [{ tweet_id: '501' }] })
  expect(interactions).toMatchObject({
    people: [{ user_id: '7', screen_name: 'bob', interactions: 9 }],
  })
  expect(fetcher).toHaveBeenCalledWith(
    ['user', '42', 'media'],
    new URLSearchParams({ limit: '6', year: '2025' }),
    { timeoutMs: 30_000 },
  )
  expect(fetcher).toHaveBeenCalledWith(
    ['user', '42', 'interactions'],
    new URLSearchParams({ limit: '8', year: '2025' }),
    { timeoutMs: 30_000 },
  )
})

test('omits the year for the all-time sidebar and rejects scope drift', async () => {
  const allTimeFetcher = jest.fn(async () =>
    response(null),
  ) as unknown as AnalyticsGatewayFetcher
  await fetchClickHouseProfileSidebar('42', undefined, allTimeFetcher)

  expect(allTimeFetcher).toHaveBeenCalledWith(
    ['user', '42', 'sidebar'],
    new URLSearchParams({ media_limit: '6', people_limit: '8' }),
    { timeoutMs: 30_000 },
  )

  const wrongYearFetcher = jest.fn(async () =>
    response(2024),
  ) as unknown as AnalyticsGatewayFetcher
  await expect(
    fetchClickHouseProfileSidebar('42', 2025, wrongYearFetcher),
  ).rejects.toThrow('mismatched profile sidebar scope')
})
