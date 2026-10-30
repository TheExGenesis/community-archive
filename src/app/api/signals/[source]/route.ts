import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/apiError'
import {
  MAX_SIGNALS_PER_REQUEST,
  parseVercelDrainBody,
  signalsFromGeneric,
  signalsFromGrafana,
  signalsFromPostHog,
  signalsFromVercel,
} from '@/lib/signals/adapters'
import { signalRequestAuthorized } from '@/lib/signals/auth'
import {
  signalIssueConfigFromEnv,
  upsertSignalIssues,
} from '@/lib/signals/github'
import { isSignalSource, type Signal } from '@/lib/signals/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY_BYTES = 512 * 1024
const ROUTE = '/api/signals/[source]'
const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * Signal inbox receiver. PostHog, Grafana, the Vercel log drain, the
 * autorefresh health report and scripts POST here; each firing signal
 * becomes (or updates) a GitHub issue labelled `signal`.
 * See docs/hyperobservability.md for wiring and the body contracts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params
  if (!isSignalSource(source)) {
    return NextResponse.json(
      { error: 'Unknown source' },
      { status: 404, headers: NO_STORE },
    )
  }

  const rawBody = await request.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Payload too large' },
      { status: 413, headers: NO_STORE },
    )
  }
  if (
    !signalRequestAuthorized(
      request.headers,
      rawBody,
      process.env.SIGNALS_WEBHOOK_SECRET,
    )
  ) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE },
    )
  }

  let signals: Signal[]
  try {
    signals = signalsFor(source, rawBody)
  } catch {
    return NextResponse.json(
      { error: 'Unreadable payload' },
      { status: 400, headers: NO_STORE },
    )
  }
  signals = signals.slice(0, MAX_SIGNALS_PER_REQUEST)

  const config = signalIssueConfigFromEnv()
  if (!config) {
    // Accept and log so a drain or alert manager does not retry forever;
    // the signal is not lost, it is in the Vercel log under kind=signal.
    console.warn(
      JSON.stringify({
        level: 'warn',
        kind: 'signal_unrouted',
        source,
        count: signals.length,
        signals,
      }),
    )
    return NextResponse.json(
      { accepted: signals.length, routed: false },
      { headers: NO_STORE },
    )
  }

  try {
    const outcomes = await upsertSignalIssues(config, signals)
    console.log(
      JSON.stringify({
        level: 'info',
        kind: 'signal_routed',
        source,
        outcomes,
      }),
    )
    return NextResponse.json(
      { accepted: signals.length, routed: true, outcomes },
      { headers: NO_STORE },
    )
  } catch (error) {
    return reportApiError({
      request,
      route: ROUTE,
      status: 502,
      message: 'Could not file the signal',
      upstream: 'github',
      error,
      extra: { source, count: signals.length },
    })
  }
}

function signalsFor(source: string, rawBody: string): Signal[] {
  if (source === 'vercel')
    return signalsFromVercel(parseVercelDrainBody(rawBody))
  const payload: unknown = rawBody.trim() ? JSON.parse(rawBody) : null
  if (source === 'posthog') return signalsFromPostHog(payload)
  if (source === 'grafana') return signalsFromGrafana(payload)
  if (source === 'autorefresh' || source === 'canary') {
    return signalsFromGeneric(payload, source)
  }
  return signalsFromGeneric(payload, 'generic')
}
