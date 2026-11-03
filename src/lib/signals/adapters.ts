import { routePattern, signalFingerprint } from './fingerprint'
import type { Signal, SignalSeverity, SignalSource } from './types'
import { isSignalSource } from './types'

/**
 * Source adapters: turn a webhook payload into zero or more Signals.
 *
 * Each adapter is total over its input: a payload it cannot read yields an
 * empty list, never a throw. Nothing identifying is copied into `details`;
 * adapters pick the fields they understand rather than forwarding payloads.
 */

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

export const MAX_SIGNALS_PER_REQUEST = 20

// ─── PostHog error tracking ────────────────────────────────────────────────

/**
 * Expected body, produced by a PostHog webhook destination template (see
 * docs/hyperobservability.md):
 *
 * { "issue": { "id", "name", "description", "url", "status" },
 *   "occurrences"?: number, "first_seen"?: string,
 *   "exception_type"?: string, "route"?: string, "side"?: "server"|"browser" }
 *
 * Also accepts the same keys flattened at the top level.
 */
export function signalsFromPostHog(payload: unknown): Signal[] {
  if (!isObject(payload)) return []
  const issue = isObject(payload.issue) ? payload.issue : payload
  const id = str(issue.id) ?? str(payload.issue_id)
  const name = str(issue.name) ?? str(payload.name) ?? str(payload.title)
  if (!id && !name) return []
  const key = id ?? (name as string)
  const side = str(payload.side)
  const route = str(payload.route)
  const description = str(issue.description) ?? str(payload.description)
  return [
    {
      source: 'posthog',
      title: clip(name ?? `PostHog issue ${id}`, 120),
      fingerprint: signalFingerprint('posthog', key),
      severity: 'warning',
      state: str(issue.status) === 'resolved' ? 'resolved' : 'firing',
      firstSeen: str(payload.first_seen),
      occurrences: num(payload.occurrences),
      route: route ? routePattern(route) : undefined,
      link: str(issue.url) ?? str(payload.url),
      summary: description ? clip(description, 600) : undefined,
      details: {
        issue_id: id ?? null,
        exception_type: str(payload.exception_type) ?? null,
        side: side ?? null,
      },
    },
  ]
}

// ─── Grafana alerting webhook ──────────────────────────────────────────────

const grafanaSeverity = (labels: Json): SignalSeverity => {
  const s = str(labels.severity)?.toLowerCase()
  if (s === 'critical' || s === 'page') return 'critical'
  if (s === 'info') return 'info'
  return 'warning'
}

/** Grafana's standard webhook contact-point body. */
export function signalsFromGrafana(payload: unknown): Signal[] {
  if (!isObject(payload) || !Array.isArray(payload.alerts)) return []
  const out: Signal[] = []
  for (const raw of payload.alerts) {
    if (!isObject(raw)) continue
    const labels = isObject(raw.labels) ? raw.labels : {}
    const annotations = isObject(raw.annotations) ? raw.annotations : {}
    const alertname = str(labels.alertname) ?? str(payload.title)
    if (!alertname) continue
    const instance = str(labels.instance) ?? str(labels.service_id)
    const checkId = str(labels.check_id)
    const key =
      str(raw.fingerprint) ??
      [alertname, instance, checkId].filter(Boolean).join('|')
    const summary = str(annotations.summary) ?? str(annotations.description)
    out.push({
      source: 'grafana',
      title: clip(instance ? `${alertname} on ${instance}` : alertname, 120),
      fingerprint: signalFingerprint('grafana', key),
      severity: grafanaSeverity(labels),
      state: str(raw.status) === 'resolved' ? 'resolved' : 'firing',
      firstSeen: str(raw.startsAt),
      link:
        str(raw.panelURL) ??
        str(raw.dashboardURL) ??
        str(raw.generatorURL) ??
        str(raw.silenceURL),
      summary: summary ? clip(summary, 600) : undefined,
      details: {
        alertname,
        instance: instance ?? null,
        service_id: str(labels.service_id) ?? null,
        check_id: checkId ?? null,
        criticality: str(labels.criticality) ?? null,
        runbook_url: str(annotations.runbook_url) ?? null,
        starts_at: str(raw.startsAt) ?? null,
        ends_at: str(raw.endsAt) ?? null,
      },
    })
    if (out.length >= MAX_SIGNALS_PER_REQUEST) break
  }
  return out
}

// ─── Vercel log drain ──────────────────────────────────────────────────────

type VercelLog = {
  message?: string
  path?: string
  statusCode?: number
  level?: string
  source?: string
  deploymentId?: string
  requestId?: string
  timestamp?: number
  proxy?: { path?: string; statusCode?: number; method?: string }
}

