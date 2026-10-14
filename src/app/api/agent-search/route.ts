import { agentSearchEnabled } from '@/lib/agentSearch/enabled'
import { createModelCallToUIChunkTransform } from '@ai-sdk/workflow'
import { createUIMessageStreamResponse } from 'ai'
import { NextResponse } from 'next/server'
import { getRun, start } from 'workflow/api'
import {
  admitAgentSearchRun,
  agentSearchPricingProblem,
} from '@/lib/agentSearch/budget'
import {
  agentSearchPrepareStepOptions,
  agentSearchPromptVariant,
  agentSearchToolMode,
} from '@/lib/agentSearch/agent'
import { agentSearchRunDeadlineMs } from '@/lib/agentSearch/deadline'
import {
  agentSearchAccessStatus,
  getAgentSearchAccess,
} from '@/lib/agentSearch/eligibility'
import { agentSearchModelSpec } from '@/lib/agentSearch/model'
import {
  checkOpenRouterKey,
  ownKeysEnabled,
} from '@/lib/agentSearch/openRouterKey'
import {
  OWN_KEY_HEADER,
  looksLikeOpenRouterKey,
  ownKeySecret,
  sealOwnKey,
  type OwnKeyError,
} from '@/lib/agentSearch/ownKey'
import { parseAgentSearchRequest } from '@/lib/agentSearch/request'
import { closeEndedRuns, newSearchRunId } from '@/lib/agentSearch/runs'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import {
  closeWhenRunEnds,
  endWithFinish,
  isTerminalStatus,
} from '@/lib/agentSearch/stream'
import { agentSearchWorkflow } from '@/workflows/agentSearch'

// Runs stream for up to a few minutes; the repo default is 15 s (vercel.json).
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

const unavailable = () =>
  NextResponse.json({ error: 'unavailable' }, { status: 503, headers: noStore })

const workflowStatus = (workflowRunId: string) =>
  getRun(workflowRunId).status.catch(() => null)

const OWN_KEY_STATUS: Record<OwnKeyError, number> = {
  own_key_invalid: 400,
  own_key_no_credit: 402,
  own_key_refused: 403,
  own_key_rate_limited: 429,
  own_key_unchecked: 502,
  own_key_unavailable: 503,
}

const ownKeyRefusal = (reason: OwnKeyError) =>
  NextResponse.json(
    { error: reason },
    { status: OWN_KEY_STATUS[reason], headers: noStore },
  )

export async function POST(request: Request) {
  // Paused (AGENT_SEARCH_ENABLED): no new questions; history still works.
  if (!agentSearchEnabled()) {
    return NextResponse.json(
      { error: 'disabled' },
      { status: 503, headers: noStore },
    )
  }
  const access = await getAgentSearchAccess()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: agentSearchAccessStatus(access.reason), headers: noStore },
    )
  }
  const accountId = access.viewer.accountId

  const parsed = parseAgentSearchRequest(await request.json().catch(() => null))
  if (!parsed) {
    return NextResponse.json(
      { error: 'invalid_request' },
      { status: 400, headers: noStore },
    )
  }
  const { conversationId, question } = parsed

  // A member's own OpenRouter key pays for the planner and raises their daily
  // limit. It is checked with OpenRouter before anything starts, so a bad key
  // is refused here rather than failing mid-run, and it is never stored: it
  // enters the workflow only sealed (ownKey.ts). Never echoed or logged.
  const ownKey = request.headers.get(OWN_KEY_HEADER)?.trim() || null
  if (ownKey) {
    if (!ownKeysEnabled()) return ownKeyRefusal('own_key_unavailable')
    if (!looksLikeOpenRouterKey(ownKey)) return ownKeyRefusal('own_key_invalid')
    const check = await checkOpenRouterKey(ownKey)
    if (!check.ok) return ownKeyRefusal(check.reason)
  }
  const keySource = ownKey ? 'own' : 'house'

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
      keySource,
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

  let sealedKey: string | undefined
  if (ownKey) {
    const secret = ownKeySecret()
    try {
      if (!secret) throw new Error('No sealing secret')
      sealedKey = await sealOwnKey(ownKey, runId, secret)
    } catch {
      await closeRun('The key could not be sealed')
      return ownKeyRefusal('own_key_unavailable')
    }
  }

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
        toolMode: agentSearchToolMode(),
        promptVariant: agentSearchPromptVariant(),
        stepOptions: agentSearchPrepareStepOptions(),
        ...(sealedKey ? { sealedKey } : {}),
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
  const runEnded = () => run.status.then(isTerminalStatus)
  return createUIMessageStreamResponse({
    stream: endWithFinish(
      closeWhenRunEnds(run.readable, runEnded).pipeThrough(
        createModelCallToUIChunkTransform(),
      ),
      runEnded,
    ),
    headers: { ...noStore, 'x-workflow-run-id': runId },
  })
}
