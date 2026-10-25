import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createMiddlewareClient } from '@/utils/supabase'

jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }))

test('returns the latest response with every refreshed or cleared cookie', () => {
  ;(createServerClient as jest.Mock).mockReturnValue({ auth: {} })
  const request = new NextRequest('https://archive.test/search')
  const client = createMiddlewareClient(request)
  const originalResponse = client.response
  const { cookies } = (createServerClient as jest.Mock).mock.calls[0][2]

  cookies.set('sb-test-auth-token.0', 'first', { path: '/', sameSite: 'lax' })
  cookies.set('sb-test-auth-token.1', 'second', { path: '/', sameSite: 'lax' })
  cookies.remove('sb-test-auth-token', { path: '/', maxAge: 0 })

  expect(client.response).not.toBe(originalResponse)
  expect(client.response.cookies.get('sb-test-auth-token.0')?.value).toBe(
    'first',
  )
  expect(client.response.cookies.get('sb-test-auth-token.1')?.value).toBe(
    'second',
  )
  expect(client.response.cookies.get('sb-test-auth-token')?.maxAge).toBe(0)
  expect(request.cookies.get('sb-test-auth-token.1')?.value).toBe('second')
  expect(client.response.headers.get('x-middleware-request-cookie')).toContain(
    'sb-test-auth-token.1=second',
  )
})