/** Vercel drains send a JSON array (format "json") or NDJSON. */
export function parseVercelDrainBody(text: string): VercelLog[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  try {
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed)
      return Array.isArray(arr) ? arr.filter(isObject) : []
    }
    return trimmed
      .split('\n')
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(isObject)
  } catch {
    return []
  }
}

/** Our own structured line, if the log message is one. */
function structuredLine(message: string | undefined): Json | null {
  if (!message) return null
  const start = message.indexOf('{')
  if (start === -1) return null
  try {
    const parsed = JSON.parse(message.slice(start))
    return isObject(parsed) &&
      (parsed.kind === 'api_error' || parsed.kind === 'unhandled_error')
      ? parsed
      : null
  } catch {
    return null
  }
}

/**
 * Only 5xx responses and error-level lines become signals. One signal per
 * (route, status, error name) per request; repeats raise `occurrences`.
 */
export function signalsFromVercel(logs: VercelLog[]): Signal[] {
  const byFingerprint = new Map<string, Signal>()
  for (const log of logs) {
    const status = num(log.statusCode) ?? num(log.proxy?.statusCode)
    const line = structuredLine(log.message)
    const isError =
      (status !== undefined && status >= 500) ||
      log.level === 'error' ||
      line !== null
    if (!isError) continue
    if (log.source === 'build' || log.source === 'static') continue

    const rawPath =
      str(line?.route) ?? str(log.path) ?? str(log.proxy?.path) ?? '/'
    const route = routePattern(rawPath)
    const errorName = isObject(line?.error)
      ? (str(line.error.name) ?? 'Error')
      : 'Error'
    const effectiveStatus = num(line?.status) ?? status ?? 500
    const key = `${route}|${effectiveStatus}|${errorName}`
    const fingerprint = signalFingerprint('vercel', key)

    const existing = byFingerprint.get(fingerprint)
    if (existing) {
      existing.occurrences = (existing.occurrences ?? 1) + 1
      continue
    }
    const upstream = str(line?.upstream)
    byFingerprint.set(fingerprint, {
      source: 'vercel',
      title: clip(
        `${effectiveStatus} on ${route}${upstream ? ` (${upstream})` : ''}`,
        120,
      ),
      fingerprint,
      severity: effectiveStatus >= 500 ? 'critical' : 'warning',
      state: 'firing',
      firstSeen:
        typeof log.timestamp === 'number'
          ? new Date(log.timestamp).toISOString()
          : undefined,
      occurrences: 1,
      route,
      summary: line
        ? clip(String(str(line.message) ?? errorName), 300)
        : clip(String(log.message ?? ''), 300) || undefined,
      details: {
        status: effectiveStatus,
        error_name: errorName,
        upstream: upstream ?? null,
        user_state: str(line?.user_state) ?? null,
        request_id: str(line?.request_id) ?? str(log.requestId) ?? null,
        deployment_id: str(log.deploymentId) ?? null,
        log_source: str(log.source) ?? null,
      },
    })
    if (byFingerprint.size >= MAX_SIGNALS_PER_REQUEST) break
  }
  return Array.from(byFingerprint.values())
}

// ─── Generic (autorefresh health report, canary, scripts, humans) ──────────

/**
 * { "source"?: "autorefresh"|"canary"|"generic", "title", "key"?, "severity"?,
 *   "state"?: "firing"|"resolved", "summary"?, "route"?, "link"?, "details"?: {} }
 * or an array of those.
 */
export function signalsFromGeneric(
  payload: unknown,
  defaultSource: SignalSource = 'generic',
): Signal[] {
  const items = Array.isArray(payload) ? payload : [payload]
  const out: Signal[] = []
  for (const item of items) {
    if (!isObject(item)) continue
    const title = str(item.title)
    if (!title) continue
    const sourceRaw = str(item.source)
    const source: SignalSource =
      sourceRaw && isSignalSource(sourceRaw) ? sourceRaw : defaultSource
    const severity = str(item.severity)
    const route = str(item.route)
    out.push({
      source,
      title: clip(title, 120),
      fingerprint: signalFingerprint(source, str(item.key) ?? title),
      severity:
        severity === 'critical' || severity === 'info' ? severity : 'warning',
      state: str(item.state) === 'resolved' ? 'resolved' : 'firing',
      firstSeen: str(item.first_seen),
      occurrences: num(item.occurrences),
      route: route ? routePattern(route) : undefined,
      link: str(item.link),
      summary: str(item.summary)
        ? clip(item.summary as string, 600)
        : undefined,
      details: isObject(item.details) ? item.details : {},
    })
    if (out.length >= MAX_SIGNALS_PER_REQUEST) break
  }
  return out
}
