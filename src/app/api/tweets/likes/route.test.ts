import { GET } from './route'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'

jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

const mockUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>
const mockClient = createServerServiceRoleClient as jest.MockedFunction<
  typeof createServerServiceRoleClient
>

const get = (ids: string) =>
  GET(new Request(`http://localhost/api/tweets/likes?ids=${ids}`))

describe('tweet like summary route', () => {
  const rpc = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    rpc.mockResolvedValue({
      data: [{ tweet_id: '11', like_count: 2, viewer_liked: true }],
      error: null,
    })
    mockClient.mockReturnValue({ rpc } as never)
    mockUser.mockResolvedValue({ id: 'user-123' } as never)
  })

  it('returns counts and viewer state for liked tweets only', async () => {
    const response = await get('11,12,11')

    expect(rpc).toHaveBeenCalledWith('ca_tweet_like_summary', {
      p_tweet_ids: ['11', '12'],
      p_viewer_id: 'user-123',
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({
      signedIn: true,
      likes: { '11': { count: 2, liked: true } },
    })
  })

  it('serves signed-out visitors without a viewer id', async () => {
    mockUser.mockResolvedValue(null)
    const response = await get('11')

    expect(rpc).toHaveBeenCalledWith('ca_tweet_like_summary', {
      p_tweet_ids: ['11'],
      p_viewer_id: null,
    })
    expect((await response.json()).signedIn).toBe(false)
  })

  it.each([
    ['', 'no ids'],
    ['11,abc', 'a non-numeric id'],
    [Array.from({ length: 101 }, (_, i) => i + 1).join(','), 'too many ids'],
  ])('rejects %s (%s)', async (ids) => {
    expect((await get(ids)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
})
