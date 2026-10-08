import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

jest.mock('@/utils/supabase', () => ({ createMiddlewareClient: jest.fn() }))

const googlebot =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const inspectionTool = 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)'
const browser =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

const request = (
  pathname: string,
  userAgent: string,
  ip: string,
  headers: Record<string, string> = {},
) =>
  middleware(
    new NextRequest(`https://www.community-archive.org${pathname}`, {
      headers: { 'user-agent': userAgent, 'x-forwarded-for': ip, ...headers },
    }),
  )

describe('search crawler middleware handling', () => {
  it.each([
    ['Googlebot', googlebot, '203.0.113.110'],
    ['the Search Console inspection tool', inspectionTool, '203.0.113.111'],
  ])('serves %s the page instead of the JS challenge', async (_, ua, ip) => {
    const response = await request('/user/alice', ua, ip)

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('gives crawlers a larger but bounded page budget', async () => {
    const ip = '203.0.113.112'
    for (let index = 0; index < 120; index += 1) {
      expect(
        (await request(`/user/member_${index}`, googlebot, ip)).status,
      ).toBe(200)
    }
    expect((await request('/user/one_more', googlebot, ip)).status).toBe(429)
  })

  it('keeps the default page budget for browsers', async () => {
    const ip = '203.0.113.113'
    const statuses = []
    for (let index = 0; index < 31; index += 1) {
      statuses.push(
        (
          await request('/about', browser, ip, {
            accept: 'text/html',
            'accept-language': 'en-US,en;q=0.9',
            'accept-encoding': 'gzip, br',
          })
        ).status,
      )
    }
    expect(statuses.filter((status) => status === 429)).toHaveLength(1)
  })

  it.each(['/robots.txt', '/sitemap.xml'])(
    'lets non-browser crawlers read %s',
    async (pathname) => {
      const response = await request(pathname, 'curl/8.7.1', '203.0.113.114')

      expect(response.status).toBe(200)
    },
  )

  it.each(['/profile', '/login', '/settings', '/admin/digest'])(
    'marks %s noindex',
    async (pathname) => {
      const response = await request(pathname, googlebot, '203.0.113.115')

      expect(response.headers.get('x-robots-tag')).toBe('noindex')
    },
  )

  it('leaves public pages indexable', async () => {
    const response = await request('/user/alice', googlebot, '203.0.113.116')

    expect(response.headers.get('x-robots-tag')).toBeNull()
  })
})
