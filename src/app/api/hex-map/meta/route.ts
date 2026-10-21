import { NextResponse } from 'next/server'
import snapshot from '@/lib/hexMap/snapshot.json'

export const dynamic = 'force-static'

// This versioned, aggregate-only snapshot contains no handles, IDs or posts.
export function GET(request: Request) {
  const etag = `"${snapshot.version}"`
  const headers = {
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    ETag: etag,
  }
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return NextResponse.json(snapshot, { headers })
}
