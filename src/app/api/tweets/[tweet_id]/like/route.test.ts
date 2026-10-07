import { DELETE, POST } from './route'
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
const tweetId = '1790000000000000001'
const xUser = {
  id: 'user-123',
  app_metadata: { provider_id: '4242' },
  identities: [
    {
      provider: 'twitter',
      identity_data: { user_name: 'Ada', full_name: 'Ada L' },
    },
  ],
}

function setup() {
  const upsert = jest.fn().mockResolvedValue({ error: null })
  const deleteUserEq = jest.fn().mockResolvedValue({ error: null })
  const deleteTweetEq = jest.fn().mockReturnValue({ eq: deleteUserEq })
  const rpc = jest.fn().mockResolvedValue({
    data: [{ tweet_id: tweetId, like_count: 3, viewer_liked: false }],
    error: null,
  })
  const from = jest.fn().mockReturnValue({
    upsert,
    delete: jest.fn().mockReturnValue({ eq: deleteTweetEq }),
  })
  mockClient.mockReturnValue({ from, rpc } as never)
  return { upsert, deleteTweetEq, deleteUserEq, from }
}

const call = (handler: typeof POST, id = tweetId) =>
  handler(new Request('http://localhost'), { params: { tweet_id: id } })

describe('tweet like route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUser.mockResolvedValue(xUser as never)
  })

  it('records a like attributed to the X account behind the session', async () => {
    const db = setup()
    const response = await call(POST)

    expect(response.status).toBe(200)
    expect(db.from).toHaveBeenCalledWith('ca_tweet_likes')
    expect(db.upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-123',
        account_id: '4242',
        tweet_id: tweetId,
        username: 'ada',
        display_name: 'Ada L',
      },
      { onConflict: 'user_id,tweet_id', ignoreDuplicates: true },
    )
    await expect(response.json()).resolves.toEqual({ liked: true, count: 3 })
  })

  it("removes only the viewer's own like", async () => {
    const db = setup()
    const response = await call(DELETE)

    expect(db.deleteTweetEq).toHaveBeenCalledWith('tweet_id', tweetId)
    expect(db.deleteUserEq).toHaveBeenCalledWith('user_id', 'user-123')
    await expect(response.json()).resolves.toEqual({ liked: false, count: 3 })
  })

  it('rejects signed-out visitors without writing', async () => {
    const db = setup()
    mockUser.mockResolvedValue(null)

    expect((await call(POST)).status).toBe(401)
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it('rejects sessions that have no X account', async () => {
    const db = setup()
    mockUser.mockResolvedValue({ id: 'dev', app_metadata: {} } as never)

    expect((await call(POST)).status).toBe(403)
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it('rejects malformed tweet ids before reading the session', async () => {
    setup()

    expect((await call(POST, 'abc')).status).toBe(404)
    expect(mockUser).not.toHaveBeenCalled()
  })
})
