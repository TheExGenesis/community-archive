import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import {
  isAuthorizedDigestCronRequest,
  isNightlyDigestAutomationEnabled,
} from '@/lib/digest/cron'
import { getLatestCompletedDigestDate } from '@/lib/digest/dateWindow'
import { publishNightlyDigestWorkflow } from '@/workflows/digestGeneration'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  if (!isAuthorizedDigestCronRequest(request)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  if (!isNightlyDigestAutomationEnabled()) {
    return NextResponse.json(
      { error: 'Nightly digest automation is disabled.' },
      { status: 503 },
    )
  }

  const digestDate = getLatestCompletedDigestDate()
  const workflowRun = await start(publishNightlyDigestWorkflow, [digestDate])

  return NextResponse.json(
    { digestDate, status: 'queued', workflowRunId: workflowRun.runId },
    { status: 202 },
  )
}
