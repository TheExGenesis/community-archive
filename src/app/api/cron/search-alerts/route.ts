import { NextResponse } from 'next/server'
import { isAuthorizedDigestCronRequest } from '@/lib/digest/cron'
import { isClickHouseReadsEnabled } from '@/lib/clickhouseGateway'
import { runSearchAlertChecks } from '@/lib/searchAlerts/matcher'
import {
  listCheckableAlerts,
  pruneSearchAlertMatches,
  recordSearchAlertCheck,
  recordSearchAlertFailure,
} from '@/lib/searchAlerts/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Up to 40 searches, four at a time, each capped at 10 seconds.
export const maxDuration = 300

// Vercel's scheduler calls cron paths with GET; operators can POST to re-run.
export async function GET(request: Request) {
  return handleRun(request)
}

export async function POST(request: Request) {
  return handleRun(request)
}

async function handleRun(request: Request) {
  if (!isAuthorizedDigestCronRequest(request)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  if (!isClickHouseReadsEnabled()) {
    return NextResponse.json(
      { error: 'ClickHouse reads are disabled.' },
      { status: 503 },
    )
  }

  const result = await runSearchAlertChecks({
    listAlerts: () => listCheckableAlerts(),
    record: recordSearchAlertCheck,
    recordFailure: recordSearchAlertFailure,
  })
  await pruneSearchAlertMatches().catch((error) =>
    console.error('Search alert match pruning failed:', error),
  )
  // Partial failures are reported in the body; the failed alerts keep their
  // watermarks and are retried next hour.
  return NextResponse.json(result, {
    status:
      result.searches > 0 && result.failedSearches === result.searches
        ? 502
        : 200,
  })
}
