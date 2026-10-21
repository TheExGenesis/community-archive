import { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { GET } from '@/app/api/hex-map/me/route'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getAppPolicy } from '@/lib/community-apps/data'
import { mapGateway } from './gateway'
import { MAP_VERSION } from './version'

jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/community-apps/data', () => ({ getAppPolicy: jest.fn() }))
jest.mock('./gateway', () => ({ mapGateway: jest.fn() }))
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  identities: [
    {
      provider: 'twitter',
      identity_data: { user_name: 'Me_One', provider_id: '123' },
    },
  ],
} as unknown as User
const consent = {
  user_id: user.id,
  twitter_user_id: '123',
  username: 'me_one',
  opted_in: true,
  explicit_optout: false,
}
const range = jest.fn()
const query = {
  select: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range,
}
const request = (query = '') =>
  new NextRequest(
    `http://localhost/api/hex-map/me?version=${MAP_VERSION}${query}`,
  )
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getCurrentUser).mockResolvedValue(user)
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: jest.fn(() => query) } as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >)
  range.mockResolvedValue({ data: [consent], error: null })
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(['me_one']),
    blocked: new Set(),
    blockedIds: new Set(),
  })
  jest.mocked(mapGateway).mockResolvedValue({
    version: MAP_VERSION,
    people: [
      { account_id: '123', username: 'me_one', cell: 4 },
      { account_id: '456', username: 'someone', cell: 5 },
    ],
    counts: { 4: 100 },
  })
})
it('requires authentication, with no downstream identity reads', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue(null)
  const res = await GET(request())
  expect(res.status).toBe(401)
  expect((await res.json()).status).toBe('sign_in')
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
  expect(mapGateway).not.toHaveBeenCalled()
})
it('does not trust client-mutable profile identity', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({
    ...user,
    identities: [],
    user_metadata: { user_name: 'me_one', provider_id: '123' },
  })
  expect((await GET(request())).status).toBe(403)
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
it('cannot be used to plot a different account', async () => {
  expect((await GET(request('&name=someone'))).status).toBe(403)
  expect(mapGateway).not.toHaveBeenCalled()
})
it('returns only the verified self pin with no-store caching', async () => {
  const res = await GET(request('&name=%40ME_ONE'))
  expect(res.status).toBe(200)
  expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await res.json()).toEqual({
    status: 'located',
    person: { username: 'me_one', cell: 4 },
  })
  expect(mapGateway).toHaveBeenCalledWith('hex-lookup', { names: 'me_one' })
})
it('requires explicit opt-in even when an archive makes the account a member', async () => {
  range.mockResolvedValue({ data: [], error: null })
  const res = await GET(request())
  expect(res.status).toBe(403)
  expect((await res.json()).status).toBe('opt_in')
  expect(mapGateway).not.toHaveBeenCalled()
})
it('recognizes manual consent but not consent for a recycled handle', async () => {
  range.mockResolvedValue({
    data: [{ ...consent, user_id: null, twitter_user_id: null }],
    error: null,
  })
  expect((await GET(request())).status).toBe(200)
  range.mockResolvedValue({
    data: [{ ...consent, user_id: null, twitter_user_id: '456' }],
    error: null,
  })
  expect((await GET(request())).status).toBe(403)
})
it('explicit opt-out wins over an opted-in record on another handle', async () => {
  range.mockResolvedValue({
    data: [
      consent,
      { ...consent, username: 'old_handle', explicit_optout: true },
    ],
    error: null,
  })
  expect((await GET(request())).status).toBe(403)
  expect(mapGateway).not.toHaveBeenCalled()
})
it('checks subsequent pages before granting consent', async () => {
  range
    .mockResolvedValueOnce({ data: Array(1000).fill(consent), error: null })
    .mockResolvedValueOnce({
      data: [{ ...consent, explicit_optout: true }],
      error: null,
    })
  expect((await GET(request())).status).toBe(403)
  expect(range).toHaveBeenLastCalledWith(1000, 1999)
})
it('does not apply wildcard ILIKE matches to another account', async () => {
  range.mockResolvedValue({
    data: [
      consent,
      {
        ...consent,
        user_id: null,
        twitter_user_id: '456',
        username: 'mexone',
        explicit_optout: true,
      },
    ],
    error: null,
  })
  expect((await GET(request())).status).toBe(200)
})
it('also honors the current authoritative policy by stable account ID', async () => {
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(['me_one']),
    blocked: new Set(),
    blockedIds: new Set(['123']),
  })
  expect((await GET(request())).status).toBe(403)
  expect(mapGateway).not.toHaveBeenCalled()
})
it('fails closed on unavailable consent or policy', async () => {
  range.mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
  expect((await GET(request())).status).toBe(503)
  jest.mocked(getAppPolicy).mockRejectedValueOnce(new Error('offline'))
  expect((await GET(request())).status).toBe(503)
  expect(mapGateway).not.toHaveBeenCalled()
})
it.each([
  { people: [] },
  { people: [{ account_id: '456', username: 'me_one', cell: 4 }] },
  { people: [{ account_id: '123', username: 'me_one', cell: -1 }] },
])(
  'does not guess a location when the verified account is absent',
  async ({ people }) => {
    jest.mocked(mapGateway).mockResolvedValue({ version: MAP_VERSION, people })
    const res = await GET(request())
    expect(res.status).toBe(404)
    expect((await res.json()).status).toBe('not_mapped')
  },
)
it('rejects incompatible geometry on either side of the lookup', async () => {
  expect(
    (await GET(new NextRequest('http://localhost/api/hex-map/me?version=old')))
      .status,
  ).toBe(409)
  expect(getCurrentUser).not.toHaveBeenCalled()
  jest.mocked(mapGateway).mockResolvedValue({ version: 'old', people: [] })
  expect((await GET(request())).status).toBe(503)
})
