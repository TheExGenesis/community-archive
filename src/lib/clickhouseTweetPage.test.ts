import {
  fetchClickHouseTweetPageData,
  fetchClickHouseTweetThreadPageData,
} from './clickhouseTweetPage'

describe('fetchClickHouseTweetPageData', () => {
  test('maps a portal tweet detail from ClickHouse into the permalink renderer', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      data: {
        tweet: {
          tweetId: '2085473085399150817',
          accountId: '10',
          createdAt: '2026-08-07 12:00:00.000',
          fullText: 'The linked portal tweet',
          replyToTweetId: null,
          replyToUsername: null,
          favoriteCount: '25',
          retweetCount: '4',
          username: 'alice',
          accountDisplayName: 'Alice',
          avatarMediaUrl: 'https://pbs.twimg.com/alice.jpg',
          quoteTweetId: '202',
          retweetedTweetId: null,
          media: [
            {
              mediaUrl: 'https://pbs.twimg.com/media/example.jpg',
              mediaType: 'photo',
              width: 1200,
              height: 800,
            },
          ],
        },
        quotedTweet: {
          tweetId: '202',
          accountId: '20',
          createdAt: '2026-08-06T10:00:00.000Z',
          fullText: 'Quoted context',
          replyToTweetId: null,
          replyToUsername: null,
          favoriteCount: '7',
          retweetCount: '1',
          username: 'bob',
          accountDisplayName: 'Bob',
          avatarMediaUrl: null,
          media: [],
        },
      },
    })

    const tweet = await fetchClickHouseTweetPageData(
      '2085473085399150817',
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledWith(
      ['tweet', '2085473085399150817'],
      expect.any(URLSearchParams),
      { revalidate: 3600 },
    )
    expect(tweet).toMatchObject({
      tweet_id: '2085473085399150817',
      created_at: '2026-08-07T12:00:00.000Z',
      full_text: 'The linked portal tweet',
      favorite_count: 25,
      retweet_count: 4,
      username: 'alice',
      account_display_name: 'Alice',
      quote_tweet_id: '202',
      quoted_tweet: {
        tweet_id: '202',
        username: 'bob',
        full_text: 'Quoted context',
      },
      media: [
        {
          media_url: 'https://pbs.twimg.com/media/example.jpg',
          media_type: 'photo',
          width: 1200,
          height: 800,
        },
      ],
    })
  })

  test('rejects non-numeric route IDs before calling the gateway', async () => {
    const fetcher = jest.fn()

    await expect(
      fetchClickHouseTweetPageData('not-a-tweet', fetcher),
    ).resolves.toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('maps a ClickHouse conversation into the existing thread tree', async () => {
    const root = {
      tweetId: '1636679643120951297',
      accountId: '10',
      createdAt: '2023-03-17 10:43:29.000',
      fullText: 'Thread root',
      replyToTweetId: null,
      replyToUsername: null,
      favoriteCount: '144',
      retweetCount: '32',
      username: 'exgenesis',
      accountDisplayName: 'xiq',
      avatarMediaUrl: null,
      quoteTweetId: null,
      quotedTweet: null,
      retweetedTweetId: null,
      media: [],
    }
    const reply = {
      ...root,
      tweetId: '1636682659488301059',
      createdAt: '2023-03-17 10:55:28.000',
      fullText: 'this is my best tweet',
      replyToTweetId: root.tweetId,
      replyToUsername: 'exgenesis',
      favoriteCount: '25',
      retweetCount: '2',
    }
    const fetcher = jest.fn().mockResolvedValue({
      data: {
        tweet: root,
        conversationTweets: [root, reply],
      },
    })

    const page = await fetchClickHouseTweetThreadPageData(root.tweetId, fetcher)

    expect(fetcher).toHaveBeenCalledWith(
      ['tweet', root.tweetId, 'thread'],
      expect.any(URLSearchParams),
      { revalidate: 3600 },
    )
    expect(page?.tweet).toMatchObject({
      tweet_id: root.tweetId,
      full_text: 'Thread root',
    })
    expect(page?.threadTree).toMatchObject({
      root: root.tweetId,
      roots: [root.tweetId],
      children: {
        [root.tweetId]: [reply.tweetId],
        [reply.tweetId]: [],
      },
      parents: { [reply.tweetId]: root.tweetId },
    })
    expect(page?.threadTree?.tweets[reply.tweetId]).toMatchObject({
      tweet_id: reply.tweetId,
      reply_to_tweet_id: root.tweetId,
      username: 'exgenesis',
    })
  })
})
