import { createModelCallToUIChunkTransform } from '@ai-sdk/workflow'
import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai'
import { NextResponse } from 'next/server'
import { getRun } from 'workflow/api'
import { RunExpiredError } from 'workflow/errors'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { workflowRunIdOf } from '@/lib/agentSearch/runs'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'
import { endWithFinish, finishedStream } from '@/lib/agentSearch/stream'

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
  const headers = { ...noStore, 'x-workflow-run-id': runId }
  const workflowRunId = workflowRunIdOf(stored)
  if (!workflowRunId) {
    // Closed before its workflow started: nothing to replay, and the page
    // must stop waiting. Still starting: the page may try again shortly.
    if (stored.status !== 'running') {
      return createUIMessageStreamResponse({
        stream: finishedStream(),
        headers,
      })
    }
    return NextResponse.json(
      { error: 'not_started' },
      { status: 409, headers: noStore },
    )
  }
  // The stream always ends with a finish chunk, even for a run that was
  // cancelled elsewhere or whose stream has expired, so the page's
  // reconnect loop ends.
  let readable: ReadableStream<UIMessageChunk>
  try {
    readable = endWithFinish(
      getRun(workflowRunId)
        .getReadable({ startIndex: 0 })
        .pipeThrough(
          createModelCallToUIChunkTransform({ uiStartIndex: startIndex }),
        ),
    )
  } catch (error) {
    if (!RunExpiredError.is(error)) throw error
    readable = finishedStream()
  }
  return createUIMessageStreamResponse({ stream: readable, headers })
}
