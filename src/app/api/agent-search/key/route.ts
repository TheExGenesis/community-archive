import { NextResponse } from 'next/server'
import { agentSearchDailyLimits } from '@/lib/agentSearch/budget'
import {
  agentSearchAccessStatus,
  getAgentSearchAccess,
} from '@/lib/agentSearch/eligibility'
import {
  checkOpenRouterKey,
  ownKeysEnabled,
} from '@/lib/agentSearch/openRouterKey'
import {
  OWN_KEY_HEADER,
  looksLikeOpenRouterKey,
} from '@/lib/agentSearch/ownKey'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

// Checks a member's OpenRouter key before the page saves it in the browser.
// The key arrives in a header and is only passed to OpenRouter; nothing is
// stored, logged or echoed back.
export async function POST(request: Request) {
  const access = await getAgentSearchAccess()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: agentSearchAccessStatus(access.reason), headers: noStore },
    )
  }
  if (!ownKeysEnabled()) {
    return NextResponse.json(
      { error: 'own_key_unavailable' },
      { status: 503, headers: noStore },
    )
  }
  const key = request.headers.get(OWN_KEY_HEADER)?.trim() ?? ''
  const check = looksLikeOpenRouterKey(key)
    ? await checkOpenRouterKey(key)
    : ({ ok: false, reason: 'own_key_invalid' } as const)
  if (!check.ok) {
    return NextResponse.json(
      { error: check.reason },
      { status: 400, headers: noStore },
    )
  }
  return NextResponse.json(
    {
      ok: true,
      dailyLimit: agentSearchDailyLimits().own,
      limitRemaining: check.limitRemaining,
    },
    { headers: noStore },
  )
}
