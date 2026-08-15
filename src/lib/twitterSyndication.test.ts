import { fetchSyndicatedTweet } from './twitterSyndication'

describe('Twitter syndication', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  test('normalizes X Article metadata attached to a syndicated tweet', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          __typename: 'Tweet',
          id_str: '2054372105223913761',
          text: 'https://t.co/OIbtLZ7231',
          created_at: 'Wed May 13 01:24:12 +0000 2026',
          favorite_count: 152,
          conversation_count: 18,
          user: {
            id_str: '826134955549790208',
            screen_name: 'christineist',
            name: 'christine',
          },
          article: {
            rest_id: '2051411546757324800',
            title: 'Social traits for wholesome online interactions',
            preview_text: 'A particularly wholesome part of the internet.',
            cover_media: {
              media_info: {
                original_img_url:
                  'https://pbs.twimg.com/media/HHgY_ltaIAAsDDV.jpg',
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as jest.MockedFunction<typeof fetch>

    await expect(
      fetchSyndicatedTweet('2054372105223913761'),
    ).resolves.toMatchObject({
      tweet_id: '2054372105223913761',
      article: {
        article_id: '2051411546757324800',
        title: 'Social traits for wholesome online interactions',
        preview_text: 'A particularly wholesome part of the internet.',
        cover_media_url: 'https://pbs.twimg.com/media/HHgY_ltaIAAsDDV.jpg',
      },
    })
  })

  test('uses nested parent metadata and never substitutes conversation count for retweets', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          __typename: 'Tweet',
          id_str: '2054372105223913761',
          text: 'reply',
          created_at: 'Wed May 13 01:24:12 +0000 2026',
          favorite_count: 2,
          conversation_count: 18,
          user: {
            id_str: '826134955549790208',
            screen_name: 'christineist',
            name: 'christine',
          },
          parent: {
            id_str: '2054372105223913700',
            user: { id_str: '1', screen_name: 'parent' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as jest.MockedFunction<typeof fetch>

    await expect(
      fetchSyndicatedTweet('2054372105223913761'),
    ).resolves.toMatchObject({
      reply_to_tweet_id: '2054372105223913700',
      retweet_count: null,
    })
  })

  test('rejects a response redirected to a different tweet id', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          __typename: 'Tweet',
          id_str: '2054372105223913700',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as jest.MockedFunction<typeof fetch>

    await expect(
      fetchSyndicatedTweet('2054372105223913761'),
    ).resolves.toBeNull()
  })
})
