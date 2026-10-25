import { POST } from '@/app/api/public-data/route'

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
