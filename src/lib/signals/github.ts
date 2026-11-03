import { fingerprintFromText, fingerprintMarker } from './fingerprint'
import type { Signal } from './types'

/**
 * The signal inbox is GitHub issues labelled `signal` on the product repo.
 *
 * Why issues: it is already where xiq and Christine look, `gh` makes it
 * agent-readable, and a fix PR can close it with "Fixes #n". Dedupe is by
 * fingerprint marker in the body, matched against the open `signal` issues.
 */

export const SIGNAL_LABEL = 'signal'

export type SignalIssueConfig = {
  token: string
  /** owner/name */
  repo: string
  apiBase?: string
  fetchImpl?: typeof fetch
}

export type SignalOutcome = {
  fingerprint: string
  action: 'created' | 'commented' | 'resolved' | 'ignored'
  number?: number
  url?: string
}

type IssueRecord = { number: number; body: string | null; html_url: string }

export function signalIssueConfigFromEnv(): SignalIssueConfig | null {
  const token = process.env.SIGNALS_GITHUB_TOKEN
  if (!token) return null
  return {
    token,
    repo: process.env.SIGNALS_GITHUB_REPO || 'TheExGenesis/community-archive',
  }
}

const sevIcon = { critical: '🔴', warning: '🟠', info: '🔵' } as const

export function signalIssueTitle(signal: Signal): string {
  return `[signal:${signal.source}] ${signal.title}`
}

/**
 * Body layout is a contract for triage agents: a short human summary, a
 * fenced `signal` JSON block that is the machine-readable record, and the
 * fingerprint marker used for dedupe.
 */
export function signalIssueBody(signal: Signal): string {
  const record = {
    schema: 'signal/1',
    source: signal.source,
    fingerprint: signal.fingerprint,
    severity: signal.severity,
    state: signal.state,
    first_seen: signal.firstSeen ?? null,
    occurrences: signal.occurrences ?? null,
    route: signal.route ?? null,
    link: signal.link ?? null,
    details: signal.details,
  }
  const lines = [
    `${sevIcon[signal.severity]} **${signal.severity}** from **${signal.source}**` +
      (signal.route ? ` on \`${signal.route}\`` : ''),
    '',
    signal.summary ?? '_No summary from the source._',
    '',
    signal.link ? `Source: ${signal.link}` : null,
    signal.firstSeen ? `First seen: ${signal.firstSeen}` : null,
    '',
    '```json signal',
    JSON.stringify(record, null, 2),
    '```',
    '',
    `<!-- ${fingerprintMarker(signal.fingerprint)} -->`,
    `Filed automatically. Triage: decide bug / wontfix / needs-decision, then a fix PR closes this with \`Fixes #n\`. See docs/hyperobservability.md.`,
  ]
  return lines.filter((l) => l !== null).join('\n')
}

export function repeatComment(signal: Signal): string {
  const when = new Date().toISOString()
  const count =
    signal.occurrences !== undefined
      ? ` (${signal.occurrences} occurrence${signal.occurrences === 1 ? '' : 's'} in this batch)`
      : ''
  return `Seen again at ${when}${count}.${signal.link ? ` ${signal.link}` : ''}`
}

export function resolvedComment(signal: Signal): string {
  return `Source reports this resolved at ${new Date().toISOString()}. Leave open until the cause is understood, then close.`
}

async function gh<T>(
  config: SignalIssueConfig,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const fetchImpl = config.fetchImpl ?? fetch
  const base = config.apiBase ?? 'https://api.github.com'
  const response = await fetchImpl(`${base}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${config.token}`,
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new Error(`GitHub ${method} ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

export async function listOpenSignalIssues(
  config: SignalIssueConfig,
): Promise<Map<string, IssueRecord>> {
  const issues = await gh<IssueRecord[]>(
    config,
    'GET',
    `/repos/${config.repo}/issues?labels=${SIGNAL_LABEL}&state=open&per_page=100`,
  )
  const byFingerprint = new Map<string, IssueRecord>()
  for (const issue of issues) {
    const fp = fingerprintFromText(issue.body)
    if (fp && !byFingerprint.has(fp)) byFingerprint.set(fp, issue)
  }
  return byFingerprint
}

/**
 * Create or comment, one issue per fingerprint. Repeats of a firing signal
 * comment; a resolved signal comments only when an issue is open.
 */
export async function upsertSignalIssues(
  config: SignalIssueConfig,
  signals: Signal[],
): Promise<SignalOutcome[]> {
  if (signals.length === 0) return []
  const open = await listOpenSignalIssues(config)
  const outcomes: SignalOutcome[] = []

  for (const signal of signals) {
    const existing = open.get(signal.fingerprint)

    if (signal.state === 'resolved') {
      if (!existing) {
        outcomes.push({ fingerprint: signal.fingerprint, action: 'ignored' })
        continue
      }
      await gh(
        config,
        'POST',
        `/repos/${config.repo}/issues/${existing.number}/comments`,
        {
          body: resolvedComment(signal),
        },
      )
      outcomes.push({
        fingerprint: signal.fingerprint,
        action: 'resolved',
        number: existing.number,
        url: existing.html_url,
      })
      continue
    }

    if (existing) {
      await gh(
        config,
        'POST',
        `/repos/${config.repo}/issues/${existing.number}/comments`,
        {
          body: repeatComment(signal),
        },
      )
      outcomes.push({
        fingerprint: signal.fingerprint,
        action: 'commented',
        number: existing.number,
        url: existing.html_url,
      })
      continue
    }

    const created = await gh<IssueRecord>(
      config,
      'POST',
      `/repos/${config.repo}/issues`,
      {
        title: signalIssueTitle(signal),
        body: signalIssueBody(signal),
        labels: [SIGNAL_LABEL],
      },
    )
    open.set(signal.fingerprint, created)
    outcomes.push({
      fingerprint: signal.fingerprint,
      action: 'created',
      number: created.number,
      url: created.html_url,
    })
  }
  return outcomes
}
