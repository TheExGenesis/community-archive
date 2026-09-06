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

  test('does not report the reply count as a repost count', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          __typename: 'Tweet',
          id_str: '1593478387703873536',
          text: 'hello',
          created_at: 'Thu Nov 17 20:12:00 +0000 2022',
          favorite_count: 296,
          // The syndication payload has no repost count; this is replies.
          conversation_count: 57,
          user: {
            id_str: '826134955549790208',
            screen_name: 'christineist',
            name: 'christine',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as jest.MockedFunction<typeof fetch>

    await expect(
      fetchSyndicatedTweet('1593478387703873536'),
    ).resolves.toMatchObject({
      tweet_id: '1593478387703873536',
      favorite_count: 296,
      retweet_count: null,
    })
  })
})
