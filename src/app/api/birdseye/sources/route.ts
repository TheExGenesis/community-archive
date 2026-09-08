import { getBirdseyeSourceIndex } from '@/lib/community-apps/birdseye-source-index'
import { NextRequest, NextResponse } from 'next/server'
import {
  loadAccessibleBirdseye,
  PRIVATE_HEADERS,
} from '@/lib/community-apps/birdseye-access'
import { getSourceTweets } from '@/lib/community-apps/source-tweets'
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
  const excluded = new Set((params.get('exclude') ?? '').split(',').slice(0, 3))
  try {
    const index = (await getBirdseyeSourceIndex(cluster.tweetIds)).filter(
      ({ id }) => !excluded.has(id),
    )
    const page = index.slice(offset, offset + 6)
    const tweets = await getSourceTweets(page.map(({ id }) => id))
    return NextResponse.json(
      {
        tweets: page.flatMap(({ id, threadId }) =>
          tweets.has(id) ? [{ ...tweets.get(id)!, threadId }] : [],
        ),
        nextOffset: offset + 6 < index.length ? offset + 6 : null,
      },
      { headers: PRIVATE_HEADERS },
    )
  } catch {
    return NextResponse.json(
      { error: 'Source posts could not load' },
      { status: 503, headers: PRIVATE_HEADERS },
    )
  }
}
