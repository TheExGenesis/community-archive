import { GET } from '@/app/api/profile/[account_id]/avatar/route'
import { getProfileBangersPage } from '@/lib/metaTwitter/bangers'
import { fetchSyndicatedTweets } from '@/lib/twitterSyndication'
jest.mock('@/lib/metaTwitter/bangers', () => ({
  getProfileBangersPage: jest.fn(),
  PROFILE_BANGERS_INITIAL_LIMIT: 2,
}))
jest.mock('@/lib/twitterSyndication', () => ({
  fetchSyndicatedTweets: jest.fn(),
}))
beforeEach(() => {
  jest.clearAllMocks()
  ;(getProfileBangersPage as jest.Mock).mockResolvedValue({
    available: true,
    tweets: [
      { tweet_id: '100', avatar_media_url: 'https://pbs.twimg.com/old.jpg' },
    ],
  })
})
test('uses stored avatars for normal requests without external recovery', async () => {
  const response = await GET(
    new Request('https://archive.test/api/profile/42/avatar'),
    { params: { account_id: '42' } },
  )
  expect(await response.json()).toEqual({
    avatar_media_url: 'https://pbs.twimg.com/old.jpg',
  })
  expect(fetchSyndicatedTweets).not.toHaveBeenCalled()
})
test('a failed-image refresh bypasses the known stored avatar and checks the author', async () => {
  ;(fetchSyndicatedTweets as jest.Mock).mockResolvedValue(
    new Map([
      [
        '100',
        { account_id: '42', avatar_media_url: 'https://pbs.twimg.com/new.jpg' },
      ],
    ]),
  )
  const response = await GET(
    new Request('https://archive.test/api/profile/42/avatar?refresh=1'),
    { params: { account_id: '42' } },
  )
  expect(await response.json()).toEqual({
    avatar_media_url: 'https://pbs.twimg.com/new.jpg',
  })
  expect(fetchSyndicatedTweets).toHaveBeenCalledWith(['100'], { limit: 2 })
  ;(fetchSyndicatedTweets as jest.Mock).mockResolvedValue(
    new Map([
      [
        '100',
        {
          account_id: '99',
          avatar_media_url: 'https://pbs.twimg.com/wrong.jpg',
        },
      ],
    ]),
  )
  const mismatch = await GET(
    new Request('https://archive.test/api/profile/42/avatar?refresh=1'),
    { params: { account_id: '42' } },
  )
  expect(mismatch.status).toBe(404)
})
