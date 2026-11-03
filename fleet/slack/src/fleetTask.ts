// The bridge to fleet/bin/task.sh: the fixer's bash helpers (gate, Tier 1
// guard, worktrees, PR creation and read-back, result.json, metrics, failure
// signals) as typed calls. The service never reimplements those.
import type { Config } from './config.js'
import type { TokenProvider } from './github.js'
import { exec, type ExecResult } from './shell.js'

export interface PrFile {
  path: string
  additions?: number
  deletions?: number
}

export interface PrCheck {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
}

export interface PrFacts {
  number: number
  url: string
  title: string
  state: string
  isDraft: boolean
  mergeable: string
  mergeStateStatus?: string
  headRefName: string
  baseRefName: string
  statusCheckRollup: PrCheck[]
  files: PrFile[]
  body?: string
  additions?: number
  deletions?: number
}

export interface InboxIssue {
  number: number
  title: string
  body: string | null
  labels: { name: string }[] | string[]
  createdAt: string
}

export class FleetTask {
  constructor(
    private cfg: Pick<
      Config,
      | 'taskScript'
      | 'fleetRoot'
      | 'runsDir'
      | 'repo'
      | 'baseBranch'
      | 'env'
      | 'exploreUrl'
    >,
    private tokens: TokenProvider,
  ) {}

  private async baseEnv(runDir?: string): Promise<NodeJS.ProcessEnv> {
    const tok = await this.tokens.env()
    const env: NodeJS.ProcessEnv = {
      ...this.cfg.env,
      ...tok,
      FLEET_ROOT: this.cfg.fleetRoot,
      FLEET_RUNS_DIR: this.cfg.runsDir,
      FLEET_REPO: this.cfg.repo,
      FLEET_BASE_BRANCH: this.cfg.baseBranch,
      FLEET_ROUTINE: 'slack',
      FLEET_RUN_NAME: 'slack',
    }
    if (this.cfg.exploreUrl) env.FLEET_RUNS_EXPLORE_URL = this.cfg.exploreUrl
    if (runDir) env.RUN_DIR = runDir
    else delete env.RUN_DIR
    return env
  }

  /** Run one subcommand; resolves with the raw result (no throw on non-zero). */
  async raw(
    args: string[],
    opts: { runDir?: string; input?: string; timeoutMs?: number } = {},
  ): Promise<ExecResult> {
    return exec('bash', [this.cfg.taskScript, ...args], {
      cwd: this.cfg.fleetRoot,
      env: await this.baseEnv(opts.runDir),
      input: opts.input,
      timeoutMs: opts.timeoutMs,
    })
  }

  /** Run one subcommand; throws with stderr's tail on failure; resolves with stdout. */
  async run(
    args: string[],
    opts: { runDir?: string; input?: string; timeoutMs?: number } = {},
  ): Promise<string> {
    const r = await this.raw(args, opts)
    if (r.code !== 0) {
      const tail = (r.stderr || r.stdout)
        .trim()
        .split('\n')
        .slice(-15)
        .join('\n')
      throw new Error(`task.sh ${args[0]} exited ${r.code}: ${tail}`)
    }
    return r.stdout
  }

  async initRun(name: string, runDir: string): Promise<string> {
    return (await this.run(['init-run', name], { runDir })).trim()
  }

  async worktreeAdd(
    branch: string,
    dir: string,
    runDir: string,
  ): Promise<string> {
    return (await this.run(['worktree-add', branch, dir], { runDir })).trim()
  }

  async worktreeRemove(
    dir: string,
    branch: string | undefined,
    runDir?: string,
  ): Promise<void> {
    await this.raw(['worktree-remove', dir, ...(branch ? [branch] : [])], {
      runDir,
    })
  }

  /** git add -A and the staged patch. */
  async stage(worktree: string, runDir: string): Promise<string> {
    return this.run(['stage', worktree], { runDir })
  }

  async tier1(worktree: string, runDir: string): Promise<string[]> {
    return lines(await this.run(['tier1', worktree], { runDir }))
  }

  async tier1Paths(paths: string[]): Promise<string[]> {
    if (paths.length === 0) return []
    return lines(
      await this.run(['tier1-paths'], { input: paths.join('\n') + '\n' }),
    )
  }

