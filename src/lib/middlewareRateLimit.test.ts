import { NextRequest } from 'next/server'
import { middleware } from '../../src/middleware'

const browserUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'

const request = (
  pathname: string,
  ip: string,
  method = 'GET',
): Promise<Response> =>
  middleware(
    new NextRequest(`https://www.community-archive.org${pathname}`, {
      method,
      headers: {
        'user-agent': browserUserAgent,
        'x-forwarded-for': ip,
      },
    }),
  )

describe('API middleware rate limits', () => {
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
