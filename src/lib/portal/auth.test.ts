jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('react', () => {
  const actual = jest.requireActual('react')
  return {
    ...actual,
    cache: (loader: () => unknown) => {
      let result: unknown
      let called = false
      return () => {
        if (!called) {
          result = loader()
          called = true
        }
        return result
      }
    },
  }
})
jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))

import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import { getCurrentUser, getIsMember } from './auth'

const cookiesMock = cookies as jest.MockedFunction<typeof cookies>
const createServerClientMock = createServerClient as jest.MockedFunction<
  typeof createServerClient
>

test('deduplicates the current-user auth request across portal consumers', async () => {
  const user = { id: 'member-1' }
  const getUser = jest.fn().mockResolvedValue({
    data: { user },
    error: null,
  })
  cookiesMock.mockReturnValue({} as ReturnType<typeof cookies>)
  createServerClientMock.mockReturnValue({
    auth: { getUser },
  } as unknown as ReturnType<typeof createServerClient>)

  await expect(
    Promise.all([getCurrentUser(), getIsMember(), getCurrentUser()]),
  ).resolves.toEqual([user, true, user])
  expect(getUser).toHaveBeenCalledTimes(1)
})
