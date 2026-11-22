import { getLatestStreamTweets } from './getLatestStreamTweets'

const portalTweet = {
  id: '200',
  accountId: '10',
  username: 'alice',
  name: 'Alice',
  avatar: 'https://example.org/a.jpg',
  text: 'Hello stream',
  observedAt: '2026-11-19T10:00:01.000Z',
  createdAt: '2026-11-19T10:00:00.000Z',
  likes: 4,
  rts: 2,
  media: [{ url: 'https://example.org/p.jpg', type: 'photo' }],
  quotedTweet: { id: '100' },
}

afterEach(() => jest.restoreAllMocks())

test('reads the ClickHouse live stream route and maps it for the tweet list', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      tweets: [portalTweet],
      nextCursor: { createdAt: portalTweet.createdAt, id: '200' },
      hasMore: true,
    }),
  } as Response)

  const page = await getLatestStreamTweets(null)
  expect(fetchMock).toHaveBeenCalledWith('/api/portal/stream')
  expect(page).toEqual({
    tweets: [
      expect.objectContaining({
        tweet_id: '200',
        account_id: '10',
        username: 'alice',
        account_display_name: 'Alice',
        full_text: 'Hello stream',
        favorite_count: 4,
        retweet_count: 2,
        quote_tweet_id: '100',
        media: [
          { media_url: 'https://example.org/p.jpg', media_type: 'photo' },
        ],
      }),
    ],
    nextCursor: { createdAt: portalTweet.createdAt, id: '200' },
    hasMore: true,
  })

  await getLatestStreamTweets({ createdAt: portalTweet.createdAt, id: '200' })
  expect(fetchMock).toHaveBeenLastCalledWith(
    `/api/portal/stream?before=${encodeURIComponent(portalTweet.createdAt)}&beforeId=200`,
  )
})

test('a failed or malformed stream response is an error, not an empty list', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
  await expect(getLatestStreamTweets(null)).rejects.toThrow('Failed')
  await expect(getLatestStreamTweets(null)).rejects.toThrow('invalid')
})
