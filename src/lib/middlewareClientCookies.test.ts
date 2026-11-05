import { NextRequest } from 'next/server'
import {
  createServerClient as ssrClient,
  createBrowserClient as browserClient,
} from '@supabase/ssr'
import { createClient as sdkClient } from '@supabase/supabase-js'
import {
  createMiddlewareClient,
  createServerClient,
  createServerAdminClient,
  createBrowserClient,
  createServerAnonClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
  createBrowserClient: jest.fn(),
}))
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))

const previousEnv = process.env
beforeEach(() => {
  process.env = {
    ...previousEnv,
    NODE_ENV: 'test',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-dummy-anon',
    SUPABASE_SERVICE_ROLE: 'local-dummy-service',
  }

  jest.clearAllMocks()
  ;(ssrClient as jest.Mock).mockReturnValue({ auth: {} })
})

afterEach(() => {
  process.env = previousEnv
})

const cacheHeaders = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
}

test('applies whole cookie batches and replays cookies and cache headers on response replacement', () => {
  const request = new NextRequest('https://archive.test/search', {
    headers: { cookie: 'sb-test-auth-token.8=stale; preference=kept' },
  })
  const client = createMiddlewareClient(request)
  const originalResponse = client.response
  const { cookies } = (ssrClient as jest.Mock).mock.calls[0][2]
  const options = {
    path: '/',
    sameSite: 'lax',
    secure: true,
    httpOnly: true,
    maxAge: 3600,
  }
  expect(cookies.getAll()).toEqual(request.cookies.getAll())

  cookies.setAll(
    [
      { name: 'sb-test-auth-token.0', value: 'first', options },
      { name: 'sb-test-auth-token.1', value: 'second', options },
      {
        name: 'sb-test-auth-token.8',
        value: '',
        options: { path: '/', maxAge: 0 },
      },
    ],
    cacheHeaders,
  )
  const refreshedResponse = client.response
  // SSR only supplies cache headers on its first write for this client.
  cookies.setAll(
    [
      {
        name: 'sb-test-code-verifier',
        value: '',
        options: { path: '/', maxAge: 0 },
      },
    ],
    {},
  )

  expect(refreshedResponse).not.toBe(originalResponse)
  expect(client.response).not.toBe(refreshedResponse)
  expect(client.response.cookies.get('sb-test-auth-token.0')).toMatchObject({
    name: 'sb-test-auth-token.0',
    value: 'first',
    ...options,
  })
  expect(client.response.cookies.get('sb-test-auth-token.1')?.value).toBe(
    'second',
  )
  expect(client.response.cookies.get('sb-test-auth-token.8')).toMatchObject({
    value: '',
    maxAge: 0,
  })
  expect(client.response.cookies.get('sb-test-code-verifier')?.maxAge).toBe(0)
  expect(request.cookies.get('sb-test-auth-token.1')?.value).toBe('second')
  expect(cookies.getAll()).toEqual(request.cookies.getAll())
  expect(client.response.headers.get('x-middleware-request-cookie')).toContain(
    'sb-test-auth-token.1=second',
  )
  expect(client.response.headers.get('x-middleware-request-cookie')).toContain(
    'preference=kept',
  )
  expect(
    client.response.headers.get('x-middleware-request-cookie'),
  ).not.toContain('stale')
  for (const [name, value] of Object.entries(cacheHeaders)) {
    expect(client.response.headers.get(name)).toBe(value)
  }
})

test.each([createServerClient, createServerAdminClient])(
  'server session adapter reads every chunk and writes every cookie option',
  (createClient) => {
    const existing = [{ name: 'sb-test-auth-token.0', value: 'old' }]
    const store = { getAll: jest.fn(() => existing), set: jest.fn() }
    createClient(store as unknown as Parameters<typeof createServerClient>[0])
    expect(ssrClient).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      createClient === createServerClient
        ? 'local-dummy-anon'
        : 'local-dummy-service',
      expect.any(Object),
    )
    const { cookies } = (ssrClient as jest.Mock).mock.calls[0][2]
    expect(cookies.getAll()).toBe(existing)
    const batch = [
      {
        name: 'sb-test-auth-token.0',
        value: 'new',
        options: { path: '/', secure: true, sameSite: 'lax' },
      },
      {
        name: 'sb-test-auth-token.1',
        value: '',
        options: { path: '/', maxAge: 0 },
      },
    ]
    cookies.setAll(batch, cacheHeaders)
    expect(store.set.mock.calls).toEqual(
      batch.map(({ name, value, options }) => [{ name, value, ...options }]),
    )
  },
)

test('server component adapter tolerates immutable cookies while preserving reads', () => {
  const existing = [{ name: 'sb-test-auth-token.0', value: 'existing' }]
  const store = {
    getAll: () => existing,
    set: () => {
      throw new Error(
        'Cookies can only be modified in a Server Action or Route Handler',
      )
    },
  }
  createServerClient(
    store as unknown as Parameters<typeof createServerClient>[0],
  )
  const { cookies } = (ssrClient as jest.Mock).mock.calls[0][2]
  expect(() =>
    cookies.setAll(
      [
        {
          name: 'sb-test-auth-token.0',
          value: 'refreshed',
          options: { path: '/' },
        },
      ],
      cacheHeaders,
    ),
  ).not.toThrow()
  expect(cookies.getAll()).toBe(existing)
})

test('browser auth uses only the anonymous API key', () => {
  createBrowserClient()
  expect(browserClient).toHaveBeenCalledWith(
    'http://127.0.0.1:54321',
    'local-dummy-anon',
    expect.objectContaining({ global: { fetch: expect.any(Function) } }),
  )
  expect(sdkClient).not.toHaveBeenCalled()
})

test('anonymous and service clients remain cookie-free with session persistence disabled', () => {
  createServerAnonClient()
  createServerServiceRoleClient()
  const calls = (sdkClient as jest.Mock).mock.calls
  expect(calls.map(([, key]) => key)).toEqual([
    'local-dummy-anon',
    'local-dummy-service',
  ])
  for (const [, , options] of calls) {
    expect(options.cookies).toBeUndefined()
    expect(options.auth).toEqual({
      autoRefreshToken: false,
      persistSession: false,
    })
    expect(options.global.fetch).toEqual(expect.any(Function))
  }
  expect(ssrClient).not.toHaveBeenCalled()
})
