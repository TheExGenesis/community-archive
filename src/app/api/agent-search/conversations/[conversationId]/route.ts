import { NextResponse } from 'next/server'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { conversationMessages } from '@/lib/agentSearch/history'
import { loadConversationTweets } from '@/lib/agentSearch/historyTweets'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'

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
  const runs = /^[A-Za-z0-9_-]{8,100}$/.test(id)
    ? await getAgentSearchRunStore().listConversation(id)
    : []
  if (
    runs.length === 0 ||
    runs.some((run) => run.accountId !== access.viewer.accountId)
  ) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: noStore },
    )
  }
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
