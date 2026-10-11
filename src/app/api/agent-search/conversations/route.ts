import { NextResponse } from 'next/server'
import { agentSearchBudgetLimits } from '@/lib/agentSearch/budget'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { summarizeConversations } from '@/lib/agentSearch/history'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }
const RECENT_RUNS = 200
const MAX_CONVERSATIONS = 30
const DAY_MS = 86_400_000

function utcMidnight(now: Date) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

// The viewer's own past conversations, newest first, and how many questions
// they have left today. The count mirrors the start route's daily cap: every
// run started since UTC midnight counts, stopped ones included.
export async function GET() {
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'signed_out' ? 401 : 403, headers: noStore },
    )
  }
  const store = getAgentSearchRunStore()
  const now = new Date()
  const midnight = utcMidnight(now)
  const { dailyLimit } = agentSearchBudgetLimits()
  const [runs, usedToday] = await Promise.all([
    store.listRecent(access.viewer.accountId, RECENT_RUNS),
    store.countSince(access.viewer.accountId, new Date(midnight).toISOString()),
  ])
  return NextResponse.json(
    {
      conversations: summarizeConversations(runs).slice(0, MAX_CONVERSATIONS),
      dailyLimit,
      remainingToday: Math.max(0, dailyLimit - usedToday),
      resetsAt: new Date(midnight + DAY_MS).toISOString(),
    },
    { headers: noStore },
  )
}
