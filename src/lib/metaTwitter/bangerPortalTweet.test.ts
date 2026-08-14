import { bangerPortalTweet } from './bangerPortalTweet'
import type { BangerTweet } from './types'

const banger: BangerTweet = {
  tweet_id: '123',
  account_id: '42',
  created_at: '2025-01-02T03:04:05.000Z',
  full_text: 'A banger with an image',
  favorite_count: 92,
  retweet_count: 22,
  reply_to_username: null,
  username: 'alice',
  account_display_name: 'Alice',
  avatar_media_url: 'https://example.com/avatar.jpg',
  media: [
    {
      media_url: 'https://example.com/image.jpg',
      media_type: 'photo',
      width: 1200,
      height: 800,
    },
  ],
  quote_count: 11,
  quoting_accounts: 10,
  quote_tweet_id: '456',
  quoted_tweet: {
    tweet_id: '456',
    account_id: '77',
    created_at: '2024-12-31T23:59:00.000Z',
    full_text: 'The quoted source',
    favorite_count: 70,
    retweet_count: 6,
    reply_to_username: null,
    username: 'quoted_member',
    account_display_name: 'Quoted Member',
    avatar_media_url: 'https://example.com/quoted-avatar.jpg',
    media: [
      {
        media_url: 'https://example.com/quoted-image.jpg',
        media_type: 'photo',
        width: 900,
        height: 600,
      },
    ],
  },
}

test('preserves banger evidence and attached media for the canonical card', () => {
  expect(bangerPortalTweet(banger, 'https://example.com/fallback.jpg')).toEqual(
    {
      id: '123',
      accountId: '42',
      username: 'alice',
      name: 'Alice',
      avatar: 'https://example.com/avatar.jpg',
      text: 'A banger with an image',
      observedAt: '2025-01-02T03:04:05.000Z',
      createdAt: '2025-01-02T03:04:05.000Z',
      likes: 92,
      rts: 22,
      quoteCount: 11,
      media: [
        {
          url: 'https://example.com/image.jpg',
          type: 'photo',
          width: 1200,
          height: 800,
        },
      ],
      quotedTweet: {
        id: '456',
        accountId: '77',
        username: 'quoted_member',
        name: 'Quoted Member',
        avatar: 'https://example.com/quoted-avatar.jpg',
        text: 'The quoted source',
        createdAt: '2024-12-31T23:59:00.000Z',
        likes: 70,
        rts: 6,
        media: [
          {
            url: 'https://example.com/quoted-image.jpg',
            type: 'photo',
            width: 900,
            height: 600,
          },
        ],
      },
    },
  )
})

test('preserves a deleted quote target as a canonical card placeholder', () => {
  expect(
    bangerPortalTweet({
      ...banger,
      quoted_tweet: null,
    }).quotedTweet,
  ).toMatchObject({ id: '456', isDeleted: true })
})

test('uses the resolved profile avatar when a banger row has none', () => {
  expect(
    bangerPortalTweet(
      { ...banger, avatar_media_url: null },
      'https://example.com/fallback.jpg',
    ).avatar,
  ).toBe('https://example.com/fallback.jpg')
})
