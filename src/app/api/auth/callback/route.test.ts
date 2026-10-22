import { GET } from './route'
import { createServerAdminClient } from '@/utils/supabase'

const mockExchangeCodeForSession = jest.fn()
const mockUpdateUserById = jest.fn()

jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({})) }))
jest.mock('@/utils/supabase', () => ({ createServerAdminClient: jest.fn() }))

const callback = () =>
  GET(new Request('http://localhost:3000/api/auth/callback?code=abc&next=/'))

beforeEach(() => {
  jest.clearAllMocks()
  mockUpdateUserById.mockResolvedValue({ error: null })
  jest.mocked(createServerAdminClient).mockReturnValue({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      admin: { updateUserById: mockUpdateUserById },
    },
  } as unknown as ReturnType<typeof createServerAdminClient>)
})

test('copies the account from the Twitter identity, not user_metadata', async () => {
  mockExchangeCodeForSession.mockResolvedValue({
    data: {
      user: {
        id: 'auth-user-1',
        user_metadata: { provider_id: '999', user_name: 'victim' },
        identities: [
          {
            id: '42',
            provider: 'twitter',
            identity_data: { provider_id: '42', user_name: 'ArchiveMember' },
          },
        ],
      },
    },
    error: null,
  })

  const response = await callback()

  expect(response.status).toBe(307)
  expect(mockUpdateUserById).toHaveBeenCalledWith('auth-user-1', {
    app_metadata: { provider_id: '42', user_name: 'archivemember' },
  })
})

test('writes no account claim when the session has no Twitter identity', async () => {
  mockExchangeCodeForSession.mockResolvedValue({
    data: {
      user: {
        id: 'auth-user-1',
        user_metadata: { provider_id: '999', user_name: 'victim' },
        identities: [],
      },
    },
    error: null,
  })

  const response = await callback()

  expect(response.status).toBe(307)
  expect(mockUpdateUserById).not.toHaveBeenCalled()
})
