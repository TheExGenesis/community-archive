import { getCuratedProfileBangersPage } from './profileCuration'
import { getProfileBangers, getProfileBangersPage } from './metaTwitter/bangers'
import type { BangerTweet } from './metaTwitter/types'

const mockFinalEq = jest.fn()

jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: mockFinalEq,
        }),
      }),
    }),
  }),
}))

jest.mock('./metaTwitter/bangers', () => ({
  getProfileBangers: jest.fn(),
  getProfileBangersPage: jest.fn(),
}))

const mockGetProfileBangers = getProfileBangers as jest.MockedFunction<
  typeof getProfileBangers
>
const mockGetProfileBangersPage = getProfileBangersPage as jest.MockedFunction<
  typeof getProfileBangersPage
>

const banger = (id: string, quoteCount: number): BangerTweet => ({
  tweet_id: id,
  account_id: '42',
  created_at: '2025-01-01T00:00:00.000Z',
  full_text: `Banger ${id}`,
  favorite_count: quoteCount,
  retweet_count: 0,
  reply_to_username: null,
  username: 'alice',
  account_display_name: 'Alice',
  avatar_media_url: null,
  media: [],
  quote_count: quoteCount,
  quoting_accounts: quoteCount,
})

test('keeps persisted featured bangers ahead of the ClickHouse page boundary', async () => {
  const generated = [banger('1', 10), banger('2', 9), banger('3', 8)]
  mockGetProfileBangersPage.mockResolvedValue({
    tweets: generated.slice(0, 1),
    yearCounts: [{ year: 2025, count: 3 }],
    total: 3,
    nextOffset: 1,
    available: true,
  })
  mockGetProfileBangers.mockResolvedValue({
    tweets: generated,
    yearCounts: [{ year: 2025, count: 3 }],
    total: 3,
    available: true,
  })
  mockFinalEq.mockResolvedValue({
    data: [
      {
        item_id: '3',
        is_hidden: false,
        is_featured: true,
        position: null,
      },
    ],
    error: null,
  })

  const page = await getCuratedProfileBangersPage('42', {
    limit: 1,
    sort: 'quotes',
  })

  expect(page.tweets.map((tweet) => tweet.tweet_id)).toEqual(['3'])
  expect(page.tweets[0].curation?.is_featured).toBe(true)
  expect(page.nextOffset).toBe(1)
})
