import { GET } from './route'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'

jest.mock('@/lib/metaTwitter/profile', () => ({
  resolveProfileCore: jest.fn(),
}))

const resolve = jest.mocked(resolveProfileCore)

const call = (account_id: string) =>
  GET(new Request(`http://test/api/profile/${account_id}/preview`), {
    params: { account_id },
  })

beforeEach(() => resolve.mockReset())

test('a public profile returns the few facts a hover card shows', async () => {
  resolve.mockResolvedValue({
    accountId: '42',
    profile: {
      account_id: '42',
      username: 'csgbwk',
      account_display_name: 'csgm',
      created_at: null,
      num_tweets: 1200,
      num_followers: 300,
      num_following: 10,
      num_likes: 5,
      has_archive: true,
      is_opted_in: true,
      bio: 'robots',
      website: null,
      location: 'Singapore',
      avatar_media_url: 'https://pbs.twimg.com/a.jpg',
      header_media_url: null,
    },
  } as Awaited<ReturnType<typeof resolveProfileCore>>)
  const response = await call('csgbwk')
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toContain('public')
  expect(await response.json()).toEqual({
    accountId: '42',
    username: 'csgbwk',
    displayName: 'csgm',
    bio: 'robots',
    location: 'Singapore',
    avatar: 'https://pbs.twimg.com/a.jpg',
    tweets: 1200,
    followers: 300,
    hasArchive: true,
  })
  expect(resolve).toHaveBeenCalledWith('csgbwk')
})

test('a malformed handle is refused without a lookup', async () => {
  const response = await call('not a handle')
  expect(response.status).toBe(400)
  expect(resolve).not.toHaveBeenCalled()
})

test('a profile that is not public is not found, and a failure is a 502', async () => {
  resolve.mockResolvedValueOnce(null)
  expect((await call('123')).status).toBe(404)
  resolve.mockRejectedValueOnce(new Error('down'))
  jest.spyOn(console, 'error').mockImplementationOnce(() => {})
  expect((await call('123')).status).toBe(502)
})
