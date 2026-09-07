import { NextRequest, NextResponse } from 'next/server'
import {
  loadAccessibleBirdseye,
  PRIVATE_HEADERS,
} from '@/lib/community-apps/birdseye-access'
import { getStrandTweets } from '@/lib/community-apps/strand-tweets'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const offset = Number(params.get('offset') ?? '0')
  if (!Number.isSafeInteger(offset) || offset < 0)
    return NextResponse.json(
      { error: 'Invalid offset' },
      { status: 400, headers: PRIVATE_HEADERS },
    )
  const access = await loadAccessibleBirdseye(
    params.get('username') ?? undefined,
  )
  const cluster = access?.analysis.clusters.find(
    (c) => c.id === params.get('cluster_id'),
  )
  if (!cluster)
    return NextResponse.json(
      { error: 'Birdseye unavailable' },
      { status: 404, headers: PRIVATE_HEADERS },
    )
  const ids = Array.from(new Set(cluster.tweetIds))
  const page = ids.slice(offset, offset + 6)
  const tweets = await getStrandTweets(page)
  return NextResponse.json(
    {
      tweets: page.flatMap((id) => (tweets.has(id) ? [tweets.get(id)!] : [])),
      nextOffset: offset + 6 < ids.length ? offset + 6 : null,
    },
    { headers: PRIVATE_HEADERS },
  )
}
