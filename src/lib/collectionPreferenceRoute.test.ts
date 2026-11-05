import { GET, POST } from '@/app/api/collection-preference/route'
import { NextRequest } from 'next/server'

const mockGetUser = jest.fn()
const mockUpsert = jest.fn()
const mockResults: Record<string, unknown> = {}
jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({})) }))
jest.mock('@/utils/supabase', () => ({
  createServerClient: () => ({ auth: { getUser: mockGetUser } }),
  createServerServiceRoleClient: () => ({
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        maybeSingle: () => Promise.resolve(mockResults[table]),
        limit: () => Promise.resolve(mockResults[table]),
        then: (resolve: any) =>
          Promise.resolve(mockResults[table]).then(resolve),
        upsert: mockUpsert,
      }
      return builder
    },
  }),
}))

const request = (body: unknown, origin?: string) =>
  new NextRequest('http://localhost/api/collection-preference', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { origin } : {}),
    },
  })

beforeEach(() => {
  process.env.NEXT_PUBLIC_ARCHIVE_ONLY_COLLECTION_ENABLED = 'true'
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'owner',
        app_metadata: { provider_id: '42' },
        user_metadata: { provider_id: '99' },
      },
    },
    error: null,
  })
  mockResults.account_collection_preferences = { data: null, error: null }
  mockResults.archive_upload = { data: [], error: null }
  mockResults.optin = { data: [], error: null }
  mockUpsert.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => {
  delete process.env.NEXT_PUBLIC_ARCHIVE_ONLY_COLLECTION_ENABLED
})

test('new contributors default to archive only; legacy membership retains collection', async () => {
  expect(await (await GET()).json()).toEqual({
    accountId: '42',
    enabled: true,
    uploadEnabled: false,
  })
  mockResults.archive_upload = { data: [{ id: 1 }], error: null }
  expect((await (await GET()).json()).uploadEnabled).toBe(true)
  mockResults.account_collection_preferences = {
    data: { enabled: false },
    error: null,
  }
  expect((await (await GET()).json()).uploadEnabled).toBe(false)
})
test('requires authentication and rejects user-editable identity claims', async () => {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'owner',
        app_metadata: {},
        user_metadata: { provider_id: '42' },
      },
    },
  })
  expect(
    (await POST(request({ accountId: '42', enabled: false }))).status,
  ).toBe(401)
  expect(mockUpsert).not.toHaveBeenCalled()
})
test.each([
  { accountId: '99', enabled: false },
  { accountId: '42', enabled: 'false' },
  null,
])('rejects invalid or mismatched mutations: %j', async (body) => {
  expect((await POST(request(body))).status).toBe(400)
  expect(mockUpsert).not.toHaveBeenCalled()
})
test('saves only the authenticated account preference without touching opt-out', async () => {
  expect(
    (await POST(request({ accountId: '42', enabled: false }))).status,
  ).toBe(200)
  expect(mockUpsert).toHaveBeenCalledWith({
    account_id: '42',
    enabled: false,
    updated_at: expect.any(String),
  })
})
test('fails closed on database errors and before coordinated activation', async () => {
  mockResults.account_collection_preferences = {
    error: { message: 'unavailable' },
  }
  expect((await GET()).status).toBe(503)
  mockUpsert.mockResolvedValue({ error: { message: 'unavailable' } })
  expect(
    (await POST(request({ accountId: '42', enabled: false }))).status,
  ).toBe(503)
  process.env.NEXT_PUBLIC_ARCHIVE_ONLY_COLLECTION_ENABLED = 'false'
  expect(
    (await POST(request({ accountId: '42', enabled: false }))).status,
  ).toBe(503)
})
test('rejects cross-origin mutations', async () => {
  expect(
    (
      await POST(
        request({ accountId: '42', enabled: false }, 'https://elsewhere.test'),
      )
    ).status,
  ).toBe(403)
  expect(mockUpsert).not.toHaveBeenCalled()
})
