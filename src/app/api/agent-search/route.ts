import { createModelCallToUIChunkTransform } from '@ai-sdk/workflow'
import { createUIMessageStreamResponse, type UIMessage } from 'ai'
import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { checkAgentSearchBudget } from '@/lib/agentSearch/budget'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { agentSearchModelSpec } from '@/lib/agentSearch/model'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { agentSearchWorkflow } from '@/workflows/agentSearch'

// Runs stream for up to a few minutes; the repo default is 15 s (vercel.json).
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const MAX_QUESTION_CHARS = 1000
const MAX_MESSAGES = 20

const noStore = { 'Cache-Control': 'private, no-store' }

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  return (last?.parts ?? [])
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim()
}

export async function POST(request: Request) {
  const access = await getAgentSearchViewer()
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'signed_out' ? 401 : 403, headers: noStore },
    )
  }

  const body = (await request.json().catch(() => null)) as {
    messages?: UIMessage[]
  } | null
  const messages = Array.isArray(body?.messages) ? body!.messages! : null
  const question = messages ? lastUserText(messages) : ''
  if (
    !messages ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    !question ||
    question.length > MAX_QUESTION_CHARS
  ) {
    return NextResponse.json(
      { error: 'invalid_request' },
      { status: 400, headers: noStore },
    )
  }

  const store = getAgentSearchRunStore()
  const budget = await checkAgentSearchBudget(store, access.viewer.accountId)
  if (!budget.ok) {
    return NextResponse.json(
      { error: budget.reason },
      { status: 429, headers: noStore },
    )
  }

  const modelSpec = agentSearchModelSpec()
  let run: Awaited<ReturnType<typeof start>>
  try {
    run = await start(agentSearchWorkflow, [
      {
        accountId: access.viewer.accountId,
        question,
        messages,
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
