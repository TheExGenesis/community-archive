import {
  filterBlockedSyndicatedTweets,
  recoverMissingArchiveConversations,
} from '../../services/process_archive/process_archive_upload'
import {
  normalizeSyndicatedTweet,
  recoverSyndicatedConversation,
  type SyndicatedTweetForIngestion,
} from '../../services/process_archive/twitter_syndication'

function syndicatedTweet(
  tweetId: string,
  parentId: string | null,
  accountId = `9${tweetId}`,
): SyndicatedTweetForIngestion {
  return {
    tweet_id: tweetId,
    account_id: accountId,
    username: `user_${tweetId}`,
    account_display_name: `User ${tweetId}`,
    account_created_at: null,
    created_at: 'Wed May 13 01:24:12 +0000 2026',
    full_text: `tweet ${tweetId}`,
    favorite_count: 1,
    retweet_count: null,
    reply_to_tweet_id: parentId,
    reply_to_user_id: null,
    reply_to_username: null,
    avatar_media_url: null,
    header_media_url: null,
    bio: null,
    location: null,
    website: null,
    media: [],
    urls: [],
    mentions: [],
  }
}

describe('archive syndication conversation recovery', () => {
  test('normalizes the nested parent fallback and rejects silent redirects', () => {
    const response = {
      __typename: 'Tweet',
      id_str: '100',
      text: 'reply',
      created_at: 'Wed May 13 01:24:12 +0000 2026',
      favorite_count: 2,
      conversation_count: 99,
      user: { id_str: '900', screen_name: 'reply', name: 'Reply' },
      parent: { id_str: '90', user: { id_str: '890', screen_name: 'root' } },
      mediaDetails: [
        {
          type: 'photo',
          media_url_https: 'https://pbs.twimg.com/media/HDOd30hWAAAOIZ-.jpg',
        },
      ],
    }

    expect(normalizeSyndicatedTweet('100', response)).toMatchObject({
      tweet_id: '100',
      reply_to_tweet_id: '90',
      retweet_count: null,
      media: [{ media_id: '2032141439191089152' }],
    })
    expect(normalizeSyndicatedTweet('101', response)).toBeNull()
  })

  test('walks to the original post and fails closed on a cycle', async () => {
    const tweets = new Map([
      ['100', syndicatedTweet('100', '90')],
      ['90', syndicatedTweet('90', '80')],
      ['80', syndicatedTweet('80', null)],
    ])
    const fetchTweet = jest.fn(async (id: string) => tweets.get(id) ?? null)

    await expect(
      recoverSyndicatedConversation('100', fetchTweet),
    ).resolves.toMatchObject({ rootTweetId: '80' })

    tweets.set('80', syndicatedTweet('80', '100'))
    await expect(
      recoverSyndicatedConversation('100', fetchTweet),
    ).resolves.toBeNull()
  })

  test('uses local archive links before fetching the missing parent', async () => {
    const archive = [
      {
        tweet: {
          id_str: '100',
          in_reply_to_status_id_str: '90',
        },
      },
      {
        tweet: {
          id_str: '90',
          in_reply_to_status_id_str: '80',
        },
      },
    ]
    const fetchTweet = jest.fn(async (id: string) =>
      id === '80' ? syndicatedTweet('80', null, '980') : null,
    )

    const recovery = await recoverMissingArchiveConversations(
      archive,
      fetchTweet,
    )

    expect(fetchTweet).toHaveBeenCalledTimes(1)
    expect(fetchTweet).toHaveBeenCalledWith('80')
    expect(recovery.resolutions.get('100')).toEqual({
      conversation_id: '80',
      producer_source: 'archive_upload_syndication',
    })
    expect(recovery.syndicatedTweets.has('80')).toBe(true)
  })

  test('filters each recovered tweet by its own author', () => {
    const allowed = syndicatedTweet('100', '90', '900')
    const blocked = syndicatedTweet('90', null, '890')

    expect(
      filterBlockedSyndicatedTweets(
        [allowed, blocked],
        new Set(['890']),
      ).map((tweet) => tweet.tweet_id),
    ).toEqual(['100'])
  })
})
