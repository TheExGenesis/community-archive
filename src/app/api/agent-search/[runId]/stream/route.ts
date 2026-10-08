import { createModelCallToUIChunkTransform } from '@ai-sdk/workflow'
import { createUIMessageStreamResponse } from 'ai'
import { NextResponse } from 'next/server'
import { getRun } from 'workflow/api'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

// Reconnects a refreshed page to a running answer. Only the asker may read it.
export async function GET(
  request: Request,
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
  const stored = /^[A-Za-z0-9_-]{1,100}$/.test(runId)
    ? await getAgentSearchRunStore().get(runId)
    : null
  if (!stored || stored.accountId !== access.viewer.accountId) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: noStore },
    )
  }
  const startIndex = Number(
    new URL(request.url).searchParams.get('startIndex') ?? '0',
  )
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
    return NextResponse.json(
      { error: 'startIndex must be a non-negative integer' },
      { status: 400, headers: noStore },
    )
  }
  const run = getRun(runId)
  const readable = run
    .getReadable({ startIndex: 0 })
    .pipeThrough(
      createModelCallToUIChunkTransform({ uiStartIndex: startIndex }),
    )
  return createUIMessageStreamResponse({
    stream: readable,
    headers: { ...noStore, 'x-workflow-run-id': runId },
  })
}
