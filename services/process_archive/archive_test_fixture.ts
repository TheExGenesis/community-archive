// Synthetic Twitter archive records in the shape of a real export, including
// the many fields the worker never reads. Used by the streaming-input tests
// and the large-archive memory check (archive_memory_check.ts).

const dateFor = (i: number) =>
  new Date(Date.UTC(2012, 0, 1) + i * 3_600_000)
    .toUTCString()
    .replace('GMT', '+0000')

function mediaFor(i: number, n: number) {
  return Array.from({ length: n }, (_, k) => {
    const id = String(9_000_000_000_000 + i * 10 + k)
    return {
      expanded_url: `https://twitter.com/fixture_owner/status/${1_000_000 + i}/photo/${k + 1}`,
      indices: ['120', '143'],
      url: 'https://t.co/AbCdEfGhIj',
      media_url: `http://pbs.twimg.com/media/${id}.jpg`,
      id_str: id,
      id,
      media_url_https: `https://pbs.twimg.com/media/${id}.jpg`,
      sizes: {
        thumb: { w: '150', h: '150', resize: 'crop' },
        medium: { w: '1200', h: '800', resize: 'fit' },
        small: { w: '680', h: '453', resize: 'fit' },
        large: { w: '2048', h: '1365', resize: 'fit' },
      },
      type: k % 3 === 2 ? 'video' : 'photo',
      display_url: 'pic.twitter.com/AbCdEfGhIj',
      ...(k % 3 === 2
        ? {
            video_info: {
              aspect_ratio: ['16', '9'],
              duration_millis: '12000',
              variants: [
                {
                  bitrate: '2176000',
                  content_type: 'video/mp4',
                  url: `https://video.twimg.com/${id}/1280x720.mp4`,
                },
                {
                  content_type: 'application/x-mpegURL',
                  url: `https://video.twimg.com/${id}/pl.m3u8`,
                },
              ],
            },
          }
        : {}),
    }
  })
}

export function realisticTweet(i: number) {
  const id = String(1_000_000 + i)
  const kind = i % 10
  const mentions =
    kind === 3 || kind === 4
      ? [
          {
            name: `Mention ${i % 97} ✨`,
            screen_name: `mention_${i % 97}`,
            indices: ['0', '12'],
            id_str: String(5_000 + (i % 97)),
            id: String(5_000 + (i % 97)),
          },
        ]
      : []
  const urls =
    kind === 5
      ? [
          {
            url: 'https://t.co/q1w2e3r4t5',
            expanded_url: `https://x.com/quoted_${i % 31}/status/${2_000_000 + i}`,
            display_url: `x.com/quoted_${i % 31}/s…`,
            indices: ['200', '223'],
          },
        ]
      : kind === 6
        ? [
            {
              url: 'https://t.co/z9x8c7v6b5',
              expanded_url: `https://example.com/articles/${i}?utm_source=twitter`,
              display_url: `example.com/articles/${i}…`,
              indices: ['100', '123'],
            },
          ]
        : []
  const mediaCount = kind === 7 ? 4 : kind === 8 ? 1 : 0
  const media = mediaFor(i, mediaCount)
  const isRetweet = kind === 9
  const text = isRetweet
    ? `RT @retweeted_${i % 13}: A retweeted thought number ${i} about systems, gardens and the long now 🌱`
    : `${mentions.length ? `@${mentions[0].screen_name} ` : ''}Thinking out loud about energy storage, fusion timelines and why the grid is a conversation (${i}) — “quoted” \\ slashes {braces} [brackets] ⚡️`
  return {
    tweet: {
      edit_info: {
        initial: {
          editTweetIds: [id],
          editableUntil: '2023-01-01T00:00:00.000Z',
          editsRemaining: '5',
          isEditEligible: false,
        },
      },
      retweeted: false,
      source:
        '<a href="http://twitter.com/download/iphone" rel="nofollow">Twitter for iPhone</a>',
      entities: {
        hashtags: kind === 2 ? [{ text: 'energy', indices: ['50', '57'] }] : [],
        symbols: [],
        user_mentions: mentions,
        urls,
        ...(media.length ? { media: media.slice(0, 1) } : {}),
      },
      display_text_range: ['0', String(text.length)],
      favorite_count: String(i % 500),
      ...(kind === 4
        ? {
            in_reply_to_status_id_str: String(3_000_000 + i),
            in_reply_to_status_id: String(3_000_000 + i),
            in_reply_to_user_id: mentions[0].id_str,
            in_reply_to_user_id_str: mentions[0].id_str,
            in_reply_to_screen_name: mentions[0].screen_name,
          }
        : {}),
      id_str: id,
      truncated: false,
      retweet_count: String(i % 50),
      id,
      ...(media.length
        ? { possibly_sensitive: false, extended_entities: { media } }
        : {}),
      created_at: dateFor(i),
      favorited: false,
      full_text: text,
      lang: 'en',
    },
  }
}

