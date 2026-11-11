import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/utils/supabase'
import { browsingAuthError, requireBrowsingUser } from '@/lib/browsingAuth'
import { GET as search } from '@/app/api/tweet-search/route'
import { GET as related } from '@/app/api/search/related/route'
import { GET as directory } from '@/app/api/user-directory/route'
import { GET as avatar } from '@/app/api/profile/[account_id]/avatar/route'
import { GET as bangers } from '@/app/api/profile/[account_id]/bangers/route'
import { GET as interactions } from '@/app/api/profile/[account_id]/interactions/route'
import { GET as media } from '@/app/api/profile/[account_id]/media/route'
import { GET as sidebar } from '@/app/api/profile/[account_id]/sidebar/route'

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}))
jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('redirect')
  }),
}))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))
const getUser = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue({ auth: { getUser } })
  getUser.mockResolvedValue({ data: { user: null }, error: null })
})

test.each([
  search,
  related,
  directory,
  avatar,
  bangers,
  interactions,
  media,
  sidebar,
])(
  'API handler rejects guests even without middleware (%#)',
  async (handler) => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    const response = await handler(
      new NextRequest('https://archive.test/api/unused'),
      { params: Promise.resolve({ account_id: '42' }) },
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Authentication required' })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  },
)

test('allows any verified signed-in user, without requiring archive membership', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null })
  expect(await browsingAuthError()).toBeNull()
  await requireBrowsingUser('/search')
  expect(redirect).not.toHaveBeenCalled()
})

test('pages redirect guests before reading data', async () => {
  await expect(requireBrowsingUser('/search?q=hello')).rejects.toThrow(
    'redirect',
  )
  expect(redirect).toHaveBeenCalledWith('/login?redirect=%2Fsearch%3Fq%3Dhello')
})

test.each(['error', 'throws'])('denies access when auth %s', async (mode) => {
  if (mode === 'error')
    getUser.mockResolvedValue({
      data: { user: { id: 'viewer' } },
      error: new Error('Invalid token'),
    })
  else getUser.mockRejectedValue(new Error('Auth unavailable'))
  expect((await browsingAuthError())?.status).toBe(401)
})
