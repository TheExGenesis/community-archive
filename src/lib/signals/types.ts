/**
 * A signal is one thing production said that may need a change.
 *
 * Every source (PostHog error tracking, Grafana alerts, the Vercel log
 * drain, the autorefresh health report, a human) is normalized to this shape
 * before it becomes a GitHub issue with the `signal` label. The fingerprint
 * is what makes repeat sightings a comment instead of a new issue.
 */

export const SIGNAL_SOURCES = [
  'posthog',
  'grafana',
  'vercel',
  'autorefresh',
  'canary',
  'generic',
] as const

export type SignalSource = (typeof SIGNAL_SOURCES)[number]

export type SignalSeverity = 'info' | 'warning' | 'critical'

export type Signal = {
  source: SignalSource
  /** Short, stable title. Becomes the issue title after the source prefix. */
  title: string
  /** 12 hex chars derived from source + stable key. See fingerprint.ts. */
  fingerprint: string
  severity: SignalSeverity
  /** Firing or resolved. Resolved signals only comment on an open issue. */
  state: 'firing' | 'resolved'
  /** ISO time the source first saw it, when the source says. */
  firstSeen?: string
  occurrences?: number
  /** Route pattern or path with no query string, when relevant. */
  route?: string
  /** Deep link back to the source (PostHog issue, Grafana panel, Vercel log). */
  link?: string
  /** One paragraph a triage agent reads first. */
  summary?: string
  /** Machine-readable, non-identifying details. Rendered as a JSON block. */
  details: Record<string, unknown>
}

export function isSignalSource(value: string): value is SignalSource {
  return (SIGNAL_SOURCES as readonly string[]).includes(value)
}
