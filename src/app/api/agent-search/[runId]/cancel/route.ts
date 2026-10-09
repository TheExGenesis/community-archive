import { NextResponse } from 'next/server'
import { getRun } from 'workflow/api'
import { getAgentSearchAccess } from '@/lib/agentSearch/eligibility'
import { workflowRunIdOf } from '@/lib/agentSearch/runs'
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
  const access = await getAgentSearchAccess()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'unavailable' ? 503 : 401, headers: noStore },
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
  // Without a workflow run yet, the run is still starting: closing the record
  // is enough, since the start route and the workflow's first step both stop
  // a run that is no longer marked running. A failed cancel leaves the run
  // running, so the page can try again.
  const workflowRunId = workflowRunIdOf(stored)
  if (workflowRunId) {
    try {
      await getRun(workflowRunId).cancel({
        cancelReason: 'Stopped by the member',
      })
    } catch (error) {
      console.error('[agent-search] cancel failed', error)
      return NextResponse.json(
        { error: 'unavailable' },
        { status: 503, headers: noStore },
      )
    }
  }
  await store.update(runId, {
    status: 'failed',
    error: 'Stopped by the member',
    completedAt: new Date().toISOString(),
  })
  return NextResponse.json({ status: 'failed' }, { headers: noStore })
}
