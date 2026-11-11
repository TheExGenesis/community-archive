import { NextResponse } from 'next/server'
import { readConversationForViewer } from '@/lib/agentSearch/conversationAccess'
import {
  MAX_TWEET_IDS_PER_REQUEST,
  conversationTweetIds,
  fetchConversationTweets,
} from '@/lib/agentSearch/historyTweets'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

const TWEET_ID = /^\d{1,20}$/

// The tweets a stored conversation refers to, fetched again through the
// gateway (which applies opt-outs) for the page to fill in as they arrive.
// Only the asker, or a reader of a shared conversation, may read them, and
// only ids the conversation's stored runs hold: this is not a general tweet
// lookup. A deleted conversation lists no runs, so its ids are gone with it.
export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ conversationId: string }> },
) {
  const params = await paramsPromise
  const read = await readConversationForViewer(params.conversationId)
  if (!read.ok) {
    return NextResponse.json(
      { error: read.error },
      { status: read.status, headers: noStore },
    )
  }
  const { runs } = read
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
