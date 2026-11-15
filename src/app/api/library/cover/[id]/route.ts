import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import type { LibraryData } from '@/lib/library'
import { COVER_CACHE_CONTROL, coverUpstreamAllowed } from '@/lib/libraryCover'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Cover URLs by work id, from the daily snapshot. Only URLs the worker
 * recorded and checked are fetched, so this route is not an open proxy.
 */
const coverUrls = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const data = await fetchAnalyticsGatewayJson<LibraryData>(['library'])
    return Object.fromEntries(
      data.works.filter((w) => w.im).map((w) => [w.id, w.im as string]),
    )
  },
  ['library-cover-urls'],
  { revalidate: 3600 },
)

const missing = () =>
  new NextResponse(null, {
    status: 404,
    headers: { 'Cache-Control': 'public, s-maxage=3600' },
  })

/**
 * One work's cover, fetched once from where the worker found it. The image
 * optimizer (next/image) and the CDN serve a small copy from then on, so
 * visitors never contact the source site.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!/^[0-9a-f]{10}$/.test(id)) return missing()
  let url: string | undefined
  try {
    url = (await coverUrls())[id]
  } catch {
    return new NextResponse(null, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  if (!url || !coverUpstreamAllowed(url)) return missing()
  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    const type = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !type.startsWith('image/') || type.includes('svg'))
      return missing()
    const length = Number(upstream.headers.get('content-length') ?? 0)
    if (length > MAX_BYTES) return missing()
    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_BYTES) return missing()
    return new NextResponse(body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': COVER_CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return missing()
  }
}
