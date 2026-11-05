import { NextResponse } from 'next/server'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { conversationMessages } from '@/lib/agentSearch/history'
import { conversationTweetIds } from '@/lib/agentSearch/historyTweets'
import { ownConversationRuns } from '@/lib/agentSearch/ownConversation'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { isLiveRun } from '@/lib/agentSearch/budget'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

// Rebuilds one of the viewer's conversations from stored runs, without
// waiting on the gateway: tweets stay as references in the messages, and the
// page fetches them through the tweets route in the order given (cited
// first), through the gateway, so opted-out posts drop out.
export async function GET(
  _request: Request,
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
  const id = params.conversationId
  const runs = await ownConversationRuns(id, access.viewer.accountId)
  if (!runs) return notFound()
  const ids = conversationTweetIds(runs)
  const running = runs.find((run) => run.status === 'running') ?? null
  return NextResponse.json(
    {
      id,
      messages: conversationMessages(runs),
      runningRunId: running?.id ?? null,
      // Kept for the page's loader, which merges whatever arrives here.
      tweets: [],
      pendingTweetIds: [...ids.cited, ...ids.listed, ...ids.rest],
      unavailableTweetIds: [],
    },
    { headers: noStore },
  )
}

// Deletes one of the viewer's conversations: its questions, answers and what
// the searches returned. Each run's accounting stays, so the daily count is
// unchanged (runStore.ts). Refused while its answer is being written.
export async function DELETE(
  _request: Request,
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
