import { NextRequest } from 'next/server'
import { fetchSafeRemoteResource } from '@/lib/linkPreviews'
import { canCurateShelf } from '@/lib/shelf/access'
import { findShelfRow } from '@/lib/shelf/data'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const IMAGE_TYPES = [
  'image/avif',
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/gif',
]

/**
 * Serve the resolved image of one shelf item. The only URL ever fetched is
 * the image_url get_shelf returned for that account: approved items for
 * anyone, unapproved ones only for the owner (or the loopback preview).
 * There is no URL parameter, so this cannot proxy arbitrary addresses.
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id') ?? ''
  const key = request.nextUrl.searchParams.get('key') ?? ''
  if (!/^\d{1,20}$/.test(accountId) || !/^[0-9a-f]{32}$/.test(key))
    return new Response('Invalid cover', { status: 400 })

  let found: Awaited<ReturnType<typeof findShelfRow>>
  try {
    found = await findShelfRow(accountId, key, () => canCurateShelf(accountId))
  } catch {
    return new Response('Cover unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  const imageUrl = found?.row.image_url
  if (!found || !imageUrl || !/^https:\/\//i.test(imageUrl))
    return new Response('Cover not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })

  try {
    const image = await fetchSafeRemoteResource(imageUrl, {
      accept: IMAGE_TYPES.join(','),
      maximumBytes: 2 * 1024 * 1024,
      allowedContentTypes: (contentType) => IMAGE_TYPES.includes(contentType),
    })
    return new Response(image.bytes, {
      headers: {
        'Content-Type': image.contentType,
        // Approved covers are public and versioned by the `v` parameter.
        // Owner-only covers must not land in a shared cache.
        'Cache-Control': found.isPublic
          ? 'public, max-age=86400, s-maxage=604800, immutable'
          : 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Shelf cover proxy failed:', error)
    return new Response('Cover unavailable', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
