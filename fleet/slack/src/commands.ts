// The small command surface behind a mention: help, status, runs, run <id>.
// Anything else is a task for Claude.
import fs from 'node:fs'
import path from 'node:path'
import { transcriptUrl, type Config } from './config.js'
import type { TokenProvider } from './github.js'
import type { Logger } from './log.js'
import { exec } from './shell.js'
import { codeBlock, mrkdwnEscape } from './slack.js'
import type { Store } from './store.js'

export type Command =
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'runs' }
  | { kind: 'run'; id: string }

/** Strips mentions and recognises a command; null means "a task". */
export function parseCommand(text: string): Command | null {
  const clean = text
    .replace(/<@[A-Z0-9]+(\|[^>]*)?>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m = clean.match(/^(help|status|runs|run)\b(?:\s+(\S+))?\s*$/i)
  if (!m) return null
  const word = m[1].toLowerCase()
  if (word === 'run')
    return m[2]
      ? { kind: 'run', id: m[2].replace(/^`|`$/g, '') }
      : { kind: 'runs' }
  return { kind: word as 'help' | 'status' | 'runs' }
}

export const HELP_TEXT = [
  '*Fleet Slack agent*',
  'Mention or DM me with a task. I work in a thread: one status line I keep editing, a question only when something is unclear, then a PR. Tier 0 PRs merge on their own once CI is green (Hold stops that); Tier 1 waits for a human on GitHub. Issues that turn out outdated I close with the evidence.',
  'Reply in the thread to steer; `stop` drops the task.',
  'Commands: `status`, `runs`, `run <id>`, `help`. Rules: `fleet/slack/INSTRUCTIONS.md`.',
].join('\n')

export interface CommandDeps {
  cfg: Config
  store: Store
  tokens: TokenProvider
  log: Logger
  /** Overridable for tests: list the user timers. */
  listTimers?: () => Promise<string>
}

interface RunResult {
  run_id?: string
  run?: string
  outcome?: string
  finished_at?: string
  cost_usd?: number | null
  pr_url?: string | null
  checks?: Record<string, { ok?: boolean; status?: string }>
}

export class Commands {
  constructor(private d: CommandDeps) {}

  async execute(cmd: Command): Promise<string> {
    switch (cmd.kind) {
      case 'help':
        return HELP_TEXT
      case 'status':
        return this.status()
      case 'runs':
        return this.runs()
      case 'run':
        return this.run(cmd.id)
    }
  }

  private readRuns(): { dir: string; result: RunResult }[] {
    const { runsDir } = this.d.cfg
    if (!fs.existsSync(runsDir)) return []
    const out: { dir: string; result: RunResult }[] = []
    for (const name of fs.readdirSync(runsDir)) {
      const file = path.join(runsDir, name, 'result.json')
      try {
        if (!fs.statSync(path.join(runsDir, name)).isDirectory()) continue
        if (!fs.existsSync(file)) continue
        out.push({
          dir: name,
          result: JSON.parse(fs.readFileSync(file, 'utf8')) as RunResult,
        })
      } catch {
        // a run being written
      }
    }
    return out.sort((a, b) => (a.dir < b.dir ? 1 : -1))
  }

  private async status(): Promise<string> {
    const { cfg, store } = this.d
    const lines: string[] = ['*Fleet status*']
    // Timers
    const timers = await (this.d.listTimers ?? defaultListTimers)()
    lines.push(
      timers
        ? `Timers:\n${codeBlock(timers, 1200)}`
        : 'Timers: n/a (not on the box, or no user systemd)',
    )
    // Last canary
    const runs = this.readRuns()
    const canary = runs.find((r) => r.dir.endsWith('-canary'))
    if (canary) {
      const failed = Object.entries(canary.result.checks || {})
        .filter(([, v]) => v && v.ok === false)
        .map(([k]) => k)
      lines.push(
        `Last canary: \`${canary.result.outcome || '?'}\` at ${canary.result.finished_at || '?'}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`,
      )
    } else {
      lines.push('Last canary: no canary run in the runs directory')
    }
    // Open fleet PRs
    try {
      const env = { ...cfg.env, ...(await this.d.tokens.env()) }
      const r = await exec(
        'gh',
        [
          'pr',
          'list',
          '--repo',
          cfg.repo,
          '--state',
          'open',
          '--limit',
          '50',
          '--json',
          'number,title,url,headRefName',
        ],
        { env, timeoutMs: 30000 },
      )
      if (r.code === 0) {
        const prs = (
          JSON.parse(r.stdout || '[]') as {
            number: number
            title: string
            url: string
            headRefName: string
          }[]
        ).filter((p) => String(p.headRefName || '').startsWith('fleet/'))
        lines.push(
          prs.length
            ? `Open fleet PRs (${prs.length}):\n${prs.map((p) => `• <${p.url}|#${p.number}> ${mrkdwnEscape(p.title)}`).join('\n')}`
            : 'Open fleet PRs: none',
        )
      } else {
        lines.push(`Open fleet PRs: gh failed (${oneLineErr(r.stderr)})`)
      }
    } catch (err) {
      lines.push(`Open fleet PRs: ${oneLineErr(String(err))}`)
    }
    // Today's cost
    const today = new Date().toISOString().slice(0, 10)
    const todays = runs.filter((r) =>
      String(r.result.finished_at || '').startsWith(today),
    )
    const cost = todays.reduce(
      (s, r) => s + (Number(r.result.cost_usd) || 0),
      0,
    )
    const byRoutine = new Map<string, number>()
    for (const r of todays) {
      const routine = r.result.run || r.dir.replace(/^[0-9TZ]+-/, '')
      byRoutine.set(routine, (byRoutine.get(routine) || 0) + 1)
    }
    const breakdown = [...byRoutine.entries()]
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')
    lines.push(
      `Today (UTC): ${todays.length} run${todays.length === 1 ? '' : 's'}${breakdown ? ` (${breakdown})` : ''}, $${cost.toFixed(2)} in Claude usage${fs.existsSync(path.join(cfg.runsDir, 'metrics.prom')) ? '' : ' (no metrics.prom yet)'}`,
    )
    // Threads
    const active = store.listThreads(['queued', 'working', 'gate'])
    const waiting = store.listThreads(['waiting', 'pr_open'])
    lines.push(
      `Slack tasks: ${active.length} running, ${waiting.length} waiting on you; ${store.countPostedIssues()} inbox issues posted so far`,
    )
    lines.push(`GitHub auth: ${this.d.tokens.describe()}`)
    return lines.join('\n')
  }

  private async runs(): Promise<string> {
    const { cfg } = this.d
    const r = await exec('bash', [cfg.runsScript, 'list', '10'], {
      env: {
        ...cfg.env,
        FLEET_RUNS_DIR: cfg.runsDir,
        FLEET_ROOT: cfg.fleetRoot,
      },
      timeoutMs: 30000,
    })
    if (r.code !== 0) return `runs.sh failed: ${oneLineErr(r.stderr)}`
    return `*Last 10 runs*\n${codeBlock(r.stdout.trim() || '(no runs yet)', 2800)}`
  }

  private async run(id: string): Promise<string> {
    const { cfg } = this.d
    if (!/^[A-Za-z0-9._-]+$/.test(id))
      return 'A run id looks like `20261102T120000Z-slack` (or `fixer`, `latest-canary`).'
    const r = await exec('bash', [cfg.runsScript, 'show', id], {
      env: {
        ...cfg.env,
        FLEET_RUNS_DIR: cfg.runsDir,
        FLEET_ROOT: cfg.fleetRoot,
      },
      timeoutMs: 30000,
    })
    if (r.code !== 0)
      return `No such run: ${mrkdwnEscape(oneLineErr(r.stderr || r.stdout))}`
    const url = transcriptUrl(cfg, id)
    return [
      `*Run ${id}*${url ? ` · <${url}|full transcript in Grafana>` : ''}`,
      codeBlock(r.stdout.trim(), 3200),
    ].join('\n')
  }
}

function oneLineErr(s: string): string {
  return (
    (s || '').trim().split('\n').slice(-1)[0]?.slice(0, 200) || 'unknown error'
  )
}

async function defaultListTimers(): Promise<string> {
  try {
    const r = await exec(
      'systemctl',
      ['--user', 'list-timers', 'fleet-*', '--no-pager', '--no-legend'],
      { timeoutMs: 10000 },
    )
    if (r.code !== 0) return ''
    return r.stdout.trim()
  } catch {
    return ''
  }
}
