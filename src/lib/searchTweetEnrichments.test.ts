import { enrichSearchTweets } from './searchTweetEnrichments'
import type { TimelineTweet } from './types'

const tweet = (id: string): TimelineTweet => ({
  tweet_id: id,
  account_id: 'account-1',
  created_at: '2026-08-07T12:00:00Z',
  full_text: 'My comment',
  favorite_count: 1,
  retweet_count: 0,
  reply_to_tweet_id: null,
  account: { username: 'source_user', account_display_name: 'Source User' },
  media: [],
})

const quoted = {
  tweet_id: '9',
  account_id: 'account-2',
  created_at: '2026-08-06T12:00:00Z',
  full_text: 'Quoted body',
  retweet_count: 2,
  favorite_count: 5,
  avatar_media_url: 'https://example.com/avatar.jpg',
  username: 'quoted_user',
  account_display_name: 'Quoted User',
  media: [
    {
      media_url: 'https://example.com/quoted-photo.jpg',
      media_type: 'photo',
    },
  ],
}

describe('enrichSearchTweets', () => {
  it('attaches quoted tweets from one batched request', async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              quotes: { '1': { quote_tweet_id: '9', quoted_tweet: quoted } },
            },
          }),
        ),
    ) as unknown as typeof fetch

    const result = await enrichSearchTweets(
      [tweet('1'), tweet('2')],
      undefined,
      fetchImpl,
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(jest.mocked(fetchImpl).mock.calls[0][0]).toBe(
      '/api/tweet-search/quotes?ids=1%2C2',
    )
    expect(result[0]).toMatchObject({
      quote_tweet_id: '9',
      quoted_tweet: quoted,
    })
    expect(result[1]).toEqual(tweet('2'))
  })

  it('keeps the results without quote cards when the request fails', async () => {
    const fetchImpl = jest.fn(
      async () => new Response('busy', { status: 503 }),
    ) as unknown as typeof fetch
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await enrichSearchTweets([tweet('1')], undefined, fetchImpl)

    expect(result).toEqual([tweet('1')])
    warn.mockRestore()
  })

  it('rethrows cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      enrichSearchTweets([tweet('1')], controller.signal, jest.fn()),
    ).rejects.toBeDefined()
  })
})
