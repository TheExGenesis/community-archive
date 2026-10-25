import { POST, GET } from '@/app/api/public-data/route'
import { getSubscriptionForAccount } from '@/lib/digest/emailSubscriptions'
import {
  createRoutedSupabaseFetch,
  createBrowserReadFetch,
} from '@/utils/supabaseReadRouting'

const originalEnv = process.env
const originalFetch = global.fetch
const fetchMock = jest.fn()
const secret = 'test-only-read-secret-with-32-characters'
const request = (body: unknown, token = secret) =>
  new Request('https://production.example.com/api/public-data', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  process.env = {
    ...originalEnv,
    VERCEL_ENV: 'production',
    DATA_READ_SOURCE: 'app',
    PUBLIC_READ_SECRET: secret,
    NEXT_PUBLIC_SUPABASE_URL: 'https://production-db.example.com',
    SUPABASE_SERVICE_ROLE: 'prod-service-only',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'prod-anon',
    PUBLIC_READ_ORIGIN: 'https://production.example.com',
  }
  global.fetch = fetchMock.mockImplementation(
    async () =>
      new Response('[]', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-range': '0-1/2',
        },
      }),
  )
})
afterEach(() => {
  process.env = originalEnv
  global.fetch = originalFetch
  jest.clearAllMocks()
})

