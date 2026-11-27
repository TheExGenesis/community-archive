import { NextResponse } from 'next/server'
import { getRun } from 'workflow/api'
import { RunExpiredError, WorkflowRunNotFoundError } from 'workflow/errors'
import { isLiveRun } from '@/lib/agentSearch/budget'
import { getAgentSearchAccess } from '@/lib/agentSearch/eligibility'
import { workflowRunIdOf } from '@/lib/agentSearch/runs'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { isTerminalStatus } from '@/lib/agentSearch/stream'
import { clearRunTweetCache } from '@/lib/agentSearch/workspace/runCache'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'arn1'

const noStore = { 'Cache-Control': 'private, no-store' }

const isGoneError = (error: unknown) =>
  RunExpiredError.is(error) || WorkflowRunNotFoundError.is(error)

// Stops a running answer. Only the asker may stop it. The workflow's last step
// never runs after a cancel, so the run record is closed here. Its tokens and
// cost stay as recorded: each model call and paid tool adds its own spend,
// and steps still in flight add theirs when they finish.
export async function POST(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ runId: string }> },
) {
  const params = await paramsPromise
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
  // a run that is no longer marked running. A failed cancel on a live run
  // leaves the run running so the page can try again, unless the workflow is
  // already gone, terminal, or past the stale window (e.g. a dev recompile).
  const workflowRunId = workflowRunIdOf(stored)
  if (workflowRunId) {
    const run = getRun(workflowRunId)
    try {
      await run.cancel({
        cancelReason: 'Stopped by the member',
      })
    } catch (error) {
      let alreadyEnded = isGoneError(error) || !isLiveRun(stored)
      if (!alreadyEnded) {
        try {
          alreadyEnded = isTerminalStatus(await run.status)
        } catch (statusError) {
          alreadyEnded = isGoneError(statusError)
        }
      }
      if (!alreadyEnded) {
        console.error('[agent-search] cancel failed', error)
        return NextResponse.json(
          { error: 'unavailable' },
          { status: 503, headers: noStore },
        )
      }
    }
  }
  // If the workflow recorded its final answer while Stop was in flight, keep it.
  const latest = await store.get(runId)
  if (latest && latest.status !== 'running') {
    clearRunTweetCache(runId)
    return NextResponse.json({ status: latest.status }, { headers: noStore })
  }
  await store.update(runId, {
    status: 'failed',
    error: 'Stopped by the member',
    completedAt: new Date().toISOString(),
  })
  clearRunTweetCache(runId)
  return NextResponse.json({ status: 'failed' }, { headers: noStore })
}
