import { NextRequest } from 'next/server'
import { GET } from '@/app/api/hex-map/lookup/route'
import { mapGateway } from './gateway'
import { getAppPolicy } from '@/lib/community-apps/data'
import { MAP_VERSION } from './version'

jest.mock('./gateway', () => ({ mapGateway: jest.fn() }))
jest.mock('@/lib/community-apps/data', () => ({ getAppPolicy: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/featuredArchives', () => ({
  sampleFeaturedArchives: () => [],
}))

const fetchMock = jest.fn()
const originalFetch = global.fetch
const originalEnvironment = process.env.VERCEL_ENV
const result = {
  version: MAP_VERSION,
  counts: { 1414: 1 },
  people: [{ account_id: '322603863', cell: 1414, username: 'exgenesis' }],
}
const request = (query = 'name=exgenesis') =>
  new NextRequest(
    `https://preview.test/api/hex-map/lookup?${query}&version=${MAP_VERSION}`,
  )

beforeEach(() => {
  jest.clearAllMocks()
  process.env.VERCEL_ENV = 'preview'
  global.fetch = fetchMock
  fetchMock.mockResolvedValue({ ok: true, json: async () => result })
})
afterAll(() => {
  global.fetch = originalFetch
  if (originalEnvironment === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalEnvironment
})

it('uses current production policy for real map members in staging previews', async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(result)
  expect(fetchMock).toHaveBeenCalledWith(
    new URL(
      `https://www.community-archive.org/api/hex-map/lookup?name=exgenesis&cells=&version=${MAP_VERSION}`,
    ),
    { cache: 'no-store', signal: expect.any(AbortSignal) },
  )
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(mapGateway).not.toHaveBeenCalled()
  expect(getAppPolicy).not.toHaveBeenCalled()
})

it('keeps members excluded by production policy excluded in the preview', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ...result, people: [] }),
  })
  expect((await (await GET(request())).json()).people).toEqual([])
})

it.each(['unavailable', 'version mismatch'])(
  'fails closed when production lookup has %s',
  async (failure) => {
    fetchMock.mockResolvedValue({
      ok: failure !== 'unavailable',
      json: async () => ({ ...result, version: 'old' }),
    })
    expect((await GET(request())).status).toBe(503)
    expect(mapGateway).not.toHaveBeenCalled()
  },
)

it('rejects invalid input before requesting production', async () => {
  expect((await GET(request('name=bad!'))).status).toBe(400)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('keeps production on its own gateway and authoritative membership checks', async () => {
  process.env.VERCEL_ENV = 'production'
  jest.mocked(mapGateway).mockResolvedValue(result)
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(['exgenesis']),
    blocked: new Set(),
    blockedIds: new Set(),
  })
  expect((await (await GET(request())).json()).people).toEqual(result.people)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(getAppPolicy).toHaveBeenCalledWith(['exgenesis'])
})