export function realisticLike(i: number) {
  return {
    like: {
      tweetId: String(7_000_000_000 + i),
      fullText: `Someone else's liked tweet ${i}, with a link https://t.co/abc and some emoji 🎉🎉 and a fairly ordinary length of text for a like.`,
      expandedUrl: `https://twitter.com/i/web/status/${7_000_000_000 + i}`,
    },
  }
}

export function realisticArchiveHead(accountId = '13232322') {
  return {
    'upload-options': {
      keepPrivate: false,
      uploadLikes: true,
      startDate: '2006-01-01T00:00:00.000Z',
      endDate: '2026-01-01T00:00:00.000Z',
    },
    profile: [
      {
        profile: {
          description: {
            bio: 'Fixture bio — energy, “quotes”',
            website: 'https://t.co/site',
            location: 'Earth',
          },
          avatarMediaUrl: 'https://pbs.twimg.com/profile_images/1/avatar.jpg',
          headerMediaUrl: 'https://pbs.twimg.com/profile_banners/1/header',
        },
      },
    ],
    account: [
      {
        account: {
          email: 'fixture@example.com',
          createdVia: 'web',
          username: 'fixture_owner',
          accountId,
          createdAt: '2008-03-01T00:00:00.000Z',
          accountDisplayName: 'Fixture Owner',
        },
      },
    ],
  }
}

/** A complete small archive with every record kind the worker handles. */
export function realisticArchive(
  tweets = 40,
  likes = 25,
  accountId = '13232322',
) {
  return {
    ...realisticArchiveHead(accountId),
    tweets: Array.from({ length: tweets }, (_, i) => realisticTweet(i)),
    follower: Array.from({ length: 7 }, (_, i) => ({
      follower: {
        accountId: String(8_000 + i),
        userLink: `https://twitter.com/intent/user?user_id=${8_000 + i}`,
      },
    })),
    following: Array.from({ length: 5 }, (_, i) => ({
      following: {
        accountId: String(8_100 + i),
        userLink: `https://twitter.com/intent/user?user_id=${8_100 + i}`,
      },
    })),
    'note-tweet': [
      {
        noteTweet: {
          noteTweetId: '1',
          updatedAt: '2024-01-01T00:00:00.000Z',
          lifecycle: {
            value: '0',
            name: 'Initial',
            originalName: 'Initial',
            annotations: {},
          },
          createdAt: new Date(
            Date.UTC(2012, 0, 1) + 3 * 3_600_000,
          ).toISOString(),
          core: {
            styletags: [],
            urls: [],
            text: `@mention_3 Thinking out loud about energy storage, fusion timelines and why the grid is a conversation (3) — “quoted” \\ slashes {braces} [brackets] ⚡️ and then a much longer note tweet continuation.`,
            mentions: [],
            cashtags: [],
            hashtags: [],
          },
        },
      },
    ],
    like: Array.from({ length: likes }, (_, i) => realisticLike(i)),
    'community-tweet': [
      { tweet: { id_str: '42', full_text: 'community tweet kept as written' } },
    ],
  }
}
