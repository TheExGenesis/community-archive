import type { Instrumentation } from 'next'

/**
 * Next.js instrumentation hook.
 *
 * `onRequestError` fires for every unhandled error in a route handler,
 * server component, server action or middleware. Every runtime writes one
 * structured log line (`kind: "unhandled_error"`) so Vercel logs stay the raw
 * record; the Node.js runtime then reports the error to PostHog error
 * tracking with bounded context only (analytics route name or API route
 * template, method, router kind, route type) and, for a verified signed-in
 * session, the account id. See src/lib/serverErrors.ts,
 * docs/product-analytics.md ("Error tracking") and docs/hyperobservability.md.
 */

export async function register() {
  // Nothing to start. Kept so the file is a valid instrumentation module.
}

const AUTH_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/

function stripQuery(path: string) {
  const i = path.indexOf('?')
  return i === -1 ? path : path.slice(0, i)
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const cookie = request.headers.cookie
  const cookieHeader = Array.isArray(cookie) ? cookie.join(';') : cookie
  const userState =
    cookieHeader === undefined
      ? 'unknown'
      : AUTH_COOKIE.test(cookieHeader)
        ? 'signed_in'
        : 'guest'
  const vercelId = request.headers['x-vercel-id']
  const requestId = Array.isArray(vercelId) ? vercelId[0] : vercelId
  const route = context.routePath || stripQuery(request.path)
  const err = error instanceof Error ? error : new Error(String(error))

  console.error(
    JSON.stringify({
      level: 'error',
      kind: 'unhandled_error',
      ts: new Date().toISOString(),
      request_id: requestId ?? null,
      route,
      method: request.method,
      router_kind: context.routerKind,
      route_type: context.routeType,
      render_source: context.renderSource ?? null,
      revalidate_reason: context.revalidateReason ?? null,
      user_state: userState,
      error: { name: err.name, message: err.message },
    }),
  )

  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { reportRequestError } = await import('@/lib/serverErrors')
  await reportRequestError(err, request, context)
}