test('bridge rejects unauthenticated and non-production requests before reading anything', async () => {
  const read = {
    operation: 'read',
    path: '/rest/v1/optin',
    method: 'GET',
    role: 'service_role',
  }
  expect((await POST(request(read, 'wrong'))).status).toBe(404)
  process.env.VERCEL_ENV = 'preview'
  expect((await POST(request(read))).status).toBe(404)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('admin reads use production credentials only on the production server and preserve count headers', async () => {
  const result = await POST(
    request({
      operation: 'read',
      path: '/rest/v1/optin?select=id',
      method: 'HEAD',
      role: 'service_role',
      headers: { prefer: 'count=exact', authorization: 'staging-session' },
    }),
  )
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toBe(
    'https://production-db.example.com/rest/v1/optin?select=id',
  )
  expect(init.method).toBe('HEAD')
  expect(new Headers(init.headers).get('authorization')).toBe(
    'Bearer prod-service-only',
  )
  expect(result.headers.get('content-range')).toBe('0-1/2')
  expect(result.headers.get('cache-control')).toBe('private, no-store')
})

test('bridge refuses writes, auth, original archives, arbitrary targets, and mutating RPCs', async () => {
  for (const read of [
    { path: '/rest/v1/optin', method: 'PATCH' },
    { path: '/auth/v1/admin/users', method: 'GET' },
    { path: '/storage/v1/object/archives/member/archive.json', method: 'GET' },
    { path: 'https://other.example.com/rest/v1/optin', method: 'GET' },
    { path: '/rest/v1/rpc/publish_digest_edition', method: 'GET' },
  ])
    expect(
      (
        await POST(
          request({ operation: 'read', role: 'service_role', ...read }),
        )
      ).status,
    ).toBe(400)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('one admin client routes reads to production, writes and authentication to staging', async () => {
  process.env.DATA_READ_SOURCE = 'production'
  process.env.PUBLIC_READ_PROTECTION_BYPASS = 'existing-platform-credential'
  const routed = createRoutedSupabaseFetch('service_role')
  await routed('https://stage.example.com/rest/v1/digest_editions?select=id', {
    method: 'GET',
    headers: { Authorization: 'Bearer staging-key' },
  })
  expect(String(fetchMock.mock.calls[0][0])).toBe(
    'https://production.example.com/api/public-data',
  )
  expect(fetchMock.mock.calls[0][1].headers['x-vercel-protection-bypass']).toBe(
    'existing-platform-credential',
  )
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    role: 'service_role',
    method: 'GET',
  })
  expect(
    JSON.parse(fetchMock.mock.calls[0][1].body).headers.authorization,
  ).toBeUndefined()
  for (const method of ['POST', 'PATCH', 'DELETE'])
    await routed('https://stage.example.com/rest/v1/digest_editions', {
      method,
      body: '{}',
    })
  await routed('https://stage.example.com/auth/v1/user', { method: 'GET' })
  expect(fetchMock.mock.calls.slice(1).map((call) => String(call[0]))).toEqual([
    'https://stage.example.com/rest/v1/digest_editions',
    'https://stage.example.com/rest/v1/digest_editions',
    'https://stage.example.com/rest/v1/digest_editions',
    'https://stage.example.com/auth/v1/user',
  ])
  expect(
    fetchMock.mock.calls
      .slice(1)
      .every(
        (call) =>
          !new Headers(call[1]?.headers).has('x-vercel-protection-bypass'),
      ),
  ).toBe(true)
})

test('known read RPCs become GET with PostgREST arrays; publication and view increments stay staging', async () => {
  process.env.DATA_READ_SOURCE = 'production'
  const routed = createRoutedSupabaseFetch('service_role')
  await routed(
    'https://stage.example.com/rest/v1/rpc/admin_list_blocked_scraping_users',
    { method: 'POST', body: JSON.stringify({ p_account_ids: ['1', '2'] }) },
  )
  const read = JSON.parse(fetchMock.mock.calls[0][1].body)
  expect(read.method).toBe('GET')
  expect(
    new URL(read.path, 'https://prod.example.com').searchParams.get(
      'p_account_ids',
    ),
  ).toBe('{1,2}')
  for (const name of [
    'publish_digest_edition',
    'record_digest_view',
    'set_bulletin_dismissal',
  ])
    await routed(`https://stage.example.com/rest/v1/rpc/${name}`, {
      method: 'POST',
      body: '{}',
    })
  expect(
    fetchMock.mock.calls
      .slice(1)
      .every((call) =>
        String(call[0]).startsWith('https://stage.example.com/'),
      ),
  ).toBe(true)
})

test('missing bridge settings fail closed; authorization reads can explicitly stay local', async () => {
  process.env.DATA_READ_SOURCE = 'production'
  delete process.env.PUBLIC_READ_SECRET
  await expect(
    createRoutedSupabaseFetch('service_role')(
      'https://stage.example.com/rest/v1/optin',
    ),
  ).rejects.toThrow('not configured')
  await createRoutedSupabaseFetch('anon', { readSource: 'app' })(
    'https://stage.example.com/rest/v1/optin',
  )
  expect(String(fetchMock.mock.calls[0][0])).toContain('stage.example.com')
})

test('bridge failures log status without disclosing credentials or requested data', async () => {
  process.env.DATA_READ_SOURCE = 'production'
  fetchMock.mockResolvedValue(
    new Response('challenge', {
      status: 429,
      headers: { 'x-vercel-mitigated': 'challenge' },
    }),
  )
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await createRoutedSupabaseFetch('service_role')(
      'https://stage.example.com/rest/v1/optin',
    )
    expect(log).toHaveBeenCalledWith('Production read bridge request failed', {
      status: 429,
      challenged: true,
    })
  } finally {
    log.mockRestore()
  }
})

test('misconfigured mutations cannot write to either the configured or known production database', async () => {
  process.env.DATA_READ_SOURCE = 'production'
  process.env.PORTAL_READ_SUPABASE_URL = 'https://production-db.example.com'
  const routed = createRoutedSupabaseFetch('service_role')
  for (const origin of [
    'https://production-db.example.com',
    'https://fabxmporizzqflnftavs.supabase.co',
  ]) {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      await expect(
        routed(`${origin}/rest/v1/optin`, { method, body: '{}' }),
      ).rejects.toThrow(
        'Staging writes cannot target the production read source',
      )
    }
  }
  expect(fetchMock).not.toHaveBeenCalled()
})

