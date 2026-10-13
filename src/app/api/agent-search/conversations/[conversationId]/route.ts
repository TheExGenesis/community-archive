import { NextResponse } from 'next/server'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { conversationMessages } from '@/lib/agentSearch/history'
import {
  conversationTweetIds,
  fetchConversationTweets,
} from '@/lib/agentSearch/historyTweets'
import { ownConversationRuns } from '@/lib/agentSearch/ownConversation'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { isLiveRun } from '@/lib/agentSearch/budget'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

// How long the first response waits for the tweets the prose cites. A quick
// gateway fills the chips before the first paint; a slow one leaves them to
// the page, which fetches them through the tweets route as it does the rest.
const FIRST_PAINT_BUDGET_MS = 1_500

// Rebuilds one of the viewer's conversations from stored runs. Tweets stay
// as references in the messages: the page fetches them through the tweets
// route in the order given (cited first), through the gateway, so opted-out
// posts drop out. Only the prose-cited ones are tried here, briefly.
export async function GET(
  _request: Request,
  { params }: { params: { conversationId: string } },
) {
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'signed_out' ? 401 : 403, headers: noStore },
    )
  }
  const id = params.conversationId
  const runs = await ownConversationRuns(id, access.viewer.accountId)
  if (!runs) return notFound()
  const ids = conversationTweetIds(runs)
  const first = await fetchConversationTweets(ids.cited, new Set(ids.cited), {
    deadlineAt: Date.now() + FIRST_PAINT_BUDGET_MS,
  })
  const failed = new Set(first.failed)
  const running = runs.find((run) => run.status === 'running') ?? null
  return NextResponse.json(
    {
      id,
      messages: conversationMessages(runs),
      runningRunId: running?.id ?? null,
      tweets: Array.from(first.tweets.values()),
      // Cited tweets whose batch failed or ran out of time come first again.
      pendingTweetIds: [
        ...ids.cited.filter((tweetId) => failed.has(tweetId)),
        ...ids.listed,
        ...ids.rest,
      ],
      // The gateway answered and had nothing: deleted, or the author opted out.
      unavailableTweetIds: ids.cited.filter(
        (tweetId) => !first.tweets.has(tweetId) && !failed.has(tweetId),
      ),
    },
    { headers: noStore },
  )
}

// Deletes one of the viewer's conversations: its questions, answers and what
// the searches returned. Each run's accounting stays, so the daily count is
// unchanged (runStore.ts). Refused while its answer is being written.
export async function DELETE(
  _request: Request,
  { params }: { params: { conversationId: string } },
) {
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
  if (!runs) return notFound()
  if (runs.some((run) => isLiveRun(run))) {
    return NextResponse.json(
      { error: 'run_in_progress' },
      { status: 409, headers: noStore },
    )
  }
  const deleted = await getAgentSearchRunStore().deleteConversation(
    access.viewer.accountId,
    params.conversationId,
  )
  return NextResponse.json({ deleted }, { headers: noStore })
}

const notFound = () =>
  NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })
