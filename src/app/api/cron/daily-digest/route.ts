import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import {
  isAuthorizedDigestCronRequest,
  isNightlyDigestAutomationEnabled,
  resolveDigestAutomationDate,
} from '@/lib/digest/cron'
import { publishNightlyDigestWorkflow } from '@/workflows/digestGeneration'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

async function queueDigest(request: Request, requestedDate?: unknown) {
  if (!isAuthorizedDigestCronRequest(request)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  if (!isNightlyDigestAutomationEnabled()) {
    return NextResponse.json(
      { error: 'Nightly digest automation is disabled.' },
      { status: 503 },
    )
  }

  let digestDate: string
  try {
    digestDate = resolveDigestAutomationDate(requestedDate)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Invalid digest date.',
      },
      { status: 400 },
    )
  }
  const workflowRun = await start(publishNightlyDigestWorkflow, [digestDate])

  return NextResponse.json(
    { digestDate, status: 'queued', workflowRunId: workflowRun.runId },
    { status: 202 },
  )
}

export async function GET(request: Request) {
  return queueDigest(request)
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Expected a JSON request body.' },
      { status: 400 },
    )
  }

  const requestedDate =
    body && typeof body === 'object' && 'digestDate' in body
      ? body.digestDate
      : null
  return queueDigest(request, requestedDate)
}
