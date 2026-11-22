import { getStrandTweets } from './strand-tweets'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import { getAppPolicy } from './data'
// Kept only to prove the retired Supabase fallback is never reached.
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/clickhouseTweetPage', () => ({
  fetchClickHouseTweetPageData: jest.fn(),
}))
jest.mock('./data', () => ({ getAppPolicy: jest.fn() }))
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAppPolicy).mockResolvedValue({
    blocked: new Set(['withdrawn']),
    blockedIds: new Set(['blocked-id']),
    members: new Set(),
  })
})
test('current opt-outs filter both authors and quoted authors', async () => {
  const record = (id: string, username: string, accountId: string) => ({
    tweet_id: id,
    account_id: accountId,
    username,
    account_display_name: username,
    full_text: 'complete source',
    created_at: '2020-01-01',
    favorite_count: 1,
    retweet_count: 0,
    avatar_media_url: null,
    media: [
      { media_url: 'https://example.org/photo.jpg', media_type: 'photo' },
    ],
    quoted_tweet: {
      tweet_id: '234',
      account_id: 'withdrawn-id',
      username: 'WITHDRAWN',
      account_display_name: 'removed',
      full_text: 'hidden',
      created_at: '2020-01-01',
      favorite_count: 0,
      retweet_count: 0,
    },
  })
  jest
    .mocked(fetchClickHouseTweetPageData)
    .mockImplementation(async (id: string) =>
      id === '123'
        ? (record('123', 'member', 'member-id') as never)
        : (record('345', 'renamed', 'blocked-id') as never),
    )
  const result = await getStrandTweets(['123', '123', '345', '../bad'])
  expect(fetchClickHouseTweetPageData).toHaveBeenCalledTimes(2)
  expect(Array.from(result.keys())).toEqual(['123'])
  expect(result.get('123')).toMatchObject({
    text: 'complete source',
    media: [{ url: 'https://example.org/photo.jpg', type: 'photo' }],
    quotedTweet: undefined,
  })
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
test('ClickHouse failures propagate without querying another record source', async () => {
  jest
    .mocked(fetchClickHouseTweetPageData)
    .mockRejectedValue(new Error('offline'))
  await expect(getStrandTweets(['123'])).rejects.toThrow('offline')
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
test('oversized reads are rejected before querying', async () => {
  await expect(
    getStrandTweets(Array.from({ length: 101 }, (_, i) => String(i))),
  ).rejects.toThrow('Too many')
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
test('an absent ClickHouse post stays absent without breaking the strand', async () => {
  jest
    .mocked(fetchClickHouseTweetPageData)
    .mockRejectedValue(
      new Error('ClickHouse analytics request failed (404): not found'),
    )
  expect((await getStrandTweets(['123'])).size).toBe(0)
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
