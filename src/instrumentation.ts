import type { Instrumentation } from 'next'

// Next.js calls this for every unhandled error in route handlers, server
// components, and server actions. The reporter sends bounded context only;
// see src/lib/serverErrors.ts and docs/product-analytics.md.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { reportRequestError } = await import('@/lib/serverErrors')
  await reportRequestError(error, request, context)
}
