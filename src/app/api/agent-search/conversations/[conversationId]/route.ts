import { NextResponse } from 'next/server'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { conversationMessages } from '@/lib/agentSearch/history'
import { loadConversationTweets } from '@/lib/agentSearch/historyTweets'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { isLiveRun } from '@/lib/agentSearch/budget'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

// Rebuilds one of the viewer's conversations from stored runs. Tweets are
// fetched again through the gateway, so opted-out posts drop out.
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
  const runs = await ownRuns(id, access.viewer.accountId)
  if (!runs) return notFound()
  const tweets = await loadConversationTweets(runs)
  const running = runs.find((run) => run.status === 'running') ?? null
  return NextResponse.json(
    {
      id,
      messages: conversationMessages(runs, tweets),
      runningRunId: running?.id ?? null,
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
  const runs = await ownRuns(params.conversationId, access.viewer.accountId)
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

/**
 * The conversation's runs when it exists and is entirely the viewer's;
 * null otherwise, so another member's id looks the same as a missing one.
 */
async function ownRuns(id: string, accountId: string) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) return null
  const runs = await getAgentSearchRunStore().listConversation(id)
  if (runs.length === 0 || runs.some((run) => run.accountId !== accountId)) {
    return null
  }
  return runs
}

const notFound = () =>
  NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })
