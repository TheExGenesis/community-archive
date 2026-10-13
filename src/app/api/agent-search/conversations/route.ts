import { NextResponse } from 'next/server'
import { agentSearchDailyLimits, isLiveRun } from '@/lib/agentSearch/budget'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { summarizeConversations } from '@/lib/agentSearch/history'
import { ownKeysEnabled } from '@/lib/agentSearch/openRouterKey'
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
// they have left today. The counts mirror the start route's daily caps: runs
// started since UTC midnight count, stopped ones included. House questions
// count against the house limit; on their own OpenRouter key a member may
// ask up to ten times as many, all of today's questions counted. The page
// knows whether it holds a key and shows the matching pair.
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
  const limits = agentSearchDailyLimits()
  const since = new Date(midnight).toISOString()
  const [runs, houseToday, allToday] = await Promise.all([
    store.listRecent(access.viewer.accountId, RECENT_RUNS),
    store.countSince(access.viewer.accountId, since, 'house'),
    store.countSince(access.viewer.accountId, since),
  ])
  return NextResponse.json(
    {
      conversations: summarizeConversations(runs).slice(0, MAX_CONVERSATIONS),
      dailyLimit: limits.house,
      remainingToday: Math.max(0, limits.house - houseToday),
      ownKeyEnabled: ownKeysEnabled(),
      ownKeyDailyLimit: limits.own,
      ownKeyRemainingToday: Math.max(0, limits.own - allToday),
      resetsAt: new Date(midnight + DAY_MS).toISOString(),
    },
    { headers: noStore },
  )
}

// Deletes all of the viewer's history: questions, answers and what the
// searches returned. Their accounting stays, so today's questions are still
// counted (runStore.ts). Refused while an answer is being written: the run
// would go on writing to a conversation the member deleted.
export async function DELETE() {
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'signed_out' ? 401 : 403, headers: noStore },
    )
  }
  const store = getAgentSearchRunStore()
  const running = await store.listRunning(access.viewer.accountId)
  if (running.some((run) => isLiveRun(run))) {
    return NextResponse.json(
      { error: 'run_in_progress' },
      { status: 409, headers: noStore },
    )
  }
  const deleted = await store.deleteAllConversations(access.viewer.accountId)
  return NextResponse.json({ deleted }, { headers: noStore })
}
