import { NextResponse } from 'next/server'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import {
  MAX_TWEET_IDS_PER_REQUEST,
  conversationTweetIds,
  fetchConversationTweets,
} from '@/lib/agentSearch/historyTweets'
import { ownConversationRuns } from '@/lib/agentSearch/ownConversation'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

const TWEET_ID = /^\d{1,20}$/

// The tweets a stored conversation refers to, fetched again through the
// gateway (which applies opt-outs) for the page to fill in as they arrive.
// Only the asker may read them, and only ids the conversation's stored runs
// hold: this is not a general tweet lookup. A deleted conversation lists no
// runs, so its ids are gone with it.
export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ conversationId: string }> },
) {
  const params = await paramsPromise
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'signed_out' ? 401 : 403, headers: noStore },
    )
  }
  const runs = await ownConversationRuns(
    params.conversationId,
    access.viewer.accountId,
  )
  if (!runs) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: noStore },
    )
  }
  const body = (await request.json().catch(() => null)) as {
    ids?: unknown
  } | null
  const ids = body?.ids
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_TWEET_IDS_PER_REQUEST ||
    !ids.every((id) => typeof id === 'string' && TWEET_ID.test(id))
  ) {
    return NextResponse.json(
      { error: 'bad_request' },
      { status: 400, headers: noStore },
    )
  }
  const known = conversationTweetIds(runs)
  const inScope = new Set([...known.cited, ...known.listed, ...known.rest])
  if (ids.some((id) => !inScope.has(id))) {
    return NextResponse.json(
      { error: 'unknown_ids' },
      { status: 400, headers: noStore },
    )
  }
  const result = await fetchConversationTweets(ids, new Set(known.cited))
  return NextResponse.json(
    { tweets: Array.from(result.tweets.values()), failed: result.failed },
    { headers: noStore },
  )
}
