import 'server-only'

/**
 * Server-side exception capture into PostHog error tracking.
 *
 * Browser exceptions are already captured by posthog-js (`capture_exceptions`
 * in `src/lib/posthog.ts`). This module gives API routes, server components
 * and the Next.js `onRequestError` hook the same fingerprinted, grouped
 * destination, so an agent can read one inbox for both halves of the app.
 *
 * Privacy contract: no request bodies, headers, cookies, query strings, IPs
 * or user identifiers are ever attached. The only user-related field is a
 * coarse `user_state` (guest / signed_in / unknown). Events are sent with
 * person profiles disabled and GeoIP disabled.
 */

import type { PostHog } from 'posthog-node'

export type UserState = 'guest' | 'signed_in' | 'unknown'

export type ServerErrorContext = {
  /** Route pattern or request path with the query string removed. */
  route: string
  method?: string
  status?: number
  /** Which dependency failed, when known: supabase, gateway, clickhouse, twitter, modal, email, none. */
  upstream?: string
  requestId?: string
  userState?: UserState
  /** Free-form, non-identifying extras (router kind, revalidate reason, ...). */
  extra?: Record<string, string | number | boolean | null | undefined>
}

let client: PostHog | null | undefined

function projectToken() {
  return process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
}

function posthogHost() {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
}

export function serverErrorCaptureEnabled() {
  return (
    Boolean(projectToken()) &&
    process.env.SERVER_ERROR_CAPTURE !== 'off' &&
    process.env.NODE_ENV !== 'test'
  )
}

async function getClient(): Promise<PostHog | null> {
  if (client !== undefined) return client
  if (!serverErrorCaptureEnabled()) {
    client = null
    return client
  }
  const { PostHog: PostHogClient } = await import('posthog-node')
  client = new PostHogClient(projectToken() as string, {
    host: posthogHost(),
    // Serverless: send immediately and await the flush; nothing lives long
    // enough for a background interval to fire.
    flushAt: 1,
    flushInterval: 0,
    disableGeoip: true,
  })
  return client
}

/** Stable, non-personal distinct id so server events group together. */
export function serverDistinctId() {
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'local'
  return `server:${env}`
}

export function deploymentProperties() {
  return {
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'local',
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
    git_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    region: process.env.VERCEL_REGION || null,
  }
}

export function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }
  if (typeof error === 'string') return { name: 'Error', message: error }
  return { name: 'UnknownError', message: 'non-error thrown' }
}

/**
 * Capture one server exception. Never throws; a failure to report must not
 * change the response the user gets.
 */
export async function captureServerException(
  error: unknown,
  context: ServerErrorContext,
): Promise<boolean> {
  try {
    const ph = await getClient()
    if (!ph) return false
    const err =
      error instanceof Error ? error : new Error(errorSummary(error).message)
    ph.captureException(err, serverDistinctId(), {
      route: context.route,
      method: context.method ?? null,
      status: context.status ?? null,
      upstream: context.upstream ?? 'unknown',
      request_id: context.requestId ?? null,
      user_state: context.userState ?? 'unknown',
      side: 'server',
      ...deploymentProperties(),
      ...(context.extra ?? {}),
      $process_person_profile: false,
    })
    await ph.flush()
    return true
  } catch (captureError) {
    console.error(
      JSON.stringify({
        level: 'warn',
        kind: 'error_capture_failed',
        message: errorSummary(captureError).message,
      }),
    )
    return false
  }
}

/** Test seam. */
export function __resetServerErrorCaptureForTests() {
  client = undefined
}
