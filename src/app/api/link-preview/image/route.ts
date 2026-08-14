import { NextRequest } from 'next/server'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { fetchSafeRemoteResource } from '@/lib/linkPreviews'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get('hash') ?? ''
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return new Response('Invalid preview image', { status: 400 })
  }
  const supabase = createServerServiceRoleClient()
  const { data, error } = await supabase
    .from('tweet_link_previews')
    .select('image_url, status')
    .eq('url_hash', hash)
    .maybeSingle()
  if (error || data?.status !== 'ready' || !data.image_url) {
    return new Response('Preview image not found', { status: 404 })
  }

  try {
    const image = await fetchSafeRemoteResource(data.image_url, {
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
      maximumBytes: 2 * 1024 * 1024,
      allowedContentTypes: (contentType) =>
        [
          'image/avif',
          'image/webp',
          'image/png',
          'image/jpeg',
          'image/gif',
        ].includes(contentType),
    })
    return new Response(image.bytes, {
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Preview image proxy failed:', error)
    return new Response('Preview image unavailable', { status: 502 })
  }
}
