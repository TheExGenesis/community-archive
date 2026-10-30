// Server-side error reporting to PostHog. Browser reporting lives in
// `src/lib/posthog.ts`; this module is only imported by server code (route
// handlers, workflow steps, and the Next.js instrumentation hook).
//
// Contract (docs/product-analytics.md, "Error tracking"): the error itself
// (type, message, stack) plus bounded context only. Scopes are an enum, route
// names come from the analytics registry or the route template, and free-text
// context values are rejected. Never pass usernames, emails, query text,
// tweet or archive IDs, or raw URLs.
import type { Instrumentation } from 'next'
import { PostHog } from 'posthog-node'
import { analyticsRoute } from '@/lib/analyticsRoutes'

export const serverErrorScopes = [
  'archive_delete',
  'digest_email',
  'digest_generation',
  'request',
] as const
export type ServerErrorScope = (typeof serverErrorScopes)[number]

type SafeContextValue = string | number | boolean
export type ServerErrorContext = Record<string, SafeContextValue | undefined>

export const SERVER_DISTINCT_ID = 'server'
const REQUEST_IDENTITY_TIMEOUT_MS = 1500
const contextKeyPattern = /^[a-z][a-z0-9_]{0,39}$/
// Enum tokens, status codes, and route templates; never free text.
const contextTokenPattern = /^[A-Za-z0-9_.\-/[\]]{1,160}$/
const routeTemplatePattern = /^(\/[A-Za-z0-9_.\-[\]]+)+$/

let serverClient: PostHog | null | undefined

export function getServerPostHogClient(): PostHog | null {
  if (serverClient !== undefined) return serverClient
  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!projectToken || !host) {
    serverClient = null
    return null
  }
  serverClient = new PostHog(projectToken, {
    host,
    // Vercel functions end right after the response; nothing may stay queued.
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 3000,
    disableGeoip: true,
    enableExceptionAutocapture: false,
  })
  return serverClient
}

// Tests swap the environment between cases; production creates one client.
export function resetServerPostHogClientForTests() {
  serverClient = undefined
}

export function sanitizeServerErrorContext(
  context: ServerErrorContext,
): Record<string, SafeContextValue> {
  const safe: Record<string, SafeContextValue> = {}
  for (const [key, value] of Object.entries(context)) {
    if (!contextKeyPattern.test(key)) continue
    if (typeof value === 'boolean') safe[key] = value
    else if (typeof value === 'number' && Number.isSafeInteger(value))
      safe[key] = value
    else if (typeof value === 'string' && contextTokenPattern.test(value))
      safe[key] = value
  }
  return safe
}

// Supabase and fetch failures are often plain objects; PostHog would record
// them as "Object captured as exception" without the message.
export function toReportableError(error: unknown): Error {
  if (error instanceof Error) return error
  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: unknown
      name?: unknown
      code?: unknown
    }
    if (typeof candidate.message === 'string') {
      const reportable = new Error(candidate.message)
      reportable.name =
        typeof candidate.name === 'string' && candidate.name
          ? candidate.name
          : typeof candidate.code === 'string'
            ? `Error ${candidate.code}`
            : 'NonErrorObject'
      return reportable
    }
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error')
}

export async function reportServerError(
  scope: ServerErrorScope,
  error: unknown,
  context: ServerErrorContext = {},
  distinctId: string = SERVER_DISTINCT_ID,
): Promise<boolean> {
  const client = getServerPostHogClient()
  if (!client) return false
  const properties: Record<string, SafeContextValue> = {
    ...sanitizeServerErrorContext(context),
    scope,
    runtime: 'server',
  }
  // The fixed server id must not become a person profile.
  if (distinctId === SERVER_DISTINCT_ID)
    properties.$process_person_profile = false
  try {
    await client.captureExceptionImmediate(
      toReportableError(error),
      distinctId,
      properties,
    )
    return true
  } catch (reportFailure) {
    console.warn(
      'PostHog server error report failed',
      reportFailure instanceof Error ? reportFailure.message : reportFailure,
    )
    return false
  }
}

type RequestErrorRequest = Parameters<Instrumentation.onRequestError>[1]
type RequestErrorContext = Parameters<Instrumentation.onRequestError>[2]

// Route handler and page modules report their template with a `/route` or
// `/page` suffix. Dynamic segments stay as `[param]`; raw values never appear.
function sanitizeRouteTemplate(routePath: string): string {
  const template = routePath.replace(/\/(route|page|layout|default)$/, '')
  return template.length <= 160 && routeTemplatePattern.test(template)
    ? template
    : '/unknown'
}

export function describeRequestError(
  request: Pick<RequestErrorRequest, 'path' | 'method'>,
  context: RequestErrorContext,
): ServerErrorContext {
  const pathname = request.path.split(/[?#]/)[0]
  const template = sanitizeRouteTemplate(context.routePath)
  const isApi = template.startsWith('/api/') || pathname.startsWith('/api/')
  const route = analyticsRoute(pathname)
  return {
    route_name: isApi ? 'api' : route.page,
    page_group: isApi ? 'api' : route.group,
    route_path: isApi ? template : route.path,
    http_method: /^[A-Z]{3,10}$/.test(request.method)
      ? request.method
      : 'UNKNOWN',
    router_kind: context.routerKind === 'App Router' ? 'app' : 'pages',
    route_type: context.routeType,
    render_source: context.renderSource,
    revalidate_reason: context.revalidateReason,
  }
}

type RequestHeaders = RequestErrorRequest['headers']

// Attribution only: the id is read from the verified Supabase session cookie
// and never used for authorization. Any failure falls back to the server id.
export async function resolveRequestUserId(
  headers: RequestHeaders,
): Promise<string | null> {
  const rawCookie = headers.cookie
  const cookieHeader = Array.isArray(rawCookie)
    ? rawCookie.join('; ')
    : rawCookie
  if (!cookieHeader || !cookieHeader.includes('-auth-token')) return null
  const lookup = (async () => {
    const [{ createServerClient, parseCookieHeader }, { getSupabaseConfig }] =
      await Promise.all([import('@supabase/ssr'), import('@/utils/supabase')])
    const { url, anonKey } = getSupabaseConfig()
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () =>
          parseCookieHeader(cookieHeader).map(({ name, value }) => ({
            name,
            value: value ?? '',
          })),
        setAll: () => {
          /* read-only: the hook cannot write response cookies */
        },
      },
    })
    const { data, error } = await supabase.auth.getClaims()
    if (error || !data?.claims) return null
    const { sub, is_anonymous: isAnonymous } = data.claims as {
      sub?: unknown
      is_anonymous?: unknown
    }
    return typeof sub === 'string' && sub && isAnonymous !== true ? sub : null
  })()
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), REQUEST_IDENTITY_TIMEOUT_MS).unref?.(),
  )
  try {
    return await Promise.race([lookup, timeout])
  } catch {
    return null
  }
}

// Next.js calls `onRequestError` for every unhandled error in route handlers,
// server components, and server actions. Middleware runs on the edge runtime,
// where this reporter is skipped.
export async function reportRequestError(
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext,
): Promise<boolean> {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs')
    return false
  if (!getServerPostHogClient()) return false
  const userId = await resolveRequestUserId(request.headers)
  return reportServerError(
    'request',
    error,
    describeRequestError(request, context),
    userId ?? SERVER_DISTINCT_ID,
  )
}
