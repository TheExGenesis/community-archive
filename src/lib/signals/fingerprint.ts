import { createHash } from 'node:crypto'
import type { SignalSource } from './types'

/**
 * Fingerprint = first 12 hex chars of sha256(`${source}|${key}`).
 *
 * The key is chosen by each source adapter to be stable across repeats of
 * the same problem: a PostHog issue id, a Grafana alert fingerprint, a
 * Vercel path plus status plus error name. Volatile parts (timestamps,
 * request ids, counts) must never be part of the key.
 */
export function signalFingerprint(source: SignalSource, key: string): string {
  return createHash('sha256')
    .update(`${source}|${normalizeKey(key)}`)
    .digest('hex')
    .slice(0, 12)
}

export function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** The marker written into an issue body, and searched for on dedupe. */
export function fingerprintMarker(fingerprint: string): string {
  return `fp:${fingerprint}`
}

const MARKER = /\bfp:([0-9a-f]{12})\b/

export function fingerprintFromText(text: string | null | undefined) {
  if (!text) return null
  const match = MARKER.exec(text)
  return match ? match[1] : null
}

/** Strip the query string so request paths group by route, not by params. */
export function pathWithoutQuery(path: string): string {
  const i = path.indexOf('?')
  return i === -1 ? path : path.slice(0, i)
}

/**
 * Collapse ids in a path so `/api/tweets/123/likes` and `/api/tweets/456/likes`
 * fingerprint together. Only long digit runs and uuids are replaced.
 */
export function routePattern(path: string): string {
  return pathWithoutQuery(path)
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':id',
    )
    .replace(/\/\d{5,}(?=\/|$)/g, '/:id')
}
