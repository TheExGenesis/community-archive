// One Slack thread = one conversation: one Claude Code session (resumed on
// every reply, for as long as the thread lives) in one git worktree kept at
// a stable path. Work inside it comes in jobs: a branch, a run directory and,
// when Claude ends a turn with `done`, a PR shipped through the fixer's
// machinery (stage, Tier 1 check, gate with one repair attempt, commit, push,
// PR, read-back, result.json, metrics). A Tier 0 PR under the line cap is
// merged by the service once CI is green. The thread goes on after that:
// the next message starts the next job in the same worktree and session.
import fs from 'node:fs'
import path from 'node:path'
import type { TranscriptLib } from '../types/transcript-lib.js'
import {
  runClaude,
  TASK_ALLOWED_TOOLS,
  TASK_DISALLOWED_TOOLS,
  type ClaudeRunResult,
} from './claude.js'
import { transcriptUrl, type Config } from './config.js'
import type { FleetTask, PrFacts } from './fleetTask.js'
import { errorMessage, type Logger } from './log.js'
import { evaluateMerge } from './merge.js'
import {
  buttonBlocks,
  codeBlock,
  mrkdwnEscape,
  type SlackClient,
} from './slack.js'
import type { JobRecord, Store, ThreadRecord } from './store.js'
import { renderStatus, type Step, type StatusView } from './status.js'
import { humanText, ProgressTracker } from './summarise.js'
import {
  parseTurnVerdict,
  type IssueClose,
  type TurnVerdict,
} from './verdict.js'

export interface IssueRef {
  number: number
  title: string
  body?: string | null
  url: string
}

export interface TaskRequest {
  channel: string
  threadTs: string
  userId: string
  text: string
  issue?: IssueRef
  source: 'mention' | 'dm' | 'intake'
  /** The message that asked (gets a ✅ or ❌ reaction when the turn ends). */
  messageTs?: string
}

export interface RunnerDeps {
  cfg: Config
  store: Store
  fleet: FleetTask
  slack: SlackClient
  log: Logger
  lib: TranscriptLib
  /** INSTRUCTIONS.md, read per run so edits apply without a restart. */
  instructions: () => string
  now?: () => Date
}

const RUN_TIMEOUT_MS = 60 * 60 * 1000
/** Jobs whose branch and PR are done with: the thread no longer carries them. */
const FINISHED: ReadonlySet<string> = new Set(['merged', 'closed'])

function runStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

export function shortTitle(text: string, fallback = 'task'): string {
  const flat = text
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!flat) return fallback
  return flat.length > 72 ? `${flat.slice(0, 71)}…` : flat
}

