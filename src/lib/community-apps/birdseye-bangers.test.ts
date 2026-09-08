import { getBirdseyeBangerScores } from './birdseye-bangers'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getAppPolicy } from './data'
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('./data', () => ({ getAppPolicy: jest.fn() }))
test('counts distinct member quotes, excluding self-quotes, nonmembers and opt-outs', async () => {
  const quote = (id: string, account: string, name: string) => ({
    tweet_id: id,
    quoted_tweet_id: '1',
    enriched_tweets: { account_id: account, username: name },
  })
  const query = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest
      .fn()
      .mockResolvedValue({
        data: [
          quote('10', 'owner', 'alice'),
          quote('11', 'b', 'bob'),
          quote('11', 'b', 'bob'),
          quote('12', 'c', 'carol'),
          quote('13', 'd', 'dave'),
          quote('14', 'e', 'erin'),
        ],
        error: null,
      }),
  }
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => query } as never)
  jest
    .mocked(getAppPolicy)
    .mockResolvedValue({
      members: new Set(['alice', 'bob', 'dave', 'erin']),
      blocked: new Set(['dave']),
      blockedIds: new Set(['e']),
    })
  expect(await getBirdseyeBangerScores(new Map([['1', 'owner']]))).toEqual(
    new Map([['1', 1]]),
  )
  expect(query.in).toHaveBeenCalledWith('quoted_tweet_id', ['1'])
  query.range.mockResolvedValue({
    data: null,
    error: { message: 'offline' },
  } as never)
  await expect(
    getBirdseyeBangerScores(new Map([['1', 'owner']])),
  ).rejects.toThrow('Unable to rank')
})
