import { comparePortalTweetChronology, selectHomepageStream } from './stream'
import type { PortalTweet } from './types'

function tweet(
  id: string,
  createdAt: string,
  overrides: Partial<PortalTweet> = {},
): PortalTweet {
  return {
    id,
    username: `user_${id}`,
    name: `User ${id}`,
    avatar: null,
    text: `tweet ${id}`,
    observedAt: createdAt,
    createdAt,
    likes: 0,
    rts: 0,
    ...overrides,
  }
}

describe('portal stream selection', () => {
  test('orders equal timestamps by numeric tweet ID descending', () => {
    const timestamp = '2026-08-07T12:00:00.000Z'
    expect(
      [tweet('99', timestamp), tweet('100', timestamp)]
        .sort(comparePortalTweetChronology)
        .map(({ id }) => id),
    ).toEqual(['100', '99'])
  })

  test('front-loads four newest posts, then favors attention signals', () => {
    const now = new Date('2026-08-07T12:00:00.000Z')
    const chronological = Array.from({ length: 6 }, (_, index) =>
      tweet(
        String(110 - index),
        new Date(now.getTime() - index * 60_000).toISOString(),
      ),
    )
    const highAttention = tweet('90', '2026-08-07T10:00:00.000Z', {
      likes: 500,
      rts: 40,
      followers: 250_000,
      quoteCount: 8,
    })

    expect(
      selectHomepageStream([...chronological, highAttention], 7, now).map(
        ({ id }) => id,
      ),
    ).toEqual(['110', '109', '108', '107', '90', '106', '105'])
  })

  test('merges recent-banger quote strength into a duplicate live row', () => {
    const now = new Date('2026-08-07T12:00:00.000Z')
    const live = tweet('101', '2026-08-07T11:00:00.000Z', {
      followers: 100_000,
    })
    const banger = tweet('101', '2026-08-07T11:00:00.000Z', {
      quoteCount: 12,
      likes: 250,
    })

    expect(selectHomepageStream([live, banger], 1, now)[0]).toMatchObject({
      id: '101',
      followers: 100_000,
      quoteCount: 12,
      likes: 250,
    })
  })
})
