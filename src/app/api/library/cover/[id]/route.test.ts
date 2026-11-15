/** @jest-environment node */
import { NextRequest } from 'next/server'

const fetchAnalyticsGatewayJson = jest.fn()
jest.mock('@/lib/clickhouseGateway', () => ({
  ...jest.requireActual('@/lib/clickhouseGateway'),
  fetchAnalyticsGatewayJson: (...args: unknown[]) =>
    fetchAnalyticsGatewayJson(...args),
}))
// unstable_cache needs Next's incremental cache; call through in tests.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
}))

import { GET } from './route'
import { coverUpstreamAllowed, libraryCoverSrc } from '@/lib/libraryCover'

const request = (id: string) =>
  new NextRequest(`http://localhost/api/library/cover/${id}`)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

describe('library cover route', () => {
  const realFetch = global.fetch
  beforeEach(() => {
    fetchAnalyticsGatewayJson.mockReset()
    fetchAnalyticsGatewayJson.mockResolvedValue({
      works: [
        { id: 'aaaaaaaaaa', im: 'https://example.org/cover.jpg' },
        { id: 'bbbbbbbbbb' },
        { id: 'cccccccccc', im: 'https://127.0.0.1/x.jpg' },
      ],
    })
  })
  afterEach(() => {
    global.fetch = realFetch
  })

  it('serves a recorded cover with a long shared cache', async () => {
    const upstream = jest.fn().mockResolvedValue(
      new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } }),
    )
    global.fetch = upstream
    const response = await GET(request('aaaaaaaaaa'), params('aaaaaaaaaa'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=2592000')
    expect(upstream.mock.calls[0][0]).toBe('https://example.org/cover.jpg')
  })

  it('fetches nothing for unknown ids, works without a cover or unsafe URLs', async () => {
    const upstream = jest.fn()
    global.fetch = upstream
    for (const id of ['bbbbbbbbbb', 'dddddddddd', 'cccccccccc', 'not-an-id']) {
      const response = await GET(request(id), params(id))
      expect(response.status).toBe(404)
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('refuses an upstream answer that is not a raster image', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    )
    const response = await GET(request('aaaaaaaaaa'), params('aaaaaaaaaa'))
    expect(response.status).toBe(404)
  })

  it('versions the cover URL by its source', () => {
    expect(libraryCoverSrc('aaaaaaaaaa', 'https://a/1.jpg')).not.toBe(
      libraryCoverSrc('aaaaaaaaaa', 'https://a/2.jpg'),
    )
    expect(coverUpstreamAllowed('https://upload.wikimedia.org/x.jpg')).toBe(true)
    expect(coverUpstreamAllowed('http://example.org/x.jpg')).toBe(false)
    expect(coverUpstreamAllowed('https://localhost/x.jpg')).toBe(false)
    expect(coverUpstreamAllowed('https://example.org:8443/x.jpg')).toBe(false)
  })
})
