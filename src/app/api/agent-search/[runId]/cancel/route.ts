import { NextResponse } from 'next/server'
import { getRun } from 'workflow/api'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

// Stops a running answer. Only the asker may stop it. The workflow's last step
// never runs after a cancel, so the run record is closed here. Its tokens and
// cost stay as recorded: each model call and paid tool adds its own spend,
// and steps still in flight add theirs when they finish.
export async function POST(
  _request: Request,
  { params }: { params: { runId: string } },
) {
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: 401, headers: noStore },
    )
  }
  const runId = params.runId
  const store = getAgentSearchRunStore()
  const stored = /^[A-Za-z0-9_-]{1,100}$/.test(runId)
    ? await store.get(runId)
    : null
  if (!stored || stored.accountId !== access.viewer.accountId) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: noStore },
    )
  }
  if (stored.status !== 'running') {
    return NextResponse.json({ status: stored.status }, { headers: noStore })
  }
  await getRun(runId).cancel({ cancelReason: 'Stopped by the member' })
  await store.update(runId, {
    status: 'failed',
    error: 'Stopped by the member',
    completedAt: new Date().toISOString(),
  })
  return NextResponse.json({ status: 'failed' }, { headers: noStore })
}
