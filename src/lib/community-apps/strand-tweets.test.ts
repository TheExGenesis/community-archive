import { getStrandTweets } from './strand-tweets'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { isClickHouseReadsEnabled } from '@/lib/clickhouseGateway'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import { enrichPortalTweets } from '@/lib/portal/data'
import { getAppPolicy } from './data'
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/clickhouseGateway', () => ({
  isClickHouseReadsEnabled: jest.fn(),
}))
jest.mock('@/lib/clickhouseTweetPage', () => ({
  fetchClickHouseTweetPageData: jest.fn(),
}))
jest.mock('@/lib/portal/data', () => ({ enrichPortalTweets: jest.fn() }))
jest.mock('./data', () => ({ getAppPolicy: jest.fn() }))
beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(getAppPolicy)
    .mockResolvedValue({
      blocked: new Set(['withdrawn']),
      blockedIds: new Set(['blocked-id']),
      members: new Set(),
    })
})
test('current opt-outs filter both authors and quoted authors after full enrichment', async () => {
  jest.mocked(isClickHouseReadsEnabled).mockReturnValue(false)
  const query = {
    select: jest.fn().mockReturnThis(),
    in: jest
      .fn()
      .mockResolvedValue({
        data: [
          {
            tweet_id: '123',
            username: 'member',
            created_at: '2020-01-01',
            full_text: 'complete source',
          },
        ],
        error: null,
      }),
  }
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => query } as never)
  const media = [{ url: 'https://example.org/photo.jpg', type: 'photo' }]
  jest.mocked(enrichPortalTweets).mockImplementation(async (tweets) => [
    {
      ...tweets[0],
      media,
      quotedTweet: {
        id: '234',
        username: 'WITHDRAWN',
        name: 'removed',
        text: 'hidden',
      } as never,
    },
    { ...tweets[0], id: '345', username: 'renamed', accountId: 'blocked-id' },
  ])
  const result = await getStrandTweets(['123', '123', '../bad'])
  expect(query.in).toHaveBeenCalledWith('tweet_id', ['123'])
  expect(Array.from(result.keys())).toEqual(['123'])
  expect(result.get('123')).toMatchObject({
    text: 'complete source',
    media,
    quotedTweet: undefined,
  })
})
test('ClickHouse failures propagate without querying another record source', async () => {
  jest.mocked(isClickHouseReadsEnabled).mockReturnValue(true)
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
  jest.mocked(isClickHouseReadsEnabled).mockReturnValue(true)
  jest
    .mocked(fetchClickHouseTweetPageData)
    .mockRejectedValue(
      new Error('ClickHouse analytics request failed (404): not found'),
    )
  expect((await getStrandTweets(['123'])).size).toBe(0)
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
