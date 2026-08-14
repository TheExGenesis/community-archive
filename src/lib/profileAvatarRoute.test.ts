const getProfileBangersPageMock = jest.fn()
const fetchSyndicatedTweetsMock = jest.fn()

jest.mock('./metaTwitter/bangers', () => ({
  getProfileBangersPage: (...args: unknown[]) =>
    getProfileBangersPageMock(...args),
  PROFILE_BANGERS_INITIAL_LIMIT: 2,
}))

jest.mock('./twitterSyndication', () => ({
  fetchSyndicatedTweets: (...args: unknown[]) =>
    fetchSyndicatedTweetsMock(...args),
}))

import { GET } from '@/app/api/profile/[account_id]/avatar/route'

const banger = (tweetId: string, avatarMediaUrl: string | null = null) => ({
  tweet_id: tweetId,
  avatar_media_url: avatarMediaUrl,
})

beforeEach(() => {
  getProfileBangersPageMock.mockReset()
  fetchSyndicatedTweetsMock.mockReset()
})

test('returns the stored high-resolution banger avatar without syndication', async () => {
  getProfileBangersPageMock.mockResolvedValueOnce({
    tweets: [
      banger(
        '100',
        'https://pbs.twimg.com/profile_images/42/avatar_normal.jpg',
      ),
    ],
    available: true,
  })

  const response = await GET(new Request('http://localhost'), {
    params: { account_id: '42' },
  })

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    avatar_media_url:
      'https://pbs.twimg.com/profile_images/42/avatar_400x400.jpg',
  })
  expect(response.headers.get('cache-control')).toBe(
    'public, s-maxage=3600, stale-while-revalidate=86400',
  )
  expect(fetchSyndicatedTweetsMock).not.toHaveBeenCalled()
})

test('recovers an avatar from a bounded set of syndicated bangers', async () => {
  getProfileBangersPageMock.mockResolvedValueOnce({
    tweets: [banger('100'), banger('101')],
    available: true,
  })
  fetchSyndicatedTweetsMock.mockResolvedValueOnce(
    new Map([
      [
        '100',
        {
          account_id: '42',
          avatar_media_url:
            'https://pbs.twimg.com/profile_images/42/avatar_normal.jpg',
        },
      ],
      ['101', null],
    ]),
  )

  const response = await GET(new Request('http://localhost'), {
    params: { account_id: '42' },
  })

  expect(fetchSyndicatedTweetsMock).toHaveBeenCalledWith(['100', '101'], {
    limit: 2,
  })
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    avatar_media_url:
      'https://pbs.twimg.com/profile_images/42/avatar_400x400.jpg',
  })
})

test('short-caches a legitimate missing avatar', async () => {
  getProfileBangersPageMock.mockResolvedValueOnce({
    tweets: [],
    available: true,
  })
  fetchSyndicatedTweetsMock.mockResolvedValueOnce(new Map())

  const response = await GET(new Request('http://localhost'), {
    params: { account_id: '42' },
  })

  expect(response.status).toBe(404)
  expect(response.headers.get('cache-control')).toBe('public, s-maxage=300')
})

test('does not cache an upstream banger failure as a missing avatar', async () => {
  getProfileBangersPageMock.mockResolvedValueOnce({
    tweets: [],
    available: false,
  })

  const response = await GET(new Request('http://localhost'), {
    params: { account_id: '42' },
  })

  expect(response.status).toBe(502)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
