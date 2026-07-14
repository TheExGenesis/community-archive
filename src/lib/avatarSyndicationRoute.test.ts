const mockFetchSyndicatedTweet = jest.fn()

jest.mock('./twitterSyndication', () => ({
  fetchSyndicatedTweet: (...args: unknown[]) =>
    mockFetchSyndicatedTweet(...args),
}))

import { GET } from '@/app/api/syndication/avatar/[tweet_id]/route'

describe('syndication avatar route', () => {
  beforeEach(() => {
    mockFetchSyndicatedTweet.mockReset()
  })

  it('returns the syndicated avatar URL', async () => {
    mockFetchSyndicatedTweet.mockResolvedValueOnce({
      avatar_media_url: 'https://pbs.twimg.com/profile_images/avatar.jpg',
    })

    const response = await GET(new Request('http://localhost'), {
      params: { tweet_id: '1234567890' },
    })

    expect(mockFetchSyndicatedTweet).toHaveBeenCalledWith('1234567890')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      avatar_media_url: 'https://pbs.twimg.com/profile_images/avatar.jpg',
    })
  })

  it('returns 404 when syndication has no usable avatar', async () => {
    mockFetchSyndicatedTweet.mockResolvedValueOnce(null)

    const response = await GET(new Request('http://localhost'), {
      params: { tweet_id: '1234567890' },
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      avatar_media_url: null,
    })
  })
})
