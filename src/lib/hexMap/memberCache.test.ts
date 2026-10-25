import { readMapLookup } from './lookup'
import { mapGateway } from './gateway'
import { getAppPolicy } from '@/lib/community-apps/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { MAP_VERSION } from './version'

const mockCache = new Map<string, unknown>()
jest.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...args: string[]) => unknown) =>
    (...args: string[]) => {
      const key = JSON.stringify(args)
      if (!mockCache.has(key)) mockCache.set(key, fn(...args))
      return mockCache.get(key)
    },
}))
jest.mock('./gateway', () => ({ mapGateway: jest.fn() }))
jest.mock('@/lib/community-apps/data', () => ({ getAppPolicy: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
const originalEnvironment = process.env.VERCEL_ENV
beforeEach(() => {
  jest.clearAllMocks()
  mockCache.clear()
  process.env.VERCEL_ENV = 'production'
})
afterAll(() => {
  if (originalEnvironment === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalEnvironment
})
it('shares normalized first-page candidates and avatars, but rechecks consent on cache hits', async () => {
  jest.mocked(mapGateway).mockResolvedValue({
    version: MAP_VERSION,
    counts: { 2: 1 },
    nextOffset: null,
    people: [{ account_id: '1', username: 'one', cell: 2 }],
  })
  const avatars = jest.fn().mockResolvedValue({
    data: [
      {
        account_id: '1',
        username: 'one',
        has_archive: true,
        avatar_media_url: 'https://test/avatar',
      },
    ],
    error: null,
  })
  jest.mocked(createServerServiceRoleClient).mockReturnValue({
    rpc: avatars,
  } as never)
  jest
    .mocked(getAppPolicy)
    .mockResolvedValueOnce({
      members: new Set(['one']),
      blocked: new Set(),
      blockedIds: new Set(),
      avatars: new Map(),
    })
    .mockResolvedValueOnce({
      members: new Set(['one']),
      blocked: new Set(),
      blockedIds: new Set(['1']),
      avatars: new Map(),
    })
  const preview = await readMapLookup({ cells: '3,2,2', names: '' })
  expect(preview.people[0].avatar).toBe('https://test/avatar')
  const page = await readMapLookup({
    cells: '2,3',
    peoplePage: '1',
    offset: '0',
  })
  expect(page.people).toEqual([])
  expect(mapGateway).toHaveBeenCalledTimes(1)
  expect(mapGateway).toHaveBeenCalledWith('hex-lookup', {
    cells: '2,3',
    peoplePage: '1',
    offset: '0',
  })
  expect(avatars).toHaveBeenCalledTimes(1)
  expect(getAppPolicy).toHaveBeenCalledTimes(2)
  expect(preview.people).toHaveLength(1)
})
