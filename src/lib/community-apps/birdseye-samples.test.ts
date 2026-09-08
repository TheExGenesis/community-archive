import { getBirdseyeSamples } from './birdseye-samples'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getSourceTweets } from './source-tweets'
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('./source-tweets', () => ({ getSourceTweets: jest.fn() }))
const query = {
  select: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn(),
}
beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => query } as never)
})
test('selects owner posts by likes using only cited IDs, then renders the configured source records', async () => {
  query.limit.mockResolvedValue({
    data: [
      { tweet_id: '1', favorite_count: 3 },
      { tweet_id: '2', favorite_count: 8 },
      { tweet_id: '3', favorite_count: 5 },
    ],
    error: null,
  })
  jest.mocked(getSourceTweets).mockResolvedValue(
    new Map([
      ['1', { id: '1', username: 'alice', likes: 3 }],
      ['2', { id: '2', username: 'ALICE', likes: 8 }],
      ['3', { id: '3', username: 'alice', likes: 5 }],
    ] as never),
  )
  expect(
    (await getBirdseyeSamples(['1', '2', '3', '1', 'bad'], 'alice')).map(
      (tweet) => tweet.id,
    ),
  ).toEqual(['2', '3', '1'])
  expect(query.in).toHaveBeenCalledWith('tweet_id', ['1', '2', '3'])
  expect(query.ilike).toHaveBeenCalledWith('username', 'alice')
  expect(getSourceTweets).toHaveBeenCalledWith(['2', '3', '1'])
})
test('uses conversation context only when there are too few owner candidates', async () => {
  query.limit
    .mockResolvedValueOnce({
      data: [{ tweet_id: '1', favorite_count: 2 }],
      error: null,
    })
    .mockResolvedValueOnce({
      data: [{ tweet_id: '2', favorite_count: 50 }],
      error: null,
    })
  jest.mocked(getSourceTweets).mockResolvedValue(
    new Map([
      ['1', { id: '1', username: 'alice', likes: 2 }],
      ['2', { id: '2', username: 'bob', likes: 50 }],
    ] as never),
  )
  expect(
    (await getBirdseyeSamples(['1', '2'], 'alice')).map((tweet) => tweet.id),
  ).toEqual(['1', '2'])
})
test('does not silently select arbitrary posts when ranking is unavailable', async () => {
  query.limit.mockResolvedValue({
    data: null,
    error: { message: 'Unavailable' },
  })
  await expect(getBirdseyeSamples(['1'], 'alice')).rejects.toThrow(
    'Unable to rank',
  )
  expect(getSourceTweets).not.toHaveBeenCalled()
})
test('matches underscores in usernames literally', async () => {
  query.limit.mockResolvedValue({ data: [], error: null })
  jest.mocked(getSourceTweets).mockResolvedValue(new Map())
  await getBirdseyeSamples(['1'], 'alice_bob')
  expect(query.ilike).toHaveBeenCalledWith('username', 'alice\\_bob')
})
