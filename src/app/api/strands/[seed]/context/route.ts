import { NextRequest, NextResponse } from 'next/server'
import { getStrands, getAppPolicy } from '@/lib/community-apps/data'
import { getStrandTweets } from '@/lib/community-apps/strand-tweets'
import { selectStrandContext } from '@/lib/community-apps/strand-context'
import { fetchClickHouseTweetThreadPageData } from '@/lib/clickhouseTweetPage'
import { isClickHouseReadsEnabled } from '@/lib/clickhouseGateway'
import { createServerServiceRoleClient } from '@/utils/supabase'
import type { ThreadTweet } from '@/lib/threadUtils'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(
  request: NextRequest,
  { params }: { params: { seed: string } },
) {
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
    let nodes: ThreadTweet[]
    if (isClickHouseReadsEnabled()) {
      const page = await fetchClickHouseTweetThreadPageData(id)
      nodes = Object.values(page?.threadTree?.tweets ?? {})
    } else {
      // Existing read-only permalink RPC. Use only archived reply metadata;
      // this context preview does not fetch missing posts from Twitter.
      const { data, error } = await createServerServiceRoleClient().rpc(
        'get_tweet_page_data' as never,
        { p_tweet_id: id } as never,
      )
      if (error) throw new Error('Thread unavailable')
      const result = data as unknown as {
        tweet?: ThreadTweet
        conversation_tweets?: ThreadTweet[]
      }
      nodes = result?.conversation_tweets ?? []
      if (result?.tweet && !nodes.some((n) => n.tweet_id === id))
        nodes = [...nodes, result.tweet]
    }
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
