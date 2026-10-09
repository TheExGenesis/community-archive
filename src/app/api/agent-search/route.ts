import { createModelCallToUIChunkTransform } from '@ai-sdk/workflow'
import { createUIMessageStreamResponse } from 'ai'
import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import {
  agentSearchPricingProblem,
  checkAgentSearchBudget,
} from '@/lib/agentSearch/budget'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { agentSearchModelSpec } from '@/lib/agentSearch/model'
import { parseAgentSearchRequest } from '@/lib/agentSearch/request'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { agentSearchWorkflow } from '@/workflows/agentSearch'

// Runs stream for up to a few minutes; the repo default is 15 s (vercel.json).
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'signed_out' ? 401 : 403, headers: noStore },
    )
  }

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

  const store = getAgentSearchRunStore()
  // A conversation belongs to whoever started it; nobody else may add to it.
  const earlier = await store.listConversation(conversationId)
  if (earlier.some((run) => run.accountId !== access.viewer.accountId)) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: noStore },
    )
  }

  const budget = await checkAgentSearchBudget(store, access.viewer.accountId)
  if (!budget.ok) {
    return NextResponse.json(
      { error: budget.reason },
      { status: 429, headers: noStore },
    )
  }

  const modelSpec = agentSearchModelSpec()
  // Unpriced spend would never reach the daily cap, so refuse to start.
  const pricingProblem = agentSearchPricingProblem(modelSpec)
  if (pricingProblem) {
    console.error('[agent-search] not starting:', pricingProblem)
    return NextResponse.json(
      { error: 'unavailable' },
      { status: 503, headers: noStore },
    )
  }
  let run: Awaited<ReturnType<typeof start>>
  try {
    run = await start(agentSearchWorkflow, [
      {
        accountId: access.viewer.accountId,
        conversationId,
        question,
        modelSpec,
        date: new Date().toISOString().slice(0, 10),
      },
    ])
  } catch (error) {
    console.error('[agent-search] failed to start run', error)
    return NextResponse.json(
      { error: 'unavailable' },
      { status: 503, headers: noStore },
    )
  }

  await store
    .create({
      id: run.runId,
      accountId: access.viewer.accountId,
      conversationId,
      question,
      status: 'running',
      model: modelSpec,
      startedAt: new Date().toISOString(),
      completedAt: null,
      answer: null,
      citedTweetIds: [],
      invalidCitationIds: [],
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      error: null,
    })
    .catch((error) =>
      console.error('[agent-search] failed to store run', error),
    )

  return createUIMessageStreamResponse({
    stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()),
    headers: { ...noStore, 'x-workflow-run-id': run.runId },
  })
}
