import { getBirdseyeSamples } from './birdseye-samples'
import { fetchTweetCards } from '@/lib/clickhouseCorpusReads'
import { getSourceTweets } from './source-tweets'
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('@/lib/clickhouseCorpusReads', () => ({ fetchTweetCards: jest.fn() }))
jest.mock('./source-tweets', () => ({ getSourceTweets: jest.fn() }))
const cards = (rows: [string, string, number][]) =>
  new Map(
    rows.map(([tweetId, username, likes]) => [
      tweetId,
      { tweetId, username, favoriteCount: String(likes) },
    ]),
  ) as never
beforeEach(() => jest.clearAllMocks())
test('selects owner posts by likes using only cited IDs, then renders the configured source records', async () => {
  jest.mocked(fetchTweetCards).mockResolvedValue(
    cards([
      ['1', 'alice', 3],
      ['2', 'ALICE', 8],
      ['3', 'alice', 5],
      ['4', 'bob', 90],
    ]),
  )
  jest.mocked(getSourceTweets).mockResolvedValue(
    new Map([
      ['1', { id: '1', username: 'alice', likes: 3 }],
      ['2', { id: '2', username: 'ALICE', likes: 8 }],
      ['3', { id: '3', username: 'alice', likes: 5 }],
    ] as never),
  )
  expect(
    (await getBirdseyeSamples(['1', '2', '3', '4', '1', 'bad'], 'alice')).map(
      (tweet) => tweet.id,
    ),
  ).toEqual(['2', '3', '1'])
  expect(fetchTweetCards).toHaveBeenCalledWith(['1', '2', '3', '4', '1', 'bad'])
  expect(getSourceTweets).toHaveBeenCalledWith(['2', '3', '1'])
})
test('uses conversation context only when there are too few owner candidates', async () => {
  jest.mocked(fetchTweetCards).mockResolvedValue(
    cards([
      ['1', 'alice', 2],
      ['2', 'bob', 50],
    ]),
  )
  jest.mocked(getSourceTweets).mockResolvedValue(
    new Map([
      ['1', { id: '1', username: 'alice', likes: 2 }],
      ['2', { id: '2', username: 'bob', likes: 50 }],
    ] as never),
  )
  expect(
    (await getBirdseyeSamples(['1', '2'], 'alice')).map((tweet) => tweet.id),
  ).toEqual(['1', '2'])
  expect(getSourceTweets).toHaveBeenCalledWith(['1', '2'])
})
test('does not silently select arbitrary posts when ranking is unavailable', async () => {
  jest
    .mocked(fetchTweetCards)
    .mockRejectedValue(new Error('ClickHouse analytics request failed (502)'))
  await expect(getBirdseyeSamples(['1'], 'alice')).rejects.toThrow('(502)')
  expect(getSourceTweets).not.toHaveBeenCalled()
})
test('matches underscores in usernames literally', async () => {
  jest.mocked(fetchTweetCards).mockResolvedValue(
    cards([
      ['1', 'alice_bob', 1],
      ['2', 'aliceXbob', 9],
    ]),
  )
  jest.mocked(getSourceTweets).mockResolvedValue(new Map())
  await getBirdseyeSamples(['1', '2'], 'alice_bob')
  expect(getSourceTweets).toHaveBeenCalledWith(['1', '2'])
})
