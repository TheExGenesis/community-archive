import { NextResponse } from 'next/server'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { summarizeConversations } from '@/lib/agentSearch/history'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }
const RECENT_RUNS = 200
const MAX_CONVERSATIONS = 30

// The viewer's own past conversations, newest first.
export async function GET() {
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'signed_out' ? 401 : 403, headers: noStore },
    )
  }
  const runs = await getAgentSearchRunStore().listRecent(
    access.viewer.accountId,
    RECENT_RUNS,
  )
  return NextResponse.json(
    { conversations: summarizeConversations(runs).slice(0, MAX_CONVERSATIONS) },
    { headers: noStore },
  )
}
