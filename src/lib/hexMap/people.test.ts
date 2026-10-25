import { NextRequest } from 'next/server'
import { GET } from '@/app/api/hex-map/people/route'
import { mapGateway } from './gateway'
import { readMembers } from '@/lib/directoryMembers'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { MAP_VERSION } from './version'

jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

jest.mock('./gateway', () => ({ mapGateway: jest.fn() }))
jest.mock('@/lib/directoryMembers', () => ({
  ...jest.requireActual('@/lib/directoryMembers'),
  readMembers: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
const originalEnvironment = process.env.VERCEL_ENV
const people = Array.from({ length: 24 }, (_, index) => ({
  account_id: String(index + 1),
  username: `member${index}`,
  cell: 2,
}))
const request = (params = 'cells=2&offset=24') =>
  new NextRequest(
    `https://test/api/hex-map/people?${params}&version=${MAP_VERSION}`,
  )
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(createServerServiceRoleClient).mockReturnValue({
    rpc: async () => ({ data: [], error: null }),
  } as never)
  process.env.VERCEL_ENV = 'preview'
  jest.mocked(mapGateway).mockResolvedValue({
    version: MAP_VERSION,
    counts: {},
    people,
    nextOffset: 48,
  })
})
afterAll(() => {
  if (originalEnvironment === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalEnvironment
})
it('requests a bounded selected page and preserves continuation across fully membership-filtered pages', async () => {
  process.env.VERCEL_ENV = 'production'
  jest
    .mocked(readMembers)
    .mockResolvedValue({ members: new Set(), avatars: new Map() })
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ people: [], nextOffset: 48 })
  expect(mapGateway).toHaveBeenCalledWith('hex-lookup', {
    cells: '2',
    offset: '24',
    peoplePage: '1',
  })
  expect(readMembers).toHaveBeenCalledWith(
    people.map((person) => person.username),
  )
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
})
it('hydrates the entire member page and excludes nonmembers', async () => {
  process.env.VERCEL_ENV = 'production'
  jest.mocked(readMembers).mockResolvedValue({
    members: new Set(people.slice(1).map((person) => person.username)),
    avatars: new Map(),
  })
  const rpc = jest.fn().mockResolvedValue({
    data: [
      {
        account_id: '24',
        username: 'member23',
        has_archive: true,
        avatar_media_url: 'https://test/avatar.jpg',
      },
    ],
    error: null,
  })
  jest.mocked(createServerServiceRoleClient).mockReturnValue({
    rpc,
  } as never)
  const response = await GET(request())
  const page = await response.json()
  expect(response.status).toBe(200)
  expect(page.people).toHaveLength(23)
  expect(page.people.at(-1)).toMatchObject({
    account_id: '24',
    avatar: 'https://test/avatar.jpg',
  })
  expect(rpc).toHaveBeenCalledWith(
    'directory_members_by_username',
    { p_usernames: people.map((person) => person.username) },
    { get: true },
  )
})
it.each([
  '',
  'cells=1730',
  'cells=2&offset=-1',
  'cells=2&offset=10001',
  'cells=2.5',
])('rejects invalid page input %s', async (params) => {
  expect((await GET(request(params))).status).toBe(400)
  expect(mapGateway).not.toHaveBeenCalled()
})
it.each([undefined, 24, 10001])(
  'fails closed when the gateway has an absent or invalid continuation %s',
  async (nextOffset) => {
    jest.mocked(mapGateway).mockResolvedValue({
      version: MAP_VERSION,
      counts: {},
      people,
      nextOffset,
    })
    expect((await GET(request())).status).toBe(503)
    expect(readMembers).not.toHaveBeenCalled()
  },
)
it('fails closed if current membership is unavailable', async () => {
  process.env.VERCEL_ENV = 'production'
  jest.mocked(readMembers).mockRejectedValue(new Error('offline'))
  expect((await GET(request())).status).toBe(503)
})