/** The worktree of a thread: one stable path per conversation. */
export function threadWorktree(
  base: string,
  channel: string,
  threadTs: string,
): string {
  return path.join(base, `slack-${channel}-${threadTs.replace(/\./g, '-')}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    t.unref?.()
  })
}

export class TaskRunner {
  private busy = new Set<string>()
  private active = 0
  private waiters: (() => void)[] = []
  /** One CI wait per PR; a newer wait, a click or a hold retires the older one. */
  private mergeGen = new Map<number, number>()
  private mergeWaits = new Map<number, Promise<void>>()

  constructor(private d: RunnerDeps) {}

  private key(channel: string, threadTs: string): string {
    return `${channel}:${threadTs}`
  }

  isBusy(channel: string, threadTs: string): boolean {
    return this.busy.has(this.key(channel, threadTs))
  }

  activeCount(): number {
    return this.active
  }

  /** The CI wait running for a PR, if any (tests await it). */
  pendingMerge(prNumber: number): Promise<void> | undefined {
    return this.mergeWaits.get(prNumber)
  }

  /** After a restart: pick the CI waits up again for every PR still open. */
  resumeMergeWaits(): void {
    for (const job of this.d.store.listOpenJobs()) this.startMergeWait(job)
  }

  // ─── entry points ────────────────────────────────────────────────────────

  /** A new conversation in a thread: record it and run the first turn. */
  async start(req: TaskRequest): Promise<void> {
    const { store } = this.d
    const title = req.issue
      ? `#${req.issue.number} ${shortTitle(req.issue.title)}`
      : shortTitle(req.text)
    const thread = store.createThread({
      channel: req.channel,
      threadTs: req.threadTs,
      kind: 'task',
      title,
      requestedBy: req.userId,
      state: 'new',
      issueNumber: req.issue?.number,
    })
    await this.turn(thread, this.firstPrompt(req), {
      resume: false,
      userId: req.userId,
      messageTs: req.messageTs,
    })
  }

  /** A reply in a thread: resume the session with the reply as the prompt. */
  async reply(
    thread: ThreadRecord,
    text: string,
    userId: string,
    messageTs?: string,
  ): Promise<void> {
    if (!thread.sessionId) {
      await this.d.slack.post({
        channel: thread.channel,
        threadTs: thread.threadTs,
        text: 'No session to resume here; mention me with the task again.',
      })
      return
    }
    const prompt = `Reply from <@${userId}> in the Slack thread:\n\n${text}\n\nContinue accordingly and end with the fenced JSON block.`
    await this.turn(thread, prompt, { resume: true, userId, messageTs })
  }

  // ─── prompts ─────────────────────────────────────────────────────────────

  private firstPrompt(req: TaskRequest): string {
    const lines: string[] = []
    if (req.issue) {
      lines.push(
        `Work on GitHub issue #${req.issue.number}: ${req.issue.title}`,
      )
      lines.push(req.issue.url)
      lines.push('')
      lines.push('---')
      lines.push(req.issue.body || '(no body)')
      lines.push('---')
      lines.push('')
      if (req.text.trim())
        lines.push(`Instructions from <@${req.userId}>: ${req.text.trim()}`)
    } else {
      lines.push(`Message from <@${req.userId}> in Slack:`)
      lines.push('')
      lines.push(req.text.trim())
    }
    return lines.join('\n') + '\n'
  }

  private memoryNote(): string {
    const file = path.join(this.d.cfg.memoryDir, 'MEMORY.md')
    let body = ''
    try {
      body = fs.readFileSync(file, 'utf8').trim().slice(0, 6000)
    } catch {
      body = ''
    }
    return [
      `- Your memory lives in ${this.d.cfg.memoryDir} (index ${file}); it is shared by every thread and survives restarts. Keep standing preferences the maintainers state there, in a few lines; write it with the Write tool.`,
      body
        ? `- Your MEMORY.md right now:\n\n${body}`
        : '- Your MEMORY.md is empty.',
    ].join('\n')
  }

  private systemPrompt(thread: ThreadRecord): string {
    const now = (this.d.now ?? (() => new Date()))()
    const jobs = this.d.store.listJobs(thread.channel, thread.threadTs)
    return [
      this.d.instructions(),
      '',
      '## This thread',
      '',
      `- Repository: ${this.d.cfg.repo}; you are in the thread's git worktree at ${thread.worktree} on branch ${thread.branch}, created from origin/${this.d.cfg.baseBranch}.`,
      `- The human is <@${thread.requestedBy}> in Slack; your final message of each turn is posted to the thread as is, so write it for them, short.`,
      `- Date: ${now.toISOString().slice(0, 10)}. Run id: ${thread.runDir ? path.basename(thread.runDir) : 'n/a'}.`,
      thread.issueNumber ? `- Linked issue: #${thread.issueNumber}.` : '',
      thread.prUrl && !FINISHED.has(thread.state)
        ? `- Your current change is open as ${thread.prUrl}; more edits that end with done land on the same branch and PR.`
        : '',
      jobs.length
        ? `- Shipped earlier in this thread: ${jobs
            .map((j) => `${j.prUrl} (${j.state})`)
            .join(', ')}. A new change starts on a fresh branch.`
        : '',
      this.memoryNote(),
    ]
      .filter((l) => l !== '')
      .join('\n')
  }

  // ─── concurrency ─────────────────────────────────────────────────────────

  private async acquireSlot(thread: ThreadRecord): Promise<void> {
    if (this.active < this.d.cfg.maxConcurrentTasks) {
      this.active += 1
      return
    }
    this.d.store.updateThread(thread.channel, thread.threadTs, {
      state: 'queued',
    })
    await this.d.slack.post({
      channel: thread.channel,
      threadTs: thread.threadTs,
      text: `Queued behind ${this.active} running task${this.active === 1 ? '' : 's'}.`,
    })
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    this.active += 1
  }

  private releaseSlot(): void {
    this.active = Math.max(0, this.active - 1)
    const next = this.waiters.shift()
    if (next) next()
  }

  // ─── one turn (and the chain it may start) ──────────────────────────────

  private async turn(
    threadIn: ThreadRecord,
    prompt: string,
    opts: { resume: boolean; userId: string; messageTs?: string },
  ): Promise<void> {
    const { store, slack, log } = this.d
    const key = this.key(threadIn.channel, threadIn.threadTs)
    if (this.busy.has(key)) {
      await slack.post({
        channel: threadIn.channel,
        threadTs: threadIn.threadTs,
        text: 'Still on the previous message; send that again when I have answered.',
      })
      return
    }
    this.busy.add(key)
    let thread = threadIn
    let ok = false
    try {
      await this.acquireSlot(thread)
      try {
        let nextPrompt: string | undefined = prompt
        let resume = opts.resume
        let chain = 0
        while (nextPrompt) {
          // A chained step is a new job: the previous one is on its own PR.
          thread = await this.ensureWorkspace(thread, chain > 0)
          const outcome = await this.oneTurn(thread, nextPrompt, resume)
          thread = store.getThread(thread.channel, thread.threadTs) || thread
          nextPrompt = undefined
          resume = true
          ok = !outcome.failed
          if (outcome.next && outcome.prUrl) {
            chain += 1
            if (chain >= this.d.cfg.maxChain) {
              await slack.post({
                channel: thread.channel,
                threadTs: thread.threadTs,
                text: `${chain} changes shipped in a row; stopping here. Next would be: ${mrkdwnEscape(outcome.next)}. Say go on.`,
              })
              break
            }
            nextPrompt = `Shipped as ${outcome.prUrl}. Go on with the next step you named: ${outcome.next}\n\nEnd with the fenced JSON block as usual (with "next" again if there is more after that).`
          }
        }
      } finally {
        this.releaseSlot()
      }
    } catch (err) {
      log.error('turn failed', { thread: key, error: errorMessage(err) })
      store.updateThread(thread.channel, thread.threadTs, { state: 'error' })
      await slack
        .post({
          channel: thread.channel,
          threadTs: thread.threadTs,
          text: `❌ Error on my side: ${mrkdwnEscape(errorMessage(err)).slice(0, 600)}\nReply to retry.`,
        })
        .catch(() => undefined)
      await this.setStatus(thread, { finished: 'error' }).catch(() => undefined)
      if (thread.runDir) {
        await this.d.fleet.postSignal(
          'harness',
          `Slack thread ${thread.title}: ${errorMessage(err)}`,
          thread.runDir,
        )
        await this.d.fleet
          .finish('error', thread.runDir, {
            issue: thread.issueNumber,
            sessionId: thread.sessionId,
          })
          .catch(() => undefined)
      }
    } finally {
      this.busy.delete(key)
      if (opts.messageTs) {
        await slack
          .react({
            channel: thread.channel,
            ts: opts.messageTs,
            name: ok ? 'white_check_mark' : 'x',
          })
          .catch(() => undefined)
      }
    }
  }

  /** Run Claude once, then act on how it ended. Resolves with what the chain needs. */
  private async oneTurn(
    threadIn: ThreadRecord,
    prompt: string,
    resume: boolean,
  ): Promise<{ next?: string; prUrl?: string; failed?: boolean }> {
    const { store, fleet } = this.d
    let thread = threadIn
    store.updateThread(thread.channel, thread.threadTs, { state: 'working' })
    const res = await this.runClaudeTurn(
      thread,
      prompt,
      resume ? thread.sessionId : undefined,
    )
    thread = store.getThread(thread.channel, thread.threadTs) || thread
    if (res.isError) {
      await this.failTurn(thread, res)
      return { failed: true }
    }
    const patch = await fleet.stage(
      thread.worktree as string,
      thread.runDir as string,
    )
    // Staged edits, or a commit a failed push left behind (a retry ships it).
    const ahead = thread.prUrl
      ? { count: 0, sha: '' }
      : await fleet.ahead(thread.worktree as string, thread.runDir as string)
    const hasChanges = patch.trim() !== '' || ahead.count > 0
    const verdict = parseTurnVerdict(res.text, hasChanges)
    await this.postClaudeText(thread, res.text)
    if (verdict.close.length) await this.closeIssues(thread, verdict.close)
    if (verdict.status === 'done' && !hasChanges) {
      // Nothing to ship: a chat turn, or closes only.
      verdict.status = 'stop'
    }
    if (verdict.status === 'question') {
      store.updateThread(thread.channel, thread.threadTs, { state: 'waiting' })
      if (thread.statusTs || hasChanges) {
        await this.setStatus(
          thread,
          {
            current: 'waiting',
            done: [
              'understanding',
              ...(hasChanges ? (['working'] as Step[]) : []),
            ],
            note: hasChanges ? 'uncommitted changes wait in the worktree' : '',
          },
          hasChanges,
        )
      }
      return {}
    }
    if (verdict.status === 'stop') {
      await this.idle(thread, verdict)
      return {}
    }
    const prUrl = await this.ship(thread, verdict)
    return { next: verdict.next, prUrl, failed: !prUrl }
  }

  // ─── workspace: one worktree per thread, one branch + run dir per job ───

  private async ensureWorkspace(
    threadIn: ThreadRecord,
    forceNewJob = false,
  ): Promise<ThreadRecord> {
    const { cfg, store, fleet } = this.d
    let thread = threadIn
    const now = (this.d.now ?? (() => new Date()))()
    const stamp = runStamp(now)
    const worktree = threadWorktree(
      cfg.worktreeBase,
      thread.channel,
      thread.threadTs,
    )
    const newJob = forceNewJob || !thread.runDir || FINISHED.has(thread.state)
    const runDir = newJob
      ? path.join(cfg.runsDir, `${stamp}-slack`)
      : (thread.runDir as string)
    // The linked issue belongs to the first job; a later job in the thread is something else.
    const issueNumber = newJob && thread.prUrl ? undefined : thread.issueNumber
    const branch = newJob
      ? `fleet/slack-${stamp}${issueNumber ? `-${issueNumber}` : ''}`
      : (thread.branch as string)
    if (newJob) {
      await fleet.initRun('slack', runDir)
      fs.writeFileSync(
        path.join(runDir, 'result-extra.json'),
        JSON.stringify({
          mode: 'slack',
          slack_channel: thread.channel,
          slack_thread_ts: thread.threadTs,
          requested_by: thread.requestedBy,
        }) + '\n',
      )
    }
    if (!fs.existsSync(worktree)) {
      // First job of the thread, or the worktree was swept while idle: a
      // worktree on the job's branch (a swept branch is recreated from main).
      await fleet.worktreeRemove(worktree, newJob ? undefined : branch, runDir)
      await fleet.worktreeAdd(branch, worktree, runDir)
    } else if (newJob) {
      await fleet.branchNew(worktree, branch, runDir)
    }
    fs.writeFileSync(path.join(runDir, 'worktree-path'), worktree + '\n')
    if (newJob || thread.worktree !== worktree) {
      this.d.log.info('workspace ready', { runDir, worktree, branch, newJob })
      thread = store.updateThread(thread.channel, thread.threadTs, {
        runDir,
        worktree,
        branch,
        state: 'working',
        ...(newJob
          ? {
              prNumber: undefined,
              prUrl: undefined,
              statusTs: undefined,
              issueNumber,
            }
          : {}),
      }) || { ...thread, runDir, worktree, branch }
    }
    return thread
  }

  // ─── the Claude call ─────────────────────────────────────────────────────

  private async runClaudeTurn(
    thread: ThreadRecord,
    prompt: string,
    resume: string | undefined,
    statusBase: Partial<StatusView> = {
      current: 'working',
      done: ['understanding'],
    },
  ): Promise<ClaudeRunResult> {
    const { cfg, store, lib, log } = this.d
    const runDir = thread.runDir as string
    const n =
      fs
        .readdirSync(runDir)
        .filter((f) => /^claude-output(-\d+)?\.json$/.test(f)).length + 1
    const promptFile = path.join(
      runDir,
      n === 1 ? 'prompt.md' : `prompt-${n}.md`,
    )
    fs.writeFileSync(promptFile, prompt)
    // Progress is one edited line on the status message, which appears once
    // Claude starts using tools (a plain answer gets no status at all).
    const tracker = new ProgressTracker(lib.describeToolUse)
    let lastNote = ''
    const tick = async () => {
      const note = tracker.line()
      if (!note || note === lastNote) return
      lastNote = note
      await this.setStatus(thread, { ...statusBase, note }, true)
    }
    const timer =
      cfg.progressIntervalMs > 0
        ? setInterval(() => void tick(), cfg.progressIntervalMs)
        : undefined
    timer?.unref?.()
    const env = { ...cfg.env, ...(await this.d.fleet.tokenEnv()) }
    const literals = lib.secretLiterals(env)
    const res = await runClaude({
      bin: cfg.claudeBin,
      cwd: thread.worktree as string,
      prompt,
      systemPrompt: this.systemPrompt(thread),
      resume,
      maxTurns: cfg.maxTurns,
      model: cfg.claudeModel,
      allowedTools: TASK_ALLOWED_TOOLS,
      disallowedTools: TASK_DISALLOWED_TOOLS,
      env,
      transcriptPath: path.join(runDir, 'transcript.jsonl'),
      outputPath: path.join(
        runDir,
        n === 1 ? 'claude-output.json' : `claude-output-${n}.json`,
      ),
      stderrPath: path.join(runDir, 'claude-stderr.txt'),
      invocationsPath: path.join(runDir, 'claude-invocations.txt'),
      scrub: (line) => lib.scrubLine(line, literals),
      timeoutMs: RUN_TIMEOUT_MS,
      onEvent: (ev) => tracker.observe(ev),
    })
    if (timer) clearInterval(timer)
    await tick()
    if (res.sessionId && res.sessionId !== thread.sessionId) {
      store.updateThread(thread.channel, thread.threadTs, {
        sessionId: res.sessionId,
      })
    }
    await this.d.fleet.transcriptRender(
      path.join(runDir, 'transcript.jsonl'),
      path.join(runDir, 'transcript.md'),
      `Fleet slack · ${path.basename(runDir)} · ${thread.title}`,
      runDir,
    )
    log.info('claude turn finished', {
      runDir,
      call: n,
      exit: res.exitCode,
      session: res.sessionId,
      error: res.errorMessage,
    })
    return res
  }

  private async failTurn(
    thread: ThreadRecord,
    res: ClaudeRunResult,
  ): Promise<void> {
    const { store, slack, fleet } = this.d
    store.updateThread(thread.channel, thread.threadTs, { state: 'waiting' })
    await slack.post({
      channel: thread.channel,
      threadTs: thread.threadTs,
      text: `❌ Claude Code failed: ${mrkdwnEscape(res.errorMessage || 'unknown error')}. Reply to retry.`,
    })
    await this.setStatus(thread, {
      failed: ['working'],
      done: ['understanding'],
    })
    if (thread.runDir) {
      await fleet.postSignal(
        'claude',
        `Slack thread ${thread.title}: ${res.errorMessage || 'claude failed'}`,
        thread.runDir,
      )
      await fleet
        .finish('error', thread.runDir, {
          issue: thread.issueNumber,
          sessionId: thread.sessionId,
        })
        .catch(() => undefined)
    }
  }

  private async postClaudeText(
    thread: ThreadRecord,
    text: string,
  ): Promise<void> {
    const human = humanText(text)
    if (!human) return
    const limit = 3500
    const body =
      human.length > limit ? `${human.slice(0, limit)}\n… (clipped)` : human
    await this.d.slack.post({
      channel: thread.channel,
      threadTs: thread.threadTs,
      text: body,
    })
  }

  // ─── outcomes ────────────────────────────────────────────────────────────

  /** A turn with nothing to ship: the conversation stays open, the run is recorded. */
  private async idle(
    thread: ThreadRecord,
    verdict: TurnVerdict,
  ): Promise<void> {
    const { store, fleet } = this.d
    store.updateThread(thread.channel, thread.threadTs, { state: 'waiting' })
    if (thread.runDir) {
      await fleet
        .finish('stopped', thread.runDir, {
          issue: thread.issueNumber,
          sessionId: thread.sessionId,
        })
        .catch(() => undefined)
    }
    if (thread.statusTs) {
      await this.setStatus(thread, {
        finished: 'stopped',
        done: ['understanding', 'working'],
        note: verdict.summary || undefined,
      })
    }
  }

  /** Issues Claude marked outdated or fixed: close each with its reason (read back by task.sh). */
  private async closeIssues(
    thread: ThreadRecord,
    list: IssueClose[],
  ): Promise<void> {
    const { cfg, fleet, slack } = this.d
    const lines: string[] = []
    for (const c of list) {
      const file = path.join(
        thread.runDir || cfg.runsDir,
        `issue-close-${c.number}.md`,
      )
      const runLine = thread.runDir
        ? await fleet.runLine('closed', thread.runDir).catch(() => '')
        : ''
      fs.writeFileSync(
        file,
        [
          '**[fleet:slack] closed from Slack**',
          '',
          c.reason,
          '',
          `Requested by Slack user \`${thread.requestedBy}\`.`,
          runLine ? `\n${runLine}` : '',
        ].join('\n') + '\n',
      )
      try {
        await fleet.issueClose(c.number, file, thread.runDir)
        lines.push(`Closed #${c.number}: ${mrkdwnEscape(c.reason)}`)
      } catch (err) {
        lines.push(
          `Could not close #${c.number}: ${mrkdwnEscape(errorMessage(err)).slice(0, 300)}`,
        )
      }
    }
    if (lines.length)
      await slack.post({
        channel: thread.channel,
        threadTs: thread.threadTs,
        text: lines.join('\n'),
      })
  }

  /** Gate, commit, push, PR; resolves with the PR URL, or undefined when the gate stayed red. */
  private async ship(
    threadIn: ThreadRecord,
    verdict: TurnVerdict,
  ): Promise<string | undefined> {
    const { cfg, store, fleet, slack } = this.d
    let thread = threadIn
    const runDir = thread.runDir as string
    const worktree = thread.worktree as string
    let tier1 = await fleet.tier1(worktree, runDir)
    const changed = await fleet.changedLines(worktree, runDir)
    const warnings: string[] = []
    if (tier1.length)
      warnings.push(`Tier 1: ${tier1.join('; ')}. This PR needs a human merge.`)
    if (changed > cfg.maxChangedLines) {
      warnings.push(
        `${changed} changed lines, above the ${cfg.maxChangedLines}-line cap. Review with care.`,
      )
    }

    // Gate, with one repair attempt through the same session.
    store.updateThread(thread.channel, thread.threadTs, { state: 'gate' })
    await this.setStatus(
      thread,
      { current: 'gate', done: ['understanding', 'working'] },
      true,
    )
    const attempt =
      fs.readdirSync(runDir).filter((f) => /^gate-\d+$/.test(f)).length + 1
    let gate = await fleet.gate(
      worktree,
      path.join(runDir, `gate-${attempt}`),
      runDir,
    )
    if (!gate.ok && thread.sessionId) {
      await this.setStatus(thread, {
        current: 'gate',
        done: ['understanding', 'working'],
        note: `gate failed (${gate.summary.join(', ')}); one repair attempt`,
      })
      const retryPrompt = path.join(runDir, `prompt-retry-${attempt}.md`)
      await fleet.gateFailurePrompt(
        path.join(runDir, `gate-${attempt}`),
        retryPrompt,
        runDir,
      )
      const res = await this.runClaudeTurn(
        thread,
        fs.readFileSync(retryPrompt, 'utf8'),
        thread.sessionId,
        { current: 'gate', done: ['understanding', 'working'] },
      )
      thread = store.getThread(thread.channel, thread.threadTs) || thread
      if (!res.isError) {
        await fleet.stage(worktree, runDir)
        tier1 = await fleet.tier1(worktree, runDir)
        gate = await fleet.gate(
          worktree,
          path.join(runDir, `gate-${attempt + 1}`),
          runDir,
        )
      }
    }
    if (!gate.ok) {
      const failed = gate.summary
        .find((l) => l.startsWith('FAIL'))
        ?.split(' ')[1]
      let tail = ''
      if (failed) {
        const dirs = fs
          .readdirSync(runDir)
          .filter((f) => /^gate-\d+$/.test(f))
          .sort()
        const logFile = path.join(
          runDir,
          dirs[dirs.length - 1],
          `${failed}.log`,
        )
        if (fs.existsSync(logFile)) {
          tail = fs
            .readFileSync(logFile, 'utf8')
            .split('\n')
            .slice(-40)
            .join('\n')
        }
      }
      store.updateThread(thread.channel, thread.threadTs, { state: 'waiting' })
      await slack.post({
        channel: thread.channel,
        threadTs: thread.threadTs,
        text: [
          `❌ Gate still red after one repair: ${gate.summary.join(', ')}. Nothing pushed.`,
          tail ? codeBlock(tail, 2500) : '',
          'Reply with guidance, or `stop`.',
        ]
          .filter(Boolean)
          .join('\n'),
      })
      await this.setStatus(thread, {
        failed: ['gate'],
        done: ['understanding', 'working'],
        current: 'waiting',
      })
      await fleet.finish('gate_failed', runDir, {
        issue: thread.issueNumber,
        sessionId: thread.sessionId,
      })
      return undefined
    }

    // Learning (issue-linked jobs, like the fixer), commit, push, PR.
    await this.setStatus(thread, {
      current: 'pr',
      done: ['understanding', 'working', 'gate'],
    })
    const title = verdict.title || thread.title.replace(/^#\d+\s+/, '')
    const summary = verdict.summary || title
    if (thread.issueNumber) {
      const learning = this.writeLearning(thread, worktree, summary)
      await fleet.stage(worktree, runDir)
      fs.writeFileSync(path.join(runDir, 'learning-path'), learning + '\n')
    }
    const commitTitle = `[fleet:slack] ${title}${thread.issueNumber ? ` (signal #${thread.issueNumber})` : ''}`
    const messageFile = path.join(runDir, `commit-message-${attempt}.txt`)
    fs.writeFileSync(
      messageFile,
      [
        commitTitle,
        '',
        summary,
        '',
        `Requested by Slack user ${thread.requestedBy} in thread ${thread.threadTs}.`,
        thread.issueNumber ? `Fixes #${thread.issueNumber}` : '',
        '',
        'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>',
      ]
        .filter((l) => l !== undefined)
        .join('\n') + '\n',
    )
    const staged = (await fleet.stage(worktree, runDir)).trim() !== ''
    const sha = staged
      ? await fleet.commit(worktree, messageFile, runDir)
      : (await fleet.ahead(worktree, runDir)).sha
    await fleet.pushBranch(worktree, thread.branch as string, runDir)

    let prUrl = thread.prUrl
    let prNumber = thread.prNumber
    const permalink = await slack.permalink(thread.channel, thread.threadTs)
    if (!prUrl) {
      const bodyFile = path.join(runDir, 'pr-body.md')
      const runLine = await fleet.runLine('pr_opened', runDir).catch(() => '')
      fs.writeFileSync(
        bodyFile,
        [
          summary,
          '',
          `Requested by Slack user \`${thread.requestedBy}\`${permalink ? ` ([thread](${permalink}))` : ''}; the fleet's Slack agent made the change in a fresh worktree of \`${cfg.baseBranch}\`.`,
          thread.issueNumber ? `\nFixes #${thread.issueNumber}` : '',
          '',
          ...(warnings.length
            ? ['## Review flags', '', ...warnings.map((w) => `- ${w}`), '']
            : []),
          'Gate: lint, type-check, security tests and unit tests passed locally.',
          `Changed lines: ${changed}.`,
          '',
          runLine,
          '',
          '🤖 Generated with [Claude Code](https://claude.com/claude-code) by the fleet Slack agent',
        ].join('\n') + '\n',
      )
      prUrl = await fleet.prCreate(
        thread.branch as string,
        commitTitle,
        bodyFile,
        runDir,
      )
      prNumber = Number(prUrl.split('/').pop())
      store.updateThread(thread.channel, thread.threadTs, { prUrl, prNumber })
    }
    thread =
      store.updateThread(thread.channel, thread.threadTs, {
        state: 'pr_open',
      }) || thread
    fs.writeFileSync(
      path.join(runDir, 'result-extra.json'),
      JSON.stringify({
        mode: 'slack',
        slack_channel: thread.channel,
        slack_thread_ts: thread.threadTs,
        requested_by: thread.requestedBy,
        branch: thread.branch,
        commit: sha,
        changed_lines: changed,
        tier1: tier1,
        learning: fs.existsSync(path.join(runDir, 'learning-path'))
          ? fs.readFileSync(path.join(runDir, 'learning-path'), 'utf8').trim()
          : undefined,
      }) + '\n',
    )
    await fleet.finish(threadIn.prUrl ? 'pr_updated' : 'pr_opened', runDir, {
      issue: thread.issueNumber,
      ref: prUrl,
      sessionId: thread.sessionId,
    })

    const obvious = !tier1.length && changed <= cfg.maxChangedLines
    const autoMerge = obvious && cfg.autoMerge
    const prRef = `<${prUrl}|PR #${prNumber}>`
    const head = threadIn.prUrl
      ? `Pushed \`${sha.slice(0, 7)}\` to ${prRef}.`
      : `Opened ${prRef}: ${mrkdwnEscape(title)}.`
    const flagLines = warnings.map((w) => `⚠️ ${mrkdwnEscape(w)}`)
    const value = {
      channel: thread.channel,
      threadTs: thread.threadTs,
      pr: prNumber,
    }
    await this.setStatus(thread, {
      current: 'waiting',
      done: ['understanding', 'working', 'gate', 'pr'],
      prUrl,
      note: autoMerge ? 'waiting for CI, then merging' : '',
    })
    const job = store.upsertJob({
      channel: thread.channel,
      threadTs: thread.threadTs,
      prNumber: prNumber as number,
      prUrl: prUrl as string,
      runDir,
      branch: thread.branch as string,
      worktree,
      issueNumber: thread.issueNumber,
      statusTs: store.getThread(thread.channel, thread.threadTs)?.statusTs,
      requestedBy: thread.requestedBy,
      state: 'pr_open',
    })
    if (autoMerge) {
      const text = [
        head,
        `${changed} lines · gate green · merging when CI is green.`,
        ...flagLines,
      ].join('\n')
      await slack.post({
        channel: thread.channel,
        threadTs: thread.threadTs,
        text,
        blocks: buttonBlocks(text, [
          { actionId: 'not_now', text: 'Hold', value },
        ]),
      })
      this.startMergeWait(job)
      return prUrl
    }
    const text = [
      head,
      `${changed} lines · gate green.`,
      ...flagLines,
      tier1.length ? 'Tier 1: a human merges this on GitHub.' : 'Merge?',
    ].join('\n')
    await slack.post({
      channel: thread.channel,
      threadTs: thread.threadTs,
      text,
      blocks: buttonBlocks(text, [
        ...(tier1.length
          ? []
          : [
              {
                actionId: 'merge_pr',
                text: 'Merge',
                style: 'primary' as const,
                value,
              },
            ]),
        { actionId: 'not_now', text: 'Not now', value },
      ]),
    })
    return prUrl
  }

  // ─── auto-merge: wait for CI, then merge, unless held ────────────────────

  private startMergeWait(job: JobRecord): void {
    const gen = (this.mergeGen.get(job.prNumber) || 0) + 1
    this.mergeGen.set(job.prNumber, gen)
    const p = this.awaitMerge(job, gen)
      .catch((err) => {
        this.d.log.error('merge wait failed', {
          pr: job.prNumber,
          error: errorMessage(err),
        })
      })
      .finally(() => {
        if (this.mergeWaits.get(job.prNumber) === p)
          this.mergeWaits.delete(job.prNumber)
      })
    this.mergeWaits.set(job.prNumber, p)
  }

  private async awaitMerge(jobIn: JobRecord, gen: number): Promise<void> {
    const { cfg, store, fleet, slack } = this.d
    const deadline = Date.now() + cfg.mergeWaitMs
    for (;;) {
      if (this.mergeGen.get(jobIn.prNumber) !== gen) return
      const job = store.getJob(jobIn.prNumber)
      if (!job || job.state !== 'pr_open') return
      const pr = await fleet.prView(job.prNumber)
      if (pr.state === 'MERGED') {
        await this.recordMerged(job, pr, 'on GitHub')
        return
      }
      if (pr.state !== 'OPEN') {
        await this.recordClosed(job, pr)
        return
      }
      const tier1 = await fleet.tier1Paths(pr.files.map((f) => f.path))
      const decision = evaluateMerge({
        userId: job.requestedBy,
        allowedUserIds: cfg.allowedUserIds,
        pr,
        tier1Violations: tier1,
        baseBranch: cfg.baseBranch,
      })
      if (decision.ok) {
        if (this.mergeGen.get(job.prNumber) !== gen) return
        await fleet.prMerge(pr.number, job.runDir)
        await this.recordMerged(job, pr, 'CI green')
        return
      }
      const timedOut = Date.now() > deadline
      if (!decision.pending || timedOut) {
        const value = {
          channel: job.channel,
          threadTs: job.threadTs,
          pr: pr.number,
        }
        const text = `Not merging <${pr.url}|PR #${pr.number}>: ${decision.reasons.map(mrkdwnEscape).join('; ')}. Reply to fix it, or merge on GitHub.`
        await slack.post({
          channel: job.channel,
          threadTs: job.threadTs,
          text,
          blocks: buttonBlocks(text, [
            { actionId: 'merge_pr', text: 'Merge', value },
            { actionId: 'not_now', text: 'Hold', value },
          ]),
        })
        await this.setJobStatus(job, {
          current: 'waiting',
          done: ['understanding', 'working', 'gate', 'pr'],
          prUrl: pr.url,
          note: timedOut ? 'CI did not finish in time' : 'CI red',
        })
        return
      }
      await sleep(cfg.mergePollIntervalMs)
    }
  }

  /** After a merge (by the wait, the button, or a human on GitHub): close the issue, finish the run. */
  private async recordMerged(
    job: JobRecord,
    pr: PrFacts,
    how: string,
  ): Promise<void> {
    const { cfg, store, fleet, slack, log } = this.d
    log.info('merged', { pr: pr.number, how })
    store.setJobState(job.prNumber, 'merged')
    const thread = store.getThread(job.channel, job.threadTs)
    if (thread?.prNumber === job.prNumber)
      store.updateThread(job.channel, job.threadTs, { state: 'merged' })
    let closed = ''
    if (job.issueNumber) {
      const commentFile = path.join(
        job.runDir || cfg.runsDir,
        `issue-close-${job.issueNumber}.md`,
      )
      fs.writeFileSync(
        commentFile,
        `**[fleet:slack] merged**\n\n${pr.url} was merged (${how}).\n`,
      )
      try {
        await fleet.issueClose(job.issueNumber, commentFile, job.runDir)
        closed = ` Closed #${job.issueNumber}.`
      } catch (err) {
        closed = ` Could not close #${job.issueNumber}: ${errorMessage(err)}`
      }
    }
    await slack.post({
      channel: job.channel,
      threadTs: job.threadTs,
      text: `🎉 Merged <${pr.url}|PR #${pr.number}> (${how}).${closed}`,
    })
    await this.setJobStatus(job, {
      finished: 'merged',
      done: ['understanding', 'working', 'gate', 'pr', 'waiting'],
      prUrl: pr.url,
    })
    if (job.runDir) {
      await fleet
        .finish('merged', job.runDir, {
          issue: job.issueNumber,
          ref: pr.url,
          sessionId: thread?.sessionId,
        })
        .catch(() => undefined)
    }
  }

  private async recordClosed(job: JobRecord, pr: PrFacts): Promise<void> {
    const { store, slack } = this.d
    store.setJobState(job.prNumber, 'closed')
    const thread = store.getThread(job.channel, job.threadTs)
    if (thread?.prNumber === job.prNumber)
      store.updateThread(job.channel, job.threadTs, { state: 'closed' })
    await slack.post({
      channel: job.channel,
      threadTs: job.threadTs,
      text: `<${pr.url}|PR #${pr.number}> was closed on GitHub.`,
    })
    await this.setJobStatus(job, { finished: 'closed', prUrl: pr.url })
  }

  private writeLearning(
    thread: ThreadRecord,
    worktree: string,
    summary: string,
  ): string {
    const date = new Date().toISOString().slice(0, 10)
    const rel = path.join(
      'memos',
      'fleet',
      'learnings',
      `${date}-${thread.issueNumber}.md`,
    )
    const file = path.join(worktree, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const runId = path.basename(thread.runDir as string)
    const url = transcriptUrl(this.d.cfg, runId)
    fs.writeFileSync(
      file,
      [
        `# Slack agent learning: #${thread.issueNumber} ${thread.title.replace(/^#\d+\s+/, '')}`,
        '',
        `- Date: ${new Date().toISOString()}`,
        `- Issue: https://github.com/${this.d.cfg.repo}/issues/${thread.issueNumber}`,
        `- Run: \`${runId}\`, session \`${thread.sessionId || 'none'}\`${url ? `, [transcript](${url})` : ''}`,
        `- Requested in Slack by \`${thread.requestedBy}\``,
        '',
        '## Fix',
        '',
        summary,
        '',
      ].join('\n'),
    )
    return rel
  }

  // ─── buttons ─────────────────────────────────────────────────────────────

  async merge(prNumber: number, userId: string): Promise<void> {
    const { cfg, store, fleet, slack } = this.d
    const job = store.getJob(prNumber)
    if (!job) return
    const pr = await fleet.prView(prNumber)
    if (pr.state === 'MERGED') {
      if (job.state !== 'merged') await this.recordMerged(job, pr, 'on GitHub')
      return
    }
    const tier1 = await fleet.tier1Paths(pr.files.map((f) => f.path))
    const decision = evaluateMerge({
      userId,
      allowedUserIds: cfg.allowedUserIds,
      pr,
      tier1Violations: tier1,
      baseBranch: cfg.baseBranch,
    })
    if (!decision.ok) {
      await slack.post({
        channel: job.channel,
        threadTs: job.threadTs,
        text: `${decision.pending ? '⏳' : '🚫'} Not merging <${pr.url}|PR #${pr.number}>: ${decision.reasons.map(mrkdwnEscape).join('; ')}.${decision.pending ? ' Click Merge again later.' : ''}`,
      })
      return
    }
    // A click retires any CI wait for the PR.
    this.mergeGen.set(prNumber, (this.mergeGen.get(prNumber) || 0) + 1)
    await fleet.prMerge(pr.number, job.runDir)
    await this.recordMerged(job, pr, `by <@${userId}>`)
  }

  async notNow(prNumber: number, userId: string): Promise<void> {
    const { store, slack } = this.d
    this.mergeGen.set(prNumber, (this.mergeGen.get(prNumber) || 0) + 1)
    const job = store.getJob(prNumber)
    if (!job) return
    if (job.state === 'pr_open') {
      store.setJobState(prNumber, 'held')
      const thread = store.getThread(job.channel, job.threadTs)
      if (thread?.prNumber === prNumber)
        store.updateThread(job.channel, job.threadTs, { state: 'held' })
    }
    await slack.post({
      channel: job.channel,
      threadTs: job.threadTs,
      text: `OK <@${userId}>, holding <${job.prUrl}|the PR>. Reply to change it, click Merge, or merge on GitHub.`,
    })
  }

  // ─── housekeeping ────────────────────────────────────────────────────────

  /** Remove the worktrees of threads idle for longer than ttlMs; sessions and branches stay. */
  async sweepIdleWorktrees(ttlMs: number): Promise<number> {
    const { store, fleet } = this.d
    const cutoff = Date.now() - ttlMs
    let removed = 0
    for (const t of store.listThreads()) {
      if (!t.worktree || !fs.existsSync(t.worktree)) continue
      if (Date.parse(t.updatedAt) > cutoff) continue
      if (this.isBusy(t.channel, t.threadTs)) continue
      await fleet.worktreeRemove(t.worktree, undefined, t.runDir)
      removed += 1
    }
    return removed
  }

  /** The thread's status message (created on first use when `create`), edited as the job moves. */
  private async setStatus(
    thread: ThreadRecord,
    view: Partial<StatusView>,
    create = false,
  ): Promise<void> {
    const fresh =
      this.d.store.getThread(thread.channel, thread.threadTs) || thread
    const runId = fresh.runDir ? path.basename(fresh.runDir) : undefined
    const text = renderStatus({
      title: fresh.title,
      runId,
      prUrl: fresh.prUrl,
      transcriptUrl: runId ? transcriptUrl(this.d.cfg, runId) : undefined,
      ...view,
    })
    if (!fresh.statusTs) {
      if (!create) return
      const posted = await this.d.slack.post({
        channel: fresh.channel,
        threadTs: fresh.threadTs,
        text,
      })
      this.d.store.updateThread(fresh.channel, fresh.threadTs, {
        statusTs: posted.ts,
      })
      return
    }
    await this.d.slack
      .update({ channel: fresh.channel, ts: fresh.statusTs, text })
      .catch((err) => {
        this.d.log.warn('status update failed', { error: errorMessage(err) })
      })
  }

  /** A finished job's status message, which may no longer be the thread's current one. */
  private async setJobStatus(
    job: JobRecord,
    view: Partial<StatusView>,
  ): Promise<void> {
    if (!job.statusTs) return
    const thread = this.d.store.getThread(job.channel, job.threadTs)
    const runId = path.basename(job.runDir)
    const text = renderStatus({
      title: thread?.title || `PR #${job.prNumber}`,
      runId,
      prUrl: job.prUrl,
      transcriptUrl: transcriptUrl(this.d.cfg, runId),
      ...view,
    })
    await this.d.slack
      .update({ channel: job.channel, ts: job.statusTs, text })
      .catch((err) => {
        this.d.log.warn('status update failed', { error: errorMessage(err) })
      })
  }
}
