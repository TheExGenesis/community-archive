import { NextRequest, NextResponse } from 'next/server'
import { middleware } from '@/middleware'
import { createMiddlewareClient } from '@/utils/supabase'

jest.mock('@/utils/supabase', () => ({ createMiddlewareClient: jest.fn() }))
const getUser = jest.fn()
let clientResponse: NextResponse
let requestId = 0
const challenge = () => Math.floor(Date.now() / 3_600_000).toString(36)

function request(
  path: string,
  options: { cookie?: string; headers?: Record<string, string> } = {},
) {
  return middleware(
    new NextRequest(`https://archive.test${path}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        accept: 'text/html',
        'accept-language': 'en-US',
        'accept-encoding': 'gzip',
        'x-forwarded-for': `access-test-${++requestId}`,
        cookie: `__cc=${challenge()}; ${options.cookie ?? ''}`,
        ...options.headers,
      },
    }),
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  clientResponse = NextResponse.next()
  getUser.mockResolvedValue({ data: { user: null }, error: null })
  ;(createMiddlewareClient as jest.Mock).mockImplementation(() => ({
    supabase: { auth: { getUser } },
    get response() {
      return clientResponse
    },
  }))
})

test.each(['/profile', '/user/alice/opengraph-image'])(
  'sends guests at %s to login with their destination',
  async (path) => {
    const response = await request(path)
    expect(response.status).toBe(307)
    const destination = new URL(response.headers.get('location')!)
    expect(destination.pathname).toBe('/login')
    expect(destination.searchParams.get('redirect')).toBe(path)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(createMiddlewareClient).not.toHaveBeenCalled()
  },
)

test.each(['/search', '/search?q=open+source&fromUser=alice'])(
  'allows a private guest preview at %s',
  async (path) => {
    const response = await request(path)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(createMiddlewareClient).not.toHaveBeenCalled()
  },
)

test.each([
  ['/user/alice?chapter=2025', '/guest/user/alice?chapter=2025'],
  ['/user/42', '/guest/user/42'],
  ['/user/alice/', '/guest/user/alice'],
  ['/user-dir', '/guest/user-dir'],
  ['/user-dir/', '/guest/user-dir'],
])(
  'serves the cacheable guest preview for %s from %s',
  async (path, guestPath) => {
    const response = await request(path)
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      `https://archive.test${guestPath}`,
    )
    expect(response.headers.get('cache-control')).toBeNull()
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(createMiddlewareClient).not.toHaveBeenCalled()
  },
)

test('preserves cleared session chunks and SDK cache headers on a guest rewrite', async () => {
  const cacheHeaders = {
    'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
    Expires: '0',
    Pragma: 'no-cache',
  }
  getUser.mockImplementation(async () => {
    const incoming = (createMiddlewareClient as jest.Mock).mock
      .calls[0][0] as NextRequest
    for (const chunk of ['sb-test-auth-token.0', 'sb-test-auth-token.1']) {
      incoming.cookies.set(chunk, '')
    }
    clientResponse = NextResponse.next({
      request: { headers: incoming.headers },
    })
    for (const chunk of ['sb-test-auth-token.0', 'sb-test-auth-token.1']) {
      clientResponse.cookies.set(chunk, '', {
        path: '/',
        maxAge: 0,
        sameSite: 'lax',
        secure: true,
      })
    }
    for (const [name, value] of Object.entries(cacheHeaders)) {
      clientResponse.headers.set(name, value)
    }
    return { data: { user: null }, error: new Error('Invalid token') }
  })
  const response = await request('/user/alice?chapter=2025', {
    cookie:
      'sb-test-auth-token.0=expired; sb-test-auth-token.1=stale; preference=kept',
  })
  expect(response.headers.get('x-middleware-rewrite')).toBe(
    'https://archive.test/guest/user/alice?chapter=2025',
  )
  for (const chunk of ['sb-test-auth-token.0', 'sb-test-auth-token.1']) {
    expect(response.cookies.get(chunk)).toMatchObject({
      value: '',
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
      secure: true,
    })
  }
  for (const [name, value] of Object.entries(cacheHeaders)) {
    expect(response.headers.get(name)).toBe(value)
  }
  const forwardedCookies = response.headers.get('x-middleware-request-cookie')
  expect(forwardedCookies).toContain('preference=kept')
  expect(forwardedCookies).toContain('sb-test-auth-token.0=')
  expect(forwardedCookies).toContain('sb-test-auth-token.1=')
  expect(forwardedCookies).not.toContain('expired')
  expect(forwardedCookies).not.toContain('stale')
})

test.each([
  ['/tweets/123', '/guest/tweets/123'],
  ['/tweets/123/', '/guest/tweets/123'],
  ['/tweets/123?from=bangers', '/guest/tweets/123?from=bangers'],
])(
  'serves cookie-less tweet permalinks %s from the cached %s',
  async (path, guestPath) => {
    const response = await request(path)
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      `https://archive.test${guestPath}`,
    )
    expect(response.headers.get('cache-control')).toBeNull()
    expect(createMiddlewareClient).not.toHaveBeenCalled()
  },
)

test.each([
  ['/trends', '/guest/trends'],
  ['/trends?terms=ai&range=2024', '/guest/trends?terms=ai&range=2024'],
])(
  'serves cookie-less trends %s from the cached %s',
  async (path, guestPath) => {
    const response = await request(path)
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      `https://archive.test${guestPath}`,
    )
    expect(response.headers.get('cache-control')).toBeNull()
  },
)

