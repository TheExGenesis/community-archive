import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

jest.mock('@/utils/supabase', () => ({ createMiddlewareClient: jest.fn() }))

const browserHeaders = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br',
}

function challengeCookie(): string {
  return Math.floor(Date.now() / 3_600_000).toString(36)
}

test.each([
  ['the RSC header', 'https://community-archive.org/bangers', { rsc: '1' }],
  [
    'the RSC query marker',
    'https://community-archive.org/bangers?_rsc=preview',
    {},
  ],
  [
    'the durable Next prefetch header',
    'https://community-archive.org/bangers',
    { 'next-router-prefetch': '1' },
  ],
  [
    'the Next router state header',
    'https://community-archive.org/bangers',
    { 'next-router-state-tree': '["",{}]' },
  ],
  [
    'same-origin browser Fetch Metadata',
    'https://community-archive.org/bangers',
    {
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    },
  ],
])(
  'allows Next.js RSC requests identified by %s',
  async (_, url, rscHeaders) => {
    const request = new NextRequest(url, {
      headers: {
        ...browserHeaders,
        ...rscHeaders,
        accept: '*/*',
        cookie: `__cc=${challengeCookie()}`,
      },
    })

    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    if (
      'next-router-prefetch' in rscHeaders ||
      'sec-fetch-dest' in rscHeaders
    ) {
      expect(response.cookies.get('__rl')).toBeUndefined()
    }
  },
)

test('keeps browser fingerprinting on document page requests', async () => {
  const request = new NextRequest('https://community-archive.org/bangers', {
    headers: {
      ...browserHeaders,
      accept: '*/*',
      cookie: `__cc=${challengeCookie()}`,
    },
  })

  const response = await middleware(request)

  expect(response.status).toBe(403)
  await expect(response.text()).resolves.toBe('Forbidden')
})
