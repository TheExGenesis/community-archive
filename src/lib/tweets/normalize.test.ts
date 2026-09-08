import { normalizeTweet } from './normalize'
import type { TweetInput } from './types'

const input: TweetInput = {
  tweet_id: '123',
  created_at: '2026-09-06T12:00:00Z',
  full_text: 'Complete archive text &amp; links https://t.co/example\n'.repeat(
    80,
  ),
  favorite_count: 0,
  retweet_count: 0,
}

test('normalizes nested search accounts and supplies absent optional fields', () => {
  expect(
    normalizeTweet({
      ...input,
      account: {
        username: 'alice',
        account_display_name: 'Alice',
        profile: { avatar_media_url: 'https://example.com/alice.jpg' },
      },
    }),
  ).toMatchObject({
    username: 'alice',
    account_display_name: 'Alice',
    avatar_media_url: 'https://example.com/alice.jpg',
    favorite_count: 0,
    retweet_count: 0,
    media: [],
    urls: [],
    quote_tweet_id: null,
    retweeted_tweet_id: null,
  })
})

test('prefers flat identity while preserving complete text, media, quotes and retweet attribution', () => {
  const source: TweetInput = {
    ...input,
    account_id: 'author',
    username: 'current',
    account_display_name: 'Current Name',
    avatar_media_url: 'https://example.com/current.jpg',
    account: { username: 'old', account_display_name: 'Old Name' },
    media: [
      {
        media_type: 'photo',
        media_url: 'https://example.com/photo.jpg',
        width: 4000,
        height: 3000,
      },
    ],
    urls: [
      {
        expanded_url: 'https://example.com/article',
        display_url: 'example.com/article',
      },
    ],
    quote_tweet_id: '456',
    quoted_tweet: {
      tweet_id: '456',
      account_id: 'quoted-author',
      created_at: input.created_at,
      full_text: 'Quoted text '.repeat(200),
      retweet_count: null,
      favorite_count: 0,
      username: 'quoted',
      account_display_name: 'Quoted',
      from_external: true,
      media: [
        { media_type: 'video', media_url: 'https://example.com/video.jpg' },
      ],
    },
    retweeted_tweet_id: '789',
    mentioned_users: [
      {
        mentioned_user: {
          user_id: 'original',
          name: 'Original',
          screen_name: 'original',
        },
      },
    ],
  }
  const before = JSON.stringify(source)
  const result = normalizeTweet(source)
  expect(result.username).toBe('current')
  expect(result.account_display_name).toBe('Current Name')
  expect(result.avatar_media_url).toBe('https://example.com/current.jpg')
  expect(result.full_text).toBe(source.full_text)
  expect(result.media).toEqual(source.media)
  expect(result.urls).toEqual(source.urls)
  expect(result.quoted_tweet).toEqual(source.quoted_tweet)
  expect(result.mentioned_users).toEqual(source.mentioned_users)
  expect(result.retweeted_tweet_id).toBe('789')
  expect(result).not.toHaveProperty('account')
  expect(JSON.stringify(source)).toBe(before)
})

test('preserves unavailable-quote tombstones and accepts nullable thread fields', () => {
  const quote = {
    tweet_id: 'missing',
    account_id: '',
    created_at: input.created_at,
    full_text: '',
    retweet_count: null,
    favorite_count: 0,
    username: '',
    account_display_name: '',
    is_deleted: true,
  }
  expect(
    normalizeTweet({ ...input, quoted_tweet: quote }).quoted_tweet,
  ).toEqual(quote)
  expect(
    normalizeTweet({ ...input, quoted_tweet: null, reply_to_username: null }),
  ).toMatchObject({
    quoted_tweet: undefined,
    reply_to_username: undefined,
  })
})
