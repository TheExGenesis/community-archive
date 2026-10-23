import { cookies } from 'next/headers'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import { removeArchiveObjects } from '@/lib/upload-archive/removeArchiveObjects'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import { DELETE } from './route'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerClient: jest.fn(),
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/sessionTwitterUsername', () => ({
  getSessionTwitterUsername: jest.fn(),
}))
jest.mock('@/lib/upload-archive/removeArchiveObjects', () => ({
  removeArchiveObjects: jest.fn(),
}))

const mockedCookies = jest.mocked(cookies)
const mockedCreateServerClient = jest.mocked(createServerClient)
const mockedServiceRoleClient = jest.mocked(createServerServiceRoleClient)
const mockedUsername = jest.mocked(getSessionTwitterUsername)
const mockedRemove = jest.mocked(removeArchiveObjects)
const serviceClient = { storage: {} }

function sessionUser(
  user: Record<string, unknown> | null,
  error: { message: string } | null = null,
) {
  mockedCreateServerClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error }),
    },
  } as unknown as ReturnType<typeof createServerClient>)
}

describe('archive file deletion route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedCookies.mockReturnValue({} as ReturnType<typeof cookies>)
    mockedServiceRoleClient.mockReturnValue(
      serviceClient as unknown as ReturnType<
        typeof createServerServiceRoleClient
      >,
    )
  })

  it.each([
    ['no session', null, null],
    ['an unverified session', { id: 'user-1' }, { message: 'bad jwt' }],
  ])('rejects %s without using the service role', async (_, user, error) => {
    sessionUser(user, error)

    const response = await DELETE()

    expect(response.status).toBe(401)
    expect(mockedServiceRoleClient).not.toHaveBeenCalled()
    expect(mockedRemove).not.toHaveBeenCalled()
  })

  it('rejects a session without a trusted Twitter username', async () => {
    sessionUser({ id: 'user-1', user_metadata: { user_name: 'spoofed' } })
    mockedUsername.mockReturnValue(null)

    const response = await DELETE()

    expect(response.status).toBe(403)
    expect(mockedServiceRoleClient).not.toHaveBeenCalled()
    expect(mockedRemove).not.toHaveBeenCalled()
  })

  it('removes only the folder named by the verified identity', async () => {
    const user = { id: 'user-1' }
    sessionUser(user)
    mockedUsername.mockReturnValue('verified_owner')
    mockedRemove.mockResolvedValue(3)

    const response = await DELETE()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ removed: 3 })
    expect(mockedUsername).toHaveBeenCalledWith(user)
    expect(mockedRemove).toHaveBeenCalledWith(serviceClient, 'verified_owner')
  })

  it('returns a generic error when Storage removal fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    sessionUser({ id: 'user-1' })
    mockedUsername.mockReturnValue('verified_owner')
    mockedRemove.mockRejectedValue(new Error('storage internals'))

    const response = await DELETE()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to delete archive files',
    })
  })
})
