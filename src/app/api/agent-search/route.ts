import { createModelCallToUIChunkTransform } from '@ai-sdk/workflow'
import { createUIMessageStreamResponse } from 'ai'
import { NextResponse } from 'next/server'
import { getRun, start } from 'workflow/api'
import {
  admitAgentSearchRun,
  agentSearchPricingProblem,
} from '@/lib/agentSearch/budget'
import { agentSearchRunDeadlineMs } from '@/lib/agentSearch/deadline'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { agentSearchModelSpec } from '@/lib/agentSearch/model'
import { parseAgentSearchRequest } from '@/lib/agentSearch/request'
import { closeEndedRuns, newSearchRunId } from '@/lib/agentSearch/runs'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { endWithFinish, isTerminalStatus } from '@/lib/agentSearch/stream'
import { agentSearchWorkflow } from '@/workflows/agentSearch'

// Runs stream for up to a few minutes; the repo default is 15 s (vercel.json).
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

const unavailable = () =>
  NextResponse.json(
    { error: 'unavailable' },
    { status: 503, headers: noStore },
  )

const workflowStatus = (workflowRunId: string) =>
  getRun(workflowRunId).status.catch(() => null)

export async function POST(request: Request) {
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'signed_out' ? 401 : 403, headers: noStore },
    )
  }
  const accountId = access.viewer.accountId

  const parsed = parseAgentSearchRequest(
    await request.json().catch(() => null),
  )
  if (!parsed) {
    return NextResponse.json(
      { error: 'invalid_request' },
      { status: 400, headers: noStore },
    )
  }
  const { conversationId, question } = parsed

  const modelSpec = agentSearchModelSpec()
  // Unpriced spend would never reach the daily cap, so refuse to start.
  const pricingProblem = agentSearchPricingProblem(modelSpec)
  if (pricingProblem) {
    console.error('[agent-search] not starting:', pricingProblem)
    return unavailable()
  }

  const store = getAgentSearchRunStore()
  // A run whose workflow already ended no longer holds the member's slot.
  await closeEndedRuns(store, accountId, workflowStatus).catch((error) =>
    console.error('[agent-search] failed to close ended runs', error),
  )

  // Admission checks ownership and every limit and stores the run as
  // running, in one step, before anything is paid for. Fail closed: when
  // the store cannot answer, no run starts.
  const runId = newSearchRunId()
  let admission: Awaited<ReturnType<typeof admitAgentSearchRun>>
  try {
    admission = await admitAgentSearchRun(store, {
      runId,
      accountId,
      conversationId,
      question,
      model: modelSpec,
    })
  } catch (error) {
    console.error('[agent-search] admission failed', error)
    return unavailable()
  }
  if (!admission.ok) {
    // A conversation belongs to whoever started it; nobody else may add to it.
    return NextResponse.json(
      { error: admission.reason },
      {
        status: admission.reason === 'not_found' ? 404 : 429,
        headers: noStore,
      },
    )
  }

  const closeRun = (error: string) =>
    store
      .update(runId, {
        status: 'failed',
        error,
        completedAt: new Date().toISOString(),
      })
      .catch((cause) =>
        console.error('[agent-search] failed to close run', cause),
      )

  let run: Awaited<ReturnType<typeof start>>
  try {
    run = await start(agentSearchWorkflow, [
      {
        runId,
        accountId,
        conversationId,
        question,
        modelSpec,
        date: new Date().toISOString().slice(0, 10),
        deadlineAt: Date.now() + agentSearchRunDeadlineMs(),
      },
    ])
  } catch (error) {
    console.error('[agent-search] failed to start run', error)
    await closeRun('The run could not start')
    return unavailable()
  }

  // Cancel and reconnect need the workflow run; without it on record the
  // run could not be stopped, so stop it now.
  try {
    await store.update(runId, { workflowRunId: run.runId })
  } catch (error) {
    console.error('[agent-search] failed to record workflow run', error)
    await run.cancel({ cancelReason: 'Run record failed' }).catch(() => {})
    await closeRun('The run could not be recorded')
    return unavailable()
  }
  // A Stop from another tab may have closed the run while it started.
  const current = await store.get(runId).catch(() => null)
  if (current && current.status !== 'running') {
    await run.cancel({ cancelReason: 'Stopped by the member' }).catch(() => {})
  }

  // The page addresses the run (stream, cancel) by its search run id. A run
  // stopped (here or from another tab) does not end this stream with a
  // finish chunk; endWithFinish adds one so the page stops waiting.
  return createUIMessageStreamResponse({
    stream: endWithFinish(
      run.readable.pipeThrough(createModelCallToUIChunkTransform()),
      () => run.status.then(isTerminalStatus),
    ),
    headers: { ...noStore, 'x-workflow-run-id': runId },
  })
}
