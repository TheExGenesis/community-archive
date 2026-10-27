import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

jest.mock('@/utils/supabase', () => ({ createMiddlewareClient: jest.fn() }))

const publicPaths = [
  '/',
  '/docs',
  '/docs/quickstart',
  '/llms.txt',
  '/robots.txt',
  '/sitemap.xml',
  '/openapi.json',
  '/api/reference',
]
let requestId = 0

function request(
  path: string,
  userAgent?: string,
  method = 'GET',
  ip = `public-information-${++requestId}`,
) {
  return middleware(
    new NextRequest(`https://www.community-archive.org${path}`, {
      method,
      headers: {
        'x-forwarded-for': ip,
        ...(userAgent === undefined ? {} : { 'user-agent': userAgent }),
      },
    }),
  )
}

describe.each([
  ['missing UA', undefined],
  ['curl', 'curl/8.7.1'],
  ['Python', 'python-requests/2.32.3'],
  ['AI agent', 'ChatGPT-User'],
  [
    'browser without a challenge cookie',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36',
  ],
])('public information reads: %s', (_, userAgent) => {
  it.each(publicPaths)(
    'serves GET and HEAD %s without browser headers or JS',
    async (path) => {
      for (const method of ['GET', 'HEAD']) {
        const response = await request(path, userAgent, method)
        expect(response.status).toBe(200)
        expect(response.headers.get('x-middleware-next')).toBe('1')
        expect(response.headers.get('x-content-type-options')).toBe('nosniff')
        expect(response.headers.get('x-robots-tag')).toBeNull()
      }
    },
  )
})

it.each(publicPaths)(
  'does not exempt POST %s from bot checks',
  async (path) => {
    expect((await request(path, 'curl/8.7.1', 'POST')).status).toBe(403)
  },
)

it.each([
  '/docs-private',
  '/api/reference-private',
  '/search',
  '/user/example',
  '/tweets/123',
  '/settings/api-keys',
  '/api/tweet-search',
])('keeps bot checks on %s', async (path) => {
  expect((await request(path, 'curl/8.7.1')).status).toBe(403)
})

it('retains the per-IP page rate limit for public reads without cookies', async () => {
  const ip = 'public-information-rate-limit'
  for (let index = 0; index < 30; index++) {
    expect(
      (await request(index % 2 ? '/' : '/docs', 'curl/8.7.1', 'GET', ip))
        .status,
    ).toBe(200)
  }
  const response = await request('/docs', 'curl/8.7.1', 'GET', ip)
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('60')
})
