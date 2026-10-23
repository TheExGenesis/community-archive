import { NextRequest } from 'next/server'
import { GET } from '@/app/api/hex-map/lookup/route'
import { readMapLookup } from './lookup'
import { MAP_VERSION } from './version'
jest.mock('./lookup', () => ({ readMapLookup: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
const request = (names: string) =>
  new NextRequest(
    `http://localhost/api/hex-map/lookup?version=${MAP_VERSION}&name=${encodeURIComponent(names)}`,
  )
beforeEach(() => jest.clearAllMocks())
it('uses one policy-filtered lookup for a comma-separated list, including preview searches', async () => {
  const result = {
    version: MAP_VERSION,
    people: [{ account_id: '1', username: 'one', cell: 4 }],
    counts: {},
  }
  jest.mocked(readMapLookup).mockResolvedValue(result)
  const response = await GET(request('@ONE, two, @one'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(result)
  expect(readMapLookup).toHaveBeenCalledWith({ names: 'one,two', cells: '' })
})
it('rejects malformed and oversized lists without querying identities', async () => {
  for (const names of [
    'one,bad!',
    ',,',
    Array.from({ length: 21 }, (_, i) => `user${i}`).join(','),
  ])
    expect((await GET(request(names))).status).toBe(400)
  expect(readMapLookup).not.toHaveBeenCalled()
})
