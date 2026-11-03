// Server-side error reporting to PostHog. Browser reporting lives in
// `src/lib/posthog.ts`; this module is only imported by server code (route
// handlers, workflow steps, and the Next.js instrumentation hook). Transport
// is `captureServerException` (src/lib/observability/serverErrorCapture.ts),
// shared with `reportApiError`, so every server exception honours
// `SERVER_ERROR_CAPTURE=off` and carries the same deployment properties.
//
// Contract (docs/product-analytics.md, "Error tracking"): the error itself
// (type, message, stack) plus bounded context only. Scopes are an enum, route
// names come from the analytics registry or the route template, and free-text
// context values are rejected. Never pass usernames, emails, query text,
// tweet or archive IDs, or raw URLs.
import type { Instrumentation } from 'next'
import { analyticsRoute } from '@/lib/analyticsRoutes'
import { userStateFromCookieHeader } from '@/lib/observability/apiError'
import {
  captureServerException,
  serverErrorCaptureEnabled,
  type UserState,
} from '@/lib/observability/serverErrorCapture'

export const serverErrorScopes = [
  'archive_delete',
  'digest_email',
  'digest_generation',
  'request',
] as const
export type ServerErrorScope = (typeof serverErrorScopes)[number]

type SafeContextValue = string | number | boolean
export type ServerErrorContext = Record<string, SafeContextValue | undefined>

const REQUEST_IDENTITY_TIMEOUT_MS = 1500
const contextKeyPattern = /^[a-z][a-z0-9_]{0,39}$/
// Enum tokens, status codes, and route templates; never free text.
const contextTokenPattern = /^[A-Za-z0-9_.\-/[\]]{1,160}$/
const routeTemplatePattern = /^(\/[A-Za-z0-9_.\-[\]]+)+$/

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

type RequestAttribution = {
  requestId?: string
  userState?: UserState
}

// `route_path` and `http_method` become the shared `route`/`method`
// properties; everything else travels as bounded extras.
async function sendServerError(
  scope: ServerErrorScope,
  error: unknown,
  context: ServerErrorContext,
  distinctId: string | undefined,
  attribution: RequestAttribution = {},
): Promise<boolean> {
  if (!serverErrorCaptureEnabled()) return false
  const {
    route_path: routePath,
    http_method: method,
    ...extra
  } = sanitizeServerErrorContext(context)
  return captureServerException(toReportableError(error), {
    route: typeof routePath === 'string' ? routePath : scope,
    method: typeof method === 'string' ? method : undefined,
    requestId: attribution.requestId,
    userState: attribution.userState ?? (distinctId ? 'signed_in' : 'unknown'),
    distinctId,
    extra: { ...extra, scope, runtime: 'server' },
  })
}

// `distinctId` is the verified account id (from `supabase.auth.getUser()` or
// `getClaims()`), used only so the issue lists the member it affected.
// Unset: the fixed, personless server id.
export async function reportServerError(
  scope: ServerErrorScope,
  error: unknown,
  context: ServerErrorContext = {},
  distinctId?: string,
): Promise<boolean> {
  return sendServerError(scope, error, context, distinctId)
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

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

// Next.js calls `onRequestError` for every unhandled error in route handlers,
// server components, and server actions. Middleware runs on the edge runtime,
// where this reporter is skipped (src/instrumentation.ts still logs it).
export async function reportRequestError(
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext,
): Promise<boolean> {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs')
    return false
  if (!serverErrorCaptureEnabled()) return false
  const userId = await resolveRequestUserId(request.headers)
  const rawCookie = request.headers.cookie
  const cookieHeader = Array.isArray(rawCookie)
    ? rawCookie.join('; ')
    : rawCookie
  return sendServerError(
    'request',
    error,
    describeRequestError(request, context),
    userId ?? undefined,
    {
      requestId: headerValue(request.headers['x-vercel-id']),
      userState: userId
        ? 'signed_in'
        : userStateFromCookieHeader(cookieHeader ?? null),
    },
  )
}
