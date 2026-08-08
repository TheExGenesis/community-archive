import {
  normalizeRemainingRows,
  normalizeTweetRows,
  normalizeUserRows,
} from '../../services/process_archive/archive_normalizer'

const archiveUploadId = 42
const account = {
  accountId: '100',
  username: 'archivist',
  createdAt: '2020-01-01T00:00:00.000Z',
  accountDisplayName: 'The Archivist',
}

const archive = {
  account: [{ account }],
  profile: [
    {
      profile: {
        avatarMediaUrl: 'https://img.example/avatar\u0000.jpg',
        headerMediaUrl: 'NULL',
        description: {
          bio: 'Preserving things',
          location: '',
          website: 'https://example.com',
        },
      },
    },
  ],
  tweets: [
    {
      tweet: {
        id_str: '200',
        created_at: '2024-01-02T03:04:05.000Z',
        full_text: 'RT @someone: hello\u0000',
        favorite_count: 7,
        retweet_count: 3,
        in_reply_to_status_id_str: '199',
        in_reply_to_user_id_str: '101',
        in_reply_to_screen_name: 'friend',
        entities: {
          user_mentions: [
            { id_str: '101', name: 'Friend\u0000', screen_name: 'friend' },
            { id_str: '101', name: 'Friend', screen_name: 'friend' },
          ],
          urls: [
            {
              url: 'https://t.co/quote',
              expanded_url: 'https://x.com/someone/status/555',
              display_url: null,
            },
            {
              url: 'https://t.co/quote',
              expanded_url: 'https://x.com/someone/status/555',
              display_url: null,
            },
          ],
          media: [
            {
              id_str: '300',
              media_url: 'http://img.example/media.jpg',
              media_url_https: 'https://img.example/media.jpg',
              type: 'photo',
              sizes: { large: { w: 1200, h: 800 } },
            },
            {
              id_str: '300',
              media_url: 'http://img.example/duplicate.jpg',
              type: 'photo',
            },
          ],
        },
      },
    },
  ],
  like: [{ like: { tweetId: '400', fullText: 'liked tweet' } }],
  following: [{ following: { accountId: '500' } }],
  follower: [{ follower: { accountId: '600' } }],
}

describe('archive normalizer', () => {
  test('normalizes account and profile rows without sink-specific values', () => {
    expect(normalizeUserRows(archive, archiveUploadId)).toEqual({
      accounts: [
        {
          account_id: '100',
          created_via: 'twitter_archive',
          username: 'archivist',
          created_at: '2020-01-01T00:00:00.000Z',
          account_display_name: 'The Archivist',
          num_tweets: 1,
          num_following: 1,
          num_followers: 1,
          num_likes: 1,
        },
      ],
      profiles: [
        {
          account_id: '100',
          avatar_media_url: 'https://img.example/avatar.jpg',
          header_media_url: null,
          bio: 'Preserving things',
          location: null,
          website: 'https://example.com',
          archive_upload_id: 42,
        },
      ],
    })
  })

  test('normalizes one tweet chunk with the legacy dedupe semantics', () => {
    expect(
      normalizeTweetRows(archive.tweets, account, archiveUploadId),
    ).toEqual({
      tweets: [
        {
          tweet_id: '200',
          account_id: '100',
          created_at: '2024-01-02T03:04:05.000Z',
          full_text: 'RT @someone: hello',
          favorite_count: 7,
          retweet_count: 3,
          reply_to_tweet_id: '199',
          reply_to_user_id: '101',
          reply_to_username: 'friend',
          archive_upload_id: 42,
        },
      ],
      mentionedUsers: [
        { user_id: '101', name: 'Friend', screen_name: 'friend' },
      ],
      userMentions: [
        { tweet_id: '200', mentioned_user_id: '101' },
        { tweet_id: '200', mentioned_user_id: '101' },
      ],
      tweetUrls: [
        {
          tweet_id: '200',
          url: 'https://t.co/quote',
          expanded_url: 'https://x.com/someone/status/555',
          display_url: '',
        },
      ],
      tweetMedia: [
        {
          tweet_id: '200',
          media_id: '300',
          media_url: 'https://img.example/media.jpg',
          media_type: 'photo',
          width: 1200,
          height: 800,
          archive_upload_id: 42,
        },
      ],
      quoteTweets: [
        { tweet_id: '200', quoted_tweet_id: '555' },
        { tweet_id: '200', quoted_tweet_id: '555' },
      ],
      retweets: [{ tweet_id: '200', retweeted_tweet_id: null }],
    })
  })

  test('normalizes likes and relationship rows', () => {
    expect(normalizeRemainingRows(archive, archiveUploadId)).toEqual({
      likedTweets: [{ tweet_id: '400', full_text: 'liked tweet' }],
      likes: [
        {
          account_id: '100',
          liked_tweet_id: '400',
          archive_upload_id: 42,
        },
      ],
      following: [
        {
          account_id: '100',
          following_account_id: '500',
          archive_upload_id: 42,
        },
      ],
      followers: [
        {
          account_id: '100',
          follower_account_id: '600',
          archive_upload_id: 42,
        },
      ],
    })
  })

  test('emits no rows when the archive has no account', () => {
    expect(
      normalizeTweetRows(archive.tweets, undefined, archiveUploadId),
    ).toEqual({
      tweets: [],
      mentionedUsers: [],
      userMentions: [],
      tweetUrls: [],
      tweetMedia: [],
      quoteTweets: [],
      retweets: [],
    })
    expect(normalizeRemainingRows({}, archiveUploadId)).toEqual({
      likedTweets: [],
      likes: [],
      following: [],
      followers: [],
    })
  })
})
