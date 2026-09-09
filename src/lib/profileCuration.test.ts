import { supplementalSectionIds } from './metaTwitter/sectionConfig'
import { getCuratedProfileBangersPage } from './profileCuration'
import { getProfileBangers, getProfileBangersPage } from './metaTwitter/bangers'
import { fetchClickHouseTweetPageData } from './clickhouseTweetPage'
import type { BangerTweet } from './metaTwitter/types'

jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('./metaTwitter/sectionConfig', () => ({
  supplementalSectionIds: jest.fn(() => ({})),
}))
const mockSupplemental = supplementalSectionIds as jest.MockedFunction<
  typeof supplementalSectionIds
>
beforeEach(() => {
  mockSupplemental.mockReturnValue({})
  jest.clearAllMocks()
})
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
jest.mock('./clickhouseTweetPage', () => ({
  fetchClickHouseTweetPageData: jest.fn(),
}))

const mockGetProfileBangers = getProfileBangers as jest.MockedFunction<
  typeof getProfileBangers
>
const mockGetProfileBangersPage = getProfileBangersPage as jest.MockedFunction<
  typeof getProfileBangersPage
>
const mockFetchTweet = fetchClickHouseTweetPageData as jest.MockedFunction<
  typeof fetchClickHouseTweetPageData
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
  mockFetchTweet.mockResolvedValue(null)
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

test('hydrates an owned manually added tweet outside the generated bangers set', async () => {
  const generated = [banger('1', 10)]
  mockGetProfileBangersPage.mockResolvedValue({
    tweets: generated,
    yearCounts: [{ year: 2025, count: 1 }],
    total: 1,
    nextOffset: null,
    available: true,
  })
  mockGetProfileBangers.mockResolvedValue({
    tweets: generated,
    yearCounts: [{ year: 2025, count: 1 }],
    total: 1,
    available: true,
  })
  mockFinalEq.mockResolvedValue({
    data: [
      {
        item_id: '2',
        is_hidden: false,
        is_featured: true,
        position: 0,
      },
    ],
    error: null,
  })
  mockFetchTweet.mockResolvedValue({
    tweet_id: '2',
    account_id: '42',
    created_at: '2025-02-01T00:00:00.000Z',
    full_text: 'Manually added',
    retweet_count: 2,
    favorite_count: 20,
    reply_to_tweet_id: null,
    reply_to_username: undefined,
    quote_tweet_id: null,
    retweeted_tweet_id: null,
    avatar_media_url: null,
    username: 'alice',
    account_display_name: 'Alice',
    media: [],
    urls: [],
  })

  const page = await getCuratedProfileBangersPage('42', {
    limit: 10,
    sort: 'quotes',
  })

  expect(mockFetchTweet).toHaveBeenCalledWith('2')
  expect(page.tweets.map((tweet) => tweet.tweet_id)).toEqual(['2', '1'])
  expect(page.tweets[0]).toMatchObject({
    full_text: 'Manually added',
    quote_count: 0,
    curation: { is_featured: true, position: 0 },
  })
  expect(page.total).toBe(2)
})

test('hydrates and paginates fallback representatives, deduplicating posts that later became bangers', async () => {
  mockSupplemental.mockReturnValue({ 2025: ['1', '2', '3', '4'] })
  const generated = [banger('1', 10)]
  mockGetProfileBangersPage.mockResolvedValue({
    tweets: generated,
    yearCounts: [{ year: 2025, count: 1 }],
    total: 1,
    nextOffset: null,
    available: true,
  })
  mockGetProfileBangers.mockResolvedValue({
    tweets: generated,
    yearCounts: [{ year: 2025, count: 1 }],
    total: 1,
    available: true,
  })
  mockFetchTweet.mockImplementation(async (id) => ({
    ...banger(id, 1),
    reply_to_tweet_id: null,
    reply_to_username: undefined,
    retweeted_tweet_id: null,
    urls: [],
    quoted_tweet: undefined,
    quote_tweet_id: null,
    // Wrong owner and wrong year must never enter the chapter.
    account_id: id === '3' ? '99' : '42',
    created_at: id === '4' ? '2024-01-01T00:00:00Z' : '2025-01-01T00:00:00Z',
    media: [],
  }))
  const first = await getCuratedProfileBangersPage('42', {
    year: 2025,
    limit: 1,
  })
  const second = await getCuratedProfileBangersPage('42', {
    year: 2025,
    limit: 1,
    offset: first.nextOffset!,
  })
  expect(first.tweets.map((tweet) => tweet.tweet_id)).toEqual(['1'])
  expect(second.tweets.map((tweet) => tweet.tweet_id)).toEqual(['2'])
  expect(second.nextOffset).toBeNull()
  expect(second.total).toBe(2)
  expect(mockFetchTweet).not.toHaveBeenCalledWith('1')
})

test('adds zero-banger chapter links without hydrating every year on the all-time page', async () => {
  mockSupplemental.mockReturnValue({ 2024: ['2', '3', '4', '5'] })
  mockGetProfileBangersPage.mockResolvedValue({
    tweets: [],
    yearCounts: [],
    total: 0,
    nextOffset: null,
    available: true,
  })
  mockFinalEq.mockResolvedValue({ data: [], error: null })
  const page = await getCuratedProfileBangersPage('42', { limit: 20 })
  expect(page.yearCounts).toEqual([{ year: 2024, count: 4 }])
  expect(mockGetProfileBangers).not.toHaveBeenCalled()
  expect(mockFetchTweet).not.toHaveBeenCalled()
})

test('fails visibly on a supplemental gateway failure instead of serving a successful empty chapter', async () => {
  mockSupplemental.mockReturnValue({ 2025: ['2'] })
  mockGetProfileBangersPage.mockResolvedValue({
    tweets: [],
    yearCounts: [],
    total: 0,
    nextOffset: null,
    available: true,
  })
  mockGetProfileBangers.mockResolvedValue({
    tweets: [],
    yearCounts: [],
    total: 0,
    available: true,
  })
  mockFetchTweet.mockRejectedValue(new Error('gateway unavailable'))
  const page = await getCuratedProfileBangersPage('42', {
    year: 2025,
    limit: 20,
  })
  expect(page.available).toBe(false)
})