test('a staging account subscription is read from staging even when admin reads use production', async () => {
  process.env.DATA_READ_SOURCE = 'production'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stage.example.com'
  process.env.SUPABASE_SERVICE_ROLE = 'staging-service'
  await expect(getSubscriptionForAccount('123')).resolves.toBeNull()
  expect(String(fetchMock.mock.calls[0][0])).toContain(
    'https://stage.example.com/rest/v1/digest_email_subscriptions?',
  )
  expect(
    new Headers(fetchMock.mock.calls[0][1].headers).get('authorization'),
  ).toBe('Bearer staging-service')
})

test('public browser content uses anonymous production reads, while personal consent and writes stay staging', async () => {
  process.env.NEXT_PUBLIC_DATA_READ_SOURCE = 'production'
  const routed = createBrowserReadFetch()
  await routed(
    'https://stage.example.com/rest/v1/user_directory?select=username',
    { method: 'GET' },
  )
  expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/api\/public-data\?/)
  await routed('https://stage.example.com/rest/v1/optin', { method: 'GET' })
  await routed('https://stage.example.com/rest/v1/tweets', {
    method: 'POST',
    body: '{}',
  })
  expect(
    fetchMock.mock.calls
      .slice(1)
      .every((call) => String(call[0]).startsWith('https://stage.example.com')),
  ).toBe(true)
  process.env.DATA_READ_SOURCE = 'production'
  process.env.PORTAL_READ_SUPABASE_URL = 'https://production-db.example.com'
  process.env.PORTAL_READ_SUPABASE_ANON_KEY = 'prod-anon'
  const before = fetchMock.mock.calls.length
  expect(
    (
      await GET(
        new Request(
          'https://stage.example.com/api/public-data?path=%2Frest%2Fv1%2Fuser_directory',
        ),
      )
    ).status,
  ).toBe(200)
  expect(
    new Headers(fetchMock.mock.calls[before][1].headers).get('authorization'),
  ).toBe('Bearer prod-anon')
  expect(
    (
      await GET(
        new Request(
          'https://stage.example.com/api/public-data?path=%2Frest%2Fv1%2Foptin',
        ),
      )
    ).status,
  ).toBe(400)
})

test('bridge stays disabled without its secret or when configured as a read client', async () => {
  const read = {
    operation: 'read',
    path: '/rest/v1/optin',
    method: 'GET',
    role: 'service_role',
  }
  delete process.env.PUBLIC_READ_SECRET
  expect((await POST(request(read))).status).toBe(404)
  process.env.PUBLIC_READ_SECRET = secret
  process.env.DATA_READ_SOURCE = 'production'
  expect((await POST(request(read))).status).toBe(404)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('bridge forwards audited RPCs as GET and discards caller credentials and write preferences', async () => {
  await POST(
    request({
      operation: 'read',
      path: '/rest/v1/rpc/policy_account_is_blocked?p_account_id=0',
      method: 'GET',
      role: 'anon',
      headers: {
        authorization: 'caller',
        prefer: 'return=representation,count=exact',
        'accept-profile': 'public',
      },
    }),
  )
  const [, init] = fetchMock.mock.calls[0]
  expect(init.method).toBe('GET')
  expect(new Headers(init.headers).get('authorization')).toBe(
    'Bearer prod-anon',
  )
  expect(new Headers(init.headers).get('prefer')).toBe('count=exact')
  expect(init.redirect).toBe('error')
})

test('malformed and oversized bodies never reach the database', async () => {
  for (const [body, status] of [
    ['{', 400],
    ['x'.repeat(64001), 413],
  ] as const) {
    const response = await POST(
      new Request('https://production.example.com/api/public-data', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body,
      }),
    )
    expect(response.status).toBe(status)
  }
  expect(fetchMock).not.toHaveBeenCalled()
})

test('upstream errors fail closed without returning credentials', async () => {
  fetchMock.mockRejectedValue(new Error('private upstream details'))
  const response = await POST(
    request({
      operation: 'read',
      path: '/rest/v1/optin',
      method: 'GET',
      role: 'service_role',
    }),
  )
  expect(response.status).toBe(503)
  expect(await response.text()).toBe(
    '{"message":"Production read unavailable"}',
  )
})
