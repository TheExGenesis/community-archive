import { NextRequest, NextResponse } from 'next/server'
import { getStrands, getAppPolicy } from '@/lib/community-apps/data'
import { getStrandTweets } from '@/lib/community-apps/strand-tweets'
import { selectStrandContext } from '@/lib/community-apps/strand-context'
import { fetchClickHouseTweetThreadPageData } from '@/lib/clickhouseTweetPage'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ seed: string }> },
) {
  const params = await paramsPromise
  const id = request.nextUrl.searchParams.get('tweet_id') ?? ''
  if (!/^\d{1,20}$/.test(id) || !/^\d{1,20}$/.test(params.seed))
    return NextResponse.json(
      { error: 'Invalid post' },
      { status: 400, headers },
    )
  try {
    const { strands } = await getStrands()
    const strand = strands.find((s) => s.id === params.seed)
    if (
      !strand ||
      !(id === strand.id || strand.essentialTweets.some((p) => p.id === id))
    )
      return NextResponse.json(
        { error: 'Strand post unavailable' },
        { status: 404, headers },
      )
    const page = await fetchClickHouseTweetThreadPageData(id)
    const nodes = Object.values(page?.threadTree?.tweets ?? {})
    const policy = await getAppPolicy([])
    const allowed = nodes.filter(
      (n) =>
        !policy.blockedIds.has(n.account_id) &&
        !policy.blocked.has(n.username?.toLowerCase()),
    )
    const selected = selectStrandContext(allowed, id)
    const tweets = await getStrandTweets([
      ...selected.before,
      ...selected.after,
    ])
    return NextResponse.json(
      {
        before: selected.before.flatMap((id) =>
          tweets.has(id) ? [tweets.get(id)!] : [],
        ),
        after: selected.after.flatMap((id) =>
          tweets.has(id) ? [tweets.get(id)!] : [],
        ),
      },
      { headers },
    )
  } catch {
    return NextResponse.json(
      { error: 'Thread context could not load. Please try again.' },
      { status: 503, headers },
    )
  }
}