  async changedLines(worktree: string, runDir: string): Promise<number> {
    return (
      Number(
        (await this.run(['changed-lines', worktree], { runDir })).trim(),
      ) || 0
    )
  }

  /** The four CI checks; resolves with ok and the summary lines. */
  async gate(
    worktree: string,
    logDir: string,
    runDir: string,
  ): Promise<{ ok: boolean; summary: string[] }> {
    const r = await this.raw(['gate', worktree, logDir], {
      runDir,
      timeoutMs: 60 * 60 * 1000,
    })
    let summary: string[] = []
    try {
      const fs = await import('node:fs')
      summary = lines(fs.readFileSync(`${logDir}/summary.txt`, 'utf8'))
    } catch {
      summary = []
    }
    return { ok: r.code === 0, summary }
  }

  async gateFailurePrompt(
    logDir: string,
    out: string,
    runDir: string,
  ): Promise<void> {
    await this.run(['gate-failure-prompt', logDir, out], { runDir })
  }

  async commit(
    worktree: string,
    messageFile: string,
    runDir: string,
  ): Promise<string> {
    return (
      await this.run(['commit', worktree, messageFile], { runDir })
    ).trim()
  }

  async pushBranch(
    worktree: string,
    branch: string,
    runDir: string,
  ): Promise<void> {
    await this.run(['push-branch', worktree, branch], { runDir })
  }

  async prCreate(
    branch: string,
    title: string,
    bodyFile: string,
    runDir: string,
  ): Promise<string> {
    return (
      await this.run(['pr-create', branch, title, bodyFile], { runDir })
    ).trim()
  }

  async prView(number: number): Promise<PrFacts> {
    const out = await this.run(['pr-view', String(number)])
    const d = JSON.parse(out) as Partial<PrFacts>
    return {
      number: Number(d.number ?? number),
      url: String(d.url ?? ''),
      title: String(d.title ?? ''),
      state: String(d.state ?? ''),
      isDraft: Boolean(d.isDraft),
      mergeable: String(d.mergeable ?? ''),
      mergeStateStatus: d.mergeStateStatus
        ? String(d.mergeStateStatus)
        : undefined,
      headRefName: String(d.headRefName ?? ''),
      baseRefName: String(d.baseRefName ?? ''),
      statusCheckRollup: Array.isArray(d.statusCheckRollup)
        ? d.statusCheckRollup
        : [],
      files: Array.isArray(d.files) ? d.files : [],
      body: typeof d.body === 'string' ? d.body : undefined,
      additions: typeof d.additions === 'number' ? d.additions : undefined,
      deletions: typeof d.deletions === 'number' ? d.deletions : undefined,
    }
  }

  async prMerge(number: number, runDir?: string): Promise<void> {
    await this.run(['pr-merge', String(number)], { runDir })
  }

  async issueClose(
    number: number,
    commentFile: string,
    runDir?: string,
  ): Promise<void> {
    await this.run(['issue-close', String(number), commentFile], { runDir })
  }

  async issuesList(): Promise<InboxIssue[]> {
    const out = await this.run(['issues-list'])
    const parsed = JSON.parse(out || '[]') as InboxIssue[]
    return Array.isArray(parsed) ? parsed : []
  }

  async labelsEnsure(): Promise<void> {
    await this.raw(['labels-ensure'])
  }

  async transcriptRender(
    jsonl: string,
    md: string,
    title: string,
    runDir: string,
  ): Promise<void> {
    await this.raw(['transcript-render', jsonl, md, title], { runDir })
  }

  async runLine(outcome: string, runDir: string): Promise<string> {
    return (await this.run(['run-line', outcome], { runDir })).trim()
  }

  async postSignal(
    kind: string,
    summary: string,
    runDir?: string,
  ): Promise<void> {
    await this.raw(['post-signal', kind, summary], { runDir })
  }

  async finish(
    outcome: string,
    runDir: string,
    opts: { issue?: number; ref?: string; sessionId?: string } = {},
  ): Promise<void> {
    await this.run(
      [
        'finish',
        outcome,
        opts.issue ? String(opts.issue) : '',
        opts.ref || '',
        opts.sessionId || '',
      ],
      { runDir },
    )
  }
}

function lines(s: string): string[] {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
}

export function issueLabelNames(issue: InboxIssue): string[] {
  return (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name))
}
