import { GET } from './route'
import { createServerServiceRoleClient } from '@/utils/supabase'

jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

const TOKEN = '11111111-1111-4111-8111-111111111111'
beforeEach(() => jest.clearAllMocks())

test('marks the first open and returns an uncached image', async () => {
  const query = {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockResolvedValue({ error: null }),
  }
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => query } as never)
  const response = await GET(new Request('http://localhost'), {
    params: { token: TOKEN },
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toBe('image/gif')
  expect(response.headers.get('Cache-Control')).toContain('no-store')
  expect(query.eq).toHaveBeenCalledWith('open_token', TOKEN)
  expect(query.is).toHaveBeenCalledWith('opened_at', null)
})

test('an invalid token returns the image without a database write', async () => {
  const response = await GET(new Request('http://localhost'), {
    params: { token: 'invalid' },
  })
  expect(response.status).toBe(200)
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
