import type { AnalyticsGatewayFetcher } from '@/lib/clickhouseGateway'
import { fetchProfileTimelinePage } from './profileTimeline'

const card = (tweetId: string, accountId = '42'): Record<string, unknown> => ({
  tweetId,
  accountId,
  createdAt: '2026-11-19 20:00:26.000',
  fullText: `Post ${tweetId}`,
  favoriteCount: '5',
  retweetCount: '1',
  username: 'alice',
  accountDisplayName: 'Alice',
  avatarMediaUrl: null,
  media: [
    {
      mediaUrl: `https://pbs.twimg.com/media/${tweetId}.jpg`,
      mediaType: 'photo',
      width: 1200,
      height: null,
    },
  ],
  quoteTweetId: tweetId === '2' ? '9' : tweetId === '3' ? '8' : null,
  quotedTweet:
    tweetId === '2'
      ? { ...card('9', '77'), username: 'bob', quotedTweet: null }
      : null,
})

// Later own-tweets reads (the loop past short pages) find nothing more.
const fetcherFor = (
  ownTweets: { query: { offset: number } & Record<string, unknown> } & Record<
    string,
    unknown
  >,
  cards: unknown[],
): jest.MockedFunction<AnalyticsGatewayFetcher> =>
  jest.fn(async (path: string[], params?: URLSearchParams) => {
    if (path[0] !== 'user') return { data: { tweets: cards } }
    const offset = Number(params?.get('offset'))
    return offset === ownTweets.query.offset
      ? ownTweets
      : {
          data: { tweets: [], hasMore: false },
          query: { ...ownTweets.query, offset },
        }
  }) as unknown as jest.MockedFunction<AnalyticsGatewayFetcher>

const ownTweets = (
  ids: string[],
  hasMore: boolean,
  offset = 0,
  kind = 'original',
) => ({
  data: {
    tweets: ids.map((tweetId) => ({ tweetId, fullText: `Post ${tweetId}` })),
    hasMore,
  },
  query: { accountId: '42', kind, sort: 'newest', limit: 50, offset },
})

test('hydrates the newest-first page in its own order with media and quotes', async () => {
  const fetcher = fetcherFor(ownTweets(['3', '2', '1'], true), [
    card('1'),
    card('2'),
    card('3'),
  ])
  const page = await fetchProfileTimelinePage('42', { offset: 0 }, fetcher)

  expect(fetcher.mock.calls[0][0]).toEqual(['user', '42', 'own-tweets'])
  expect(
    Object.fromEntries(fetcher.mock.calls[0][1] as URLSearchParams),
  ).toEqual({
    sort: 'newest',
    kind: 'original',
    limit: '50',
    offset: '0',
  })
  // Three posts is a short page, so it reads on once and finds the end.
  expect((fetcher.mock.calls[1][1] as URLSearchParams).get('offset')).toBe('50')
  expect(fetcher.mock.calls[2][0]).toEqual(['tweet-cards'])
  expect((fetcher.mock.calls[2][1] as URLSearchParams).get('ids')).toBe('3,2,1')
  expect(page.tweets.map((tweet) => tweet.id)).toEqual(['3', '2', '1'])
  expect(page.nextOffset).toBeNull()
  expect(page.truncated).toBe(false)
  expect(page.tweets[0].createdAt).toBe('2026-11-19T20:00:26.000Z')
  expect(page.tweets[0].media).toEqual([
    { url: 'https://pbs.twimg.com/media/3.jpg', type: 'photo', width: 1200 },
  ])
  expect(page.tweets[0].quotedTweet).toMatchObject({ id: '8', isDeleted: true })
  expect(page.tweets[1].quotedTweet).toMatchObject({ id: '9', username: 'bob' })
  expect(page.tweets[2].quotedTweet).toBeUndefined()
})

test('leaves out cards the gateway no longer serves or that belong to someone else', async () => {
  const page = await fetchProfileTimelinePage(
    '42',
    { offset: 40, kind: 'all' },
    fetcherFor(ownTweets(['3', '2', '1'], false, 40, 'all'), [
      card('1'),
      card('3', '99'),
    ]),
  )
  expect(page.tweets.map((tweet) => tweet.id)).toEqual(['1'])
  expect(page.nextOffset).toBeNull()
})

test('skips hydration for an empty page', async () => {
  const fetcher = fetcherFor(ownTweets([], false), [])
  await expect(fetchProfileTimelinePage('42', {}, fetcher)).resolves.toEqual({
    tweets: [],
    nextOffset: null,
    truncated: false,
  })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('reports truncation at the gateway paging limit', async () => {
  const page = await fetchProfileTimelinePage(
    '42',
    { offset: 9_990 },
    fetcherFor(ownTweets(['1'], true, 9_990), [card('1')]),
  )
  expect(page.nextOffset).toBeNull()
  expect(page.truncated).toBe(true)
})

test('rejects a page for a different scope and invalid input', async () => {
  await expect(
    fetchProfileTimelinePage(
      '42',
      {},
      fetcherFor(
        {
          ...ownTweets(['1'], false),
          query: {
            accountId: '7',
            kind: 'original',
            sort: 'newest',
            offset: 0,
          },
        },
        [],
      ),
    ),
  ).rejects.toThrow('invalid profile timeline page')
  await expect(
    fetchProfileTimelinePage('alice', {}, fetcherFor(ownTweets([], false), [])),
  ).rejects.toThrow('Invalid profile timeline account')
  await expect(
    fetchProfileTimelinePage(
      '42',
      { offset: -1 },
      fetcherFor(ownTweets([], false), []),
    ),
  ).rejects.toThrow('Invalid profile timeline offset')
})

test('drops retweets before hydrating', async () => {
  const fetcher = fetcherFor(
    {
      ...ownTweets(['3', '2', '1'], true),
      data: {
        tweets: [
          { tweetId: '3', fullText: 'RT @bob: someone else said this' },
          { tweetId: '2', fullText: 'RT is short for retweet' },
          { tweetId: '1', fullText: 'Post 1' },
        ],
        hasMore: true,
      },
    },
    [card('1'), card('2')],
  )
  const page = await fetchProfileTimelinePage('42', {}, fetcher)
  expect(fetcher.mock.calls.at(-1)?.[0]).toEqual(['tweet-cards'])
  expect((fetcher.mock.calls.at(-1)?.[1] as URLSearchParams).get('ids')).toBe(
    '2,1',
  )
  expect(page.tweets.map((tweet) => tweet.id)).toEqual(['2', '1'])
})

test('reads past a retweet-only stretch, at most two pages per request', async () => {
  const retweets = (offset: number) => ({
    data: {
      tweets: [{ tweetId: String(offset + 1), fullText: 'RT @bob: hi' }],
      hasMore: true,
    },
    query: {
      accountId: '42',
      kind: 'original',
      sort: 'newest',
      limit: 50,
      offset,
    },
  })
  const fetcher = jest.fn(async (path: string[], params?: URLSearchParams) =>
    path[0] === 'user'
      ? retweets(Number(params?.get('offset')))
      : { data: { tweets: [] } },
  ) as unknown as jest.MockedFunction<AnalyticsGatewayFetcher>
  const page = await fetchProfileTimelinePage('42', {}, fetcher)
  expect(
    fetcher.mock.calls.map(([, params]) =>
      (params as URLSearchParams).get('offset'),
    ),
  ).toEqual(['0', '50'])
  expect(page).toEqual({ tweets: [], nextOffset: 100, truncated: false })
})
