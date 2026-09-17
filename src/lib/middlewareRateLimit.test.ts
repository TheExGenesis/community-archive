import { NextRequest } from 'next/server'
import { middleware } from '../../src/middleware'

const browserUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'

const request = (
  pathname: string,
  ip: string,
  method = 'GET',
  country = 'US',
): Promise<Response> =>
  middleware(
    new NextRequest(`https://www.community-archive.org${pathname}`, {
      method,
      headers: {
        'user-agent': browserUserAgent,
        'x-forwarded-for': ip,
        'x-vercel-ip-country': country,
      },
    }),
  )

describe('API middleware rate limits', () => {
  it.each([
    ['US', 20, '203.0.113.20'],
    ['SG', 5, '203.0.113.21'],
  ])(
    'isolates search from background API traffic while retaining the %s quota',
    async (country, quota, ip) => {
      const backgroundPaths = [
        '/api/link-preview/image?hash=example',
        '/api/profile/123/avatar',
        '/api/portal/stream',
        '/api/tweets/456/link-previews',
      ]
      for (let index = 0; index < quota; index += 1) {
        await expect(
          request(
            backgroundPaths[index % backgroundPaths.length],
            ip,
            'GET',
            country,
          ),
        ).resolves.toMatchObject({ status: 200 })
      }
      await expect(
        request('/api/portal/stream', ip, 'GET', country),
      ).resolves.toMatchObject({ status: 429 })

      for (let index = 0; index < quota; index += 1) {
        await expect(
          request(
            `/api/tweet-search?q=website&offset=${index}`,
            ip,
            'GET',
            country,
          ),
        ).resolves.toMatchObject({ status: 200 })
      }
      const response = await request(
        '/api/tweet-search?q=personal',
        ip,
        'GET',
        country,
      )
      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('60')
      await expect(response.json()).resolves.toEqual({
        error: 'Too Many Requests',
      })
    },
  )

  it.each([
    ['US', 20, '203.0.113.30'],
    ['SG', 5, '203.0.113.31'],
  ])(
    'isolates both pagination budgets from previews and each other, retaining the %s quotas',
    async (country, quota, ip) => {
      for (let index = 0; index < quota; index += 1) {
        await expect(
          request(`/api/tweets/${index}/link-previews`, ip, 'GET', country),
        ).resolves.toMatchObject({ status: 200 })
      }
      await expect(
        request('/api/portal/stream', ip, 'GET', country),
      ).resolves.toMatchObject({ status: 429 })

      for (const path of ['/api/user-directory', '/api/strands']) {
        for (let index = 0; index < quota; index += 1) {
          await expect(
            request(`${path}?offset=${index * 24}`, ip, 'GET', country),
          ).resolves.toMatchObject({ status: 200 })
        }
        const limited = await request(`${path}?offset=999`, ip, 'GET', country)
        expect(limited.status).toBe(429)
        expect(limited.headers.get('Retry-After')).toBe('60')
        // A separate visitor still has their own budget.
        await expect(
          request(
            path,
            country === 'US' ? '203.0.113.32' : '203.0.113.33',
            'GET',
            country,
          ),
        ).resolves.toMatchObject({ status: 200 })
      }
      // The exemption is restricted to exact GET endpoints.
      await expect(
        request('/api/strands/123/context', ip, 'GET', country),
      ).resolves.toMatchObject({ status: 429 })
      await expect(
        request('/api/user-directory', ip, 'POST', country),
      ).resolves.toMatchObject({ status: 429 })
    },
  )

  it('does not let search consume the budget for other APIs or other visitors', async () => {
    const ip = '203.0.113.22'
    for (let index = 0; index < 20; index += 1) {
      await request('/api/tweet-search?q=website', ip)
    }
    await expect(
      request('/api/tweet-search?q=website', ip),
    ).resolves.toMatchObject({ status: 429 })
    await expect(request('/api/user-directory', ip)).resolves.toMatchObject({
      status: 200,
    })
    await expect(
      request('/api/tweet-search?q=website', '203.0.113.23'),
    ).resolves.toMatchObject({ status: 200 })
  })

  it('does not let unrelated API traffic block opt-in or OAuth completion', async () => {
    const ip = '203.0.113.10'

    for (let index = 0; index < 20; index += 1) {
      await expect(request('/api/search', ip)).resolves.toMatchObject({
        status: 200,
      })
    }

    await expect(request('/api/search', ip)).resolves.toMatchObject({
      status: 429,
    })
    await expect(request('/api/opt-in', ip, 'POST')).resolves.toMatchObject({
      status: 200,
    })
    await expect(request('/api/auth/callback', ip)).resolves.toMatchObject({
      status: 200,
    })
  })

  it('still rate limits repeated opt-in mutations in their dedicated bucket', async () => {
    const ip = '203.0.113.11'

    for (let index = 0; index < 10; index += 1) {
      await expect(request('/api/opt-in', ip, 'POST')).resolves.toMatchObject({
        status: 200,
      })
    }

    const response = await request('/api/opt-in', ip, 'POST')
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({
      error: 'Too Many Requests',
    })
    expect(response.headers.get('Retry-After')).toBe('60')
  })

  it('rate limits community submissions in their own tighter bucket', async () => {
    const ip = '203.0.113.12'

    for (let index = 0; index < 5; index += 1) {
      await expect(
        request('/api/community/submissions', ip, 'POST'),
      ).resolves.toMatchObject({ status: 200 })
    }

    await expect(
      request('/api/community/submissions', ip, 'POST'),
    ).resolves.toMatchObject({ status: 429 })

    await expect(request('/api/search', ip)).resolves.toMatchObject({
      status: 200,
    })
  })
})
