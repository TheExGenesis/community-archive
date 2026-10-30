import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Webhook authentication for /api/signals/[source].
 *
 * Every source sends `Authorization: Bearer <SIGNALS_WEBHOOK_SECRET>`.
 * Vercel log drains cannot set headers freely; they sign the raw body with
 * the drain secret as `x-vercel-signature` (HMAC-SHA1, hex). Set the drain
 * secret to the same value as SIGNALS_WEBHOOK_SECRET.
 */

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function bearerMatches(
  authorization: string | null,
  secret: string,
): boolean {
  if (!authorization) return false
  const [scheme, token] = authorization.split(' ', 2)
  return (
    scheme === 'Bearer' && typeof token === 'string' && safeEqual(token, secret)
  )
}

export function vercelSignatureMatches(
  signature: string | null,
  rawBody: string,
  secret: string,
): boolean {
  if (!signature) return false
  const expected = createHmac('sha1', secret).update(rawBody).digest('hex')
  return safeEqual(signature, expected)
}

export function signalRequestAuthorized(
  headers: Headers,
  rawBody: string,
  secret: string | undefined,
): boolean {
  if (!secret) return false
  return (
    bearerMatches(headers.get('authorization'), secret) ||
    vercelSignatureMatches(headers.get('x-vercel-signature'), rawBody, secret)
  )
}
