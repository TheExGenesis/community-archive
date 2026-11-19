import { getBirdseyeBangerScores } from './birdseye-bangers'
import { fetchQuoteAuthors } from '@/lib/clickhouseCorpusReads'
import { getAppPolicy } from './data'
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('@/lib/clickhouseCorpusReads', () => ({
  fetchQuoteAuthors: jest.fn(),
}))
jest.mock('./data', () => ({ getAppPolicy: jest.fn() }))
test('counts distinct member quotes, excluding self-quotes, nonmembers and opt-outs', async () => {
  const quote = (tweetId: string, accountId: string, username: string) => ({
    tweetId,
    quotedTweetId: '1',
    accountId,
    username,
  })
  jest.mocked(fetchQuoteAuthors).mockResolvedValue({
    quotes: [
      quote('10', 'owner', 'alice'),
      quote('11', 'b', 'bob'),
      quote('11', 'b', 'bob'),
      quote('12', 'c', 'carol'),
      quote('13', 'd', 'dave'),
      quote('14', 'e', 'erin'),
    ],
    truncatedTweetIds: [],
  })
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(['alice', 'bob', 'dave', 'erin']),
    blocked: new Set(['dave']),
    blockedIds: new Set(['e']),
  })
  expect(await getBirdseyeBangerScores(new Map([['1', 'owner']]))).toEqual(
    new Map([['1', 1]]),
  )
  expect(fetchQuoteAuthors).toHaveBeenCalledWith(['1'])
  jest
    .mocked(fetchQuoteAuthors)
    .mockRejectedValue(new Error('ClickHouse analytics request failed (502)'))
  await expect(
    getBirdseyeBangerScores(new Map([['1', 'owner']])),
  ).rejects.toThrow('(502)')
})
