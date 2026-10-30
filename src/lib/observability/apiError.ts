import { NextResponse } from 'next/server'
import {
  captureServerException,
  errorSummary,
  type UserState,
} from './serverErrorCapture'

/**
 * Replayable API error logging.
 *
 * Every handled 5xx in an API route should go through `reportApiError`, so
 * the Vercel log line is one JSON object an agent can filter on
 * (`kind: "api_error"`), carries enough to reconstruct the failure (request
 * id, route, method, status, upstream, user state), and reaches PostHog
 * error tracking under the same fingerprint as unhandled errors.
 *
 * Unhandled throws are covered by `src/instrumentation.ts`; this helper is
 * for the `catch` blocks that already turn an upstream failure into a 502
 * or 503.
 */

export type ApiErrorUpstream =
  | 'supabase'
  | 'gateway'
  | 'clickhouse'
  | 'twitter'
  | 'modal'
  | 'email'
  | 'storage'
  | 'github'
  | 'none'
  | 'unknown'

export type ApiErrorInput = {
  request: Request | { headers: Headers; method?: string; url?: string }
  /** Route pattern, e.g. `/api/tweet-search`. Never the raw URL. */
  route: string
  status: number
  /** Message returned to the caller. Keep it generic; details go to the log. */
  message: string
  upstream?: ApiErrorUpstream
  error?: unknown
  headers?: Record<string, string>
  /** Extra non-identifying fields for the log line. */
  extra?: Record<string, string | number | boolean | null | undefined>
}

const AUTH_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/

/** Coarse session presence from cookies. No identity is read or logged. */
export function userStateFromCookieHeader(cookie: string | null): UserState {
  if (cookie === null) return 'unknown'
  return AUTH_COOKIE.test(cookie) ? 'signed_in' : 'guest'
}

export function userStateFromHeaders(headers: Headers): UserState {
  return userStateFromCookieHeader(headers.get('cookie'))
}

/** Vercel's request id when present, otherwise a fresh UUID. */
export function requestIdFromHeaders(headers: Headers): string {
  return (
    headers.get('x-vercel-id') ||
    headers.get('x-request-id') ||
    globalThis.crypto.randomUUID()
  )
}

export type ApiErrorLogLine = {
  level: 'error'
  kind: 'api_error'
  ts: string
  request_id: string
  route: string
  method: string
  status: number
  upstream: ApiErrorUpstream
  user_state: UserState
  error: { name: string; message: string }
  message: string
} & Record<string, unknown>

export function buildApiErrorLogLine(input: ApiErrorInput): ApiErrorLogLine {
  const headers = input.request.headers
  return {
    level: 'error',
    kind: 'api_error',
    ts: new Date().toISOString(),
    request_id: requestIdFromHeaders(headers),
    route: input.route,
    method: input.request.method ?? 'GET',
    status: input.status,
    upstream: input.upstream ?? 'unknown',
    user_state: userStateFromHeaders(headers),
    error: errorSummary(input.error),
    message: input.message,
    ...(input.extra ?? {}),
  }
}

/**
 * Log a structured error line, report it to PostHog, and build the JSON
 * error response. The response body carries `request_id` so a user or an
 * agent can quote it back.
 */
export async function reportApiError(
  input: ApiErrorInput,
): Promise<NextResponse> {
  const line = buildApiErrorLogLine(input)
  console.error(JSON.stringify(line))

  if (line.status >= 500) {
    await captureServerException(input.error ?? new Error(input.message), {
      route: line.route,
      method: line.method,
      status: line.status,
      upstream: line.upstream,
      requestId: line.request_id,
      userState: line.user_state,
      extra: input.extra,
    })
  }

  return NextResponse.json(
    { error: input.message, request_id: line.request_id },
    {
      status: input.status,
      // A failed analytical read must never be cached (AGENTS.md), so the
      // no-store header wins over anything the route passes in.
      headers: {
        ...(input.headers ?? {}),
        'Cache-Control': 'private, no-store',
      },
    },
  )
}
