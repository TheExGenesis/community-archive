import { NextRequest } from 'next/server'
import { GET } from '@/app/api/hex-map/lookup/route'
import { mapGateway } from './gateway'
import { readMembers } from '@/lib/directoryMembers'
import { MAP_VERSION } from './version'

jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

jest.mock('./gateway', () => ({ mapGateway: jest.fn() }))
jest.mock('@/lib/directoryMembers', () => ({ readMembers: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/featuredArchives', () => ({
  sampleFeaturedArchives: () => [],
}))
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
  jest.mocked(mapGateway).mockResolvedValue(result)
})
afterAll(() => {
  if (originalEnvironment === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalEnvironment
})
it('reads gateway-filtered real members directly from the gateway in preview', async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(result)
  expect(mapGateway).toHaveBeenCalledWith('hex-lookup', {
    names: 'exgenesis',
    cells: '',
  })
  expect(readMembers).not.toHaveBeenCalled()
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
})
it('does not restore accounts excluded by gateway policy', async () => {
  jest.mocked(mapGateway).mockResolvedValue({ ...result, people: [] })
  expect((await (await GET(request())).json()).people).toEqual([])
})
it.each(['unavailable', 'version mismatch'])(
  'fails closed on %s',
  async (failure) => {
    if (failure === 'unavailable')
      jest.mocked(mapGateway).mockRejectedValueOnce(new Error('offline'))
    else
      jest
        .mocked(mapGateway)
        .mockResolvedValueOnce({ ...result, version: 'old' })
    expect((await GET(request())).status).toBe(503)
  },
)
it('rejects invalid input before querying', async () => {
  expect((await GET(request('name=bad!'))).status).toBe(400)
  expect(mapGateway).not.toHaveBeenCalled()
})
it('filters current membership in production without rechecking opt-outs', async () => {
  process.env.VERCEL_ENV = 'production'
  jest.mocked(readMembers).mockResolvedValueOnce({
    members: new Set(['exgenesis']),
    avatars: new Map(),
  })
  expect((await (await GET(request())).json()).people).toEqual(result.people)
  jest
    .mocked(readMembers)
    .mockResolvedValueOnce({ members: new Set(), avatars: new Map() })
  expect((await (await GET(request())).json()).people).toEqual([])
  expect(readMembers).toHaveBeenCalledWith(['exgenesis'])
})