test.each(['sb-test-auth-token=session', 'dev_as_member=1'])(
  'sends trends visitors with %s to the explorer',
  async (cookie) => {
    const response = await request('/trends', { cookie })
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  },
)

test('sends visitors with a session to the consent-checked tweet page', async () => {
  const response = await request('/tweets/123', {
    cookie: 'sb-test-auth-token=session',
  })
  expect(response.headers.get('x-middleware-rewrite')).toBeNull()
  expect(response.headers.get('x-middleware-next')).toBe('1')
})

test.each(['/tweets/123/opengraph-image', '/tweets/abc', '/tweets'])(
  'leaves other tweet paths alone: %s',
  async (path) => {
    expect((await request(path)).headers.get('x-middleware-rewrite')).toBeNull()
  },
)

test('does not rewrite guest previews that are not document reads', async () => {
  const response = await middleware(
    new NextRequest('https://archive.test/user/alice', {
      method: 'HEAD',
      headers: {
        'user-agent': 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        accept: 'text/html',
        'accept-language': 'en-US',
        'accept-encoding': 'gzip',
        'x-forwarded-for': 'access-test-head',
        cookie: `__cc=${challenge()}`,
      },
    }),
  )
  expect(response.headers.get('x-middleware-rewrite')).toBeNull()
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})

test.each([
  '/api/tweet-search?q=hello',
  '/api/search/related?q=hello&type=digest',
  '/api/user-directory',
  '/api/profile/42/bangers',
  '/api/profile/42/media',
  '/api/profile/42/sidebar',
  '/api/profile/42/avatar',
  '/api/profile/42/interactions',
])('rejects direct guest reads at %s', async (path) => {
  const response = await request(path)
  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ error: 'Authentication required' })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('x-middleware-next')).toBeNull()
})

test.each<{ cookie?: string; headers?: Record<string, string> }>([
  { headers: { 'user-agent': 'Twitterbot/1.0' } },
  { headers: { 'user-agent': 'Googlebot/2.1' } },
  { headers: { rsc: '1', accept: '*/*' } },
  { headers: { 'next-router-prefetch': '1', accept: '*/*' } },
  {
    headers: {
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      accept: '*/*',
    },
  },
  { cookie: 'dev_as_member=1' },
])(
  'does not bypass authentication for crawlers, client transitions, or preview state: %j',
  async (options) => {
    expect((await request('/api/profile/42/bangers', options)).status).toBe(401)
  },
)

test('removes the internal RSC marker from the login destination', async () => {
  const response = await request('/profile?tab=keys&_rsc=internal')
  expect(
    new URL(response.headers.get('location')!).searchParams.get('redirect'),
  ).toBe('/profile?tab=keys')
})

test.each([
  'sb-test-auth-token=session',
  'sb-test-auth-token.0=part1; sb-test-auth-token.1=part2',
])('verifies regular and chunked sessions: %s', async (cookie) => {
  getUser.mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null })
  for (const path of [
    '/search?q=hello',
    '/user/alice',
    '/user-dir',
    '/api/tweet-search',
    '/api/profile/42/sidebar',
  ]) {
    const response = await request(path, { cookie })
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  }
  expect(getUser).toHaveBeenCalledTimes(5)
})

test.each(['missing', 'error', 'throws'])(
  'fails closed when a session is %s',
  async (mode) => {
    if (mode === 'error')
      getUser.mockResolvedValue({
        data: { user: { id: 'viewer' } },
        error: new Error('Invalid token'),
      })
    if (mode === 'throws')
      getUser.mockRejectedValue(new Error('Auth unavailable'))
    expect(
      (await request('/profile', { cookie: 'sb-test-auth-token=forged' }))
        .status,
    ).toBe(307)
    expect(
      (
        await request('/api/tweet-search', {
          cookie: 'sb-test-auth-token=forged',
        })
      ).status,
    ).toBe(401)
  },
)

test.each([true, false])(
  'preserves refreshed or cleared session cookies (signed in: %s)',
  async (signedIn) => {
    getUser.mockImplementation(async () => {
      clientResponse = NextResponse.next()
      clientResponse.headers.set('Expires', '0')
      clientResponse.headers.set('Pragma', 'no-cache')
      clientResponse.cookies.set(
        'sb-test-auth-token.0',
        signedIn ? 'refreshed' : '',
        { path: '/' },
      )
      return { data: { user: signedIn ? { id: 'viewer' } : null }, error: null }
    })
    const response = await request('/profile', {
      cookie: 'sb-test-auth-token.0=expired',
    })
    expect(response.status).toBe(signedIn ? 200 : 307)
    expect(response.headers.get('expires')).toBe('0')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.cookies.get('sb-test-auth-token.0')?.value).toBe(
      signedIn ? 'refreshed' : '',
    )
  },
)

test.each([
  '/',
  '/about',
  '/login',
  '/api/auth/callback',
  '/docs',
  '/digest',
  '/searching',
  '/user-directory-other',
  '/api/profile-other',
])('keeps unrelated and login routes accessible: %s', async (path) => {
  expect((await request(path)).headers.get('x-middleware-next')).toBe('1')
  expect(createMiddlewareClient).not.toHaveBeenCalled()
})
