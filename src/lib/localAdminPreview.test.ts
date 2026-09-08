import { cookies, headers } from 'next/headers'
import {
  getLocalAdminPreview,
  localAdminPreviewAllowed,
} from './localAdminPreview'
jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }))
const originalEnv = process.env.NODE_ENV
const originalPreview = process.env.LOCAL_ADMIN_PREVIEW
beforeEach(() => {
  process.env.LOCAL_ADMIN_PREVIEW = 'true'
  jest.mocked(headers).mockReturnValue({ get: () => 'localhost:3031' } as never)
  jest.mocked(cookies).mockReturnValue({ get: () => undefined } as never)
})
afterEach(() => {
  if (originalPreview === undefined) delete process.env.LOCAL_ADMIN_PREVIEW
  else process.env.LOCAL_ADMIN_PREVIEW = originalPreview
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: originalEnv,
    configurable: true,
  })
})
test.each(['localhost:3031', '127.0.0.1:3000', '[::1]:3000'])(
  'local development permits preview for %s only off deployment',
  (host) => {
    expect(localAdminPreviewAllowed(host, 'development', false)).toBe(true)
    expect(localAdminPreviewAllowed(host, 'production', false)).toBe(false)
    expect(localAdminPreviewAllowed(host, 'development', true)).toBe(false)
  },
)
test.each([
  null,
  'community-archive.org',
  'localhost.evil.test',
  '192.168.1.1:3000',
  'localhost@evil.test',
])('does not unlock the preview on %s', (host) => {
  expect(localAdminPreviewAllowed(host, 'development', false)).toBe(false)
})
test('starts in admin preview but honors logout on every subsequent request', async () => {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'development',
    configurable: true,
  })
  expect(await getLocalAdminPreview()).toBe('admin')
  jest
    .mocked(cookies)
    .mockReturnValue({ get: () => ({ value: 'signed-out' }) } as never)
  expect(await getLocalAdminPreview()).toBe('signed-out')
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'production',
    configurable: true,
  })
  expect(await getLocalAdminPreview()).toBeNull()
})

test('requires the loopback-bound launcher opt-in', () => {
  expect(
    localAdminPreviewAllowed('localhost:3031', 'development', false, false),
  ).toBe(false)
})

test('the preview session endpoint rejects cross-origin requests and persists logout', async () => {
  const { NextRequest } = await import('next/server')
  const { POST } = await import('@/app/api/auth/local-preview/route')
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'development',
    configurable: true,
  })
  const request = (origin: string) =>
    new NextRequest('http://localhost:3031/api/auth/local-preview', {
      method: 'POST',
      headers: {
        host: 'localhost:3031',
        origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled: false }),
    })
  expect((await POST(request('https://evil.test'))).status).toBe(403)
  const response = await POST(request('http://localhost:3031'))
  expect(response.status).toBe(200)
  expect(response.cookies.get('ca-local-admin')).toMatchObject({
    value: 'signed-out',
    httpOnly: true,
    sameSite: 'strict',
  })
  expect(response.cookies.get('birdseye-share')?.value).toBe('')
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'production',
    configurable: true,
  })
  expect((await POST(request('http://localhost:3031'))).status).toBe(404)
})
