import { POST } from './route'
import { createDigestAdminClient } from '@/lib/digest/database'

jest.mock('@/lib/digest/database', () => ({
  createDigestAdminClient: jest.fn(),
}))

const ID = '11111111-1111-4111-8111-111111111111'
beforeEach(() => jest.clearAllMocks())

test('increments a published digest and returns its new view count', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: 42, error: null })
  jest.mocked(createDigestAdminClient).mockReturnValue({ rpc } as never)
  const response = await POST(new Request('http://localhost'), {
    params: { editionId: ID },
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.json()).toEqual({ count: 42 })
  expect(rpc).toHaveBeenCalledWith('record_digest_view', { p_edition_id: ID })
})

test('rejects a malformed edition id before touching the database', async () => {
  const response = await POST(new Request('http://localhost'), {
    params: { editionId: 'invalid' },
  })
  expect(response.status).toBe(404)
  expect(createDigestAdminClient).not.toHaveBeenCalled()
})
