// One Slack thread = one task = one run directory, one git worktree, one
// Claude Code session. A turn runs `claude -p` (resuming the session after the
// first), reads how it ended (done / question / stop), and on `done` ships
// through the fixer's machinery: stage, Tier 1 check, gate (one repair
// attempt), commit, push, PR, read-back, result.json, metrics.
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
import type { Store, ThreadRecord } from './store.js'
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
  /** One CI wait per thread; a newer wait (or a new turn) retires the older one. */
  private mergeGen = new Map<string, number>()
  private mergeWaits = new Map<string, Promise<void>>()

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

  /** The CI wait running for a thread, if any (tests await it). */
  pendingMerge(channel: string, threadTs: string): Promise<void> | undefined {
    return this.mergeWaits.get(this.key(channel, threadTs))
  }

  // ─── entry points ────────────────────────────────────────────────────────

  /** A new task in a thread: record it, post the status message, run the first turn. */
  async start(req: TaskRequest): Promise<void> {
    const { store, slack } = this.d
    const title = req.issue
      ? `#${req.issue.number} ${shortTitle(req.issue.title)}`
      : shortTitle(req.text)
    let thread = store.createThread({
      channel: req.channel,
      threadTs: req.threadTs,
      kind: 'task',
      title,
      requestedBy: req.userId,
      state: 'new',
      issueNumber: req.issue?.number,
    })
    const status = await slack.post({
      channel: req.channel,
      threadTs: req.threadTs,
      text: renderStatus({ title, current: 'understanding' }),
    })
    thread =
      store.updateThread(req.channel, req.threadTs, { statusTs: status.ts }) ||
      thread
    const prompt = this.firstPrompt(req)
    await this.turn(thread, prompt, { resume: false, userId: req.userId })
  }

  /** A reply in a task thread: resume the session with the reply as the prompt. */
  async reply(
    thread: ThreadRecord,
    text: string,
    userId: string,
  ): Promise<void> {
    if (!thread.sessionId) {
      await this.d.slack.post({
        channel: thread.channel,
        threadTs: thread.threadTs,
        text: 'No session to resume here; mention me with the task again.',
      })
      return
    }
    const prompt = `Reply from <@${userId}> in the Slack thread:\n\n${text}\n\nContinue the task accordingly and end with the fenced JSON block.`
    await this.turn(thread, prompt, { resume: true, userId })
  }

  // ─── one Claude turn ─────────────────────────────────────────────────────

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
      lines.push(`Request from <@${req.userId}> in Slack:`)
      lines.push('')
      lines.push(req.text.trim())
    }
    return lines.join('\n') + '\n'
  }

  private systemPrompt(thread: ThreadRecord): string {
    const now = (this.d.now ?? (() => new Date()))()
    return [
      this.d.instructions(),
      '',
      '## This run',
      '',
      `- Repository: ${this.d.cfg.repo}; you are in a fresh git worktree at ${thread.worktree} on branch ${thread.branch}, created from origin/${this.d.cfg.baseBranch}.`,
      `- The human is <@${thread.requestedBy}> in Slack; your final message of each turn is posted to the thread as is, so write it for them, short.`,
      `- Date: ${now.toISOString().slice(0, 10)}. Run id: ${thread.runDir ? path.basename(thread.runDir) : 'n/a'}.`,
      thread.issueNumber ? `- Linked issue: #${thread.issueNumber}.` : '',
      thread.prUrl
        ? `- A PR already exists for this thread: ${thread.prUrl}; further changes land on the same branch.`
        : '',
    ]
      .filter((l) => l !== undefined)
      .join('\n')
  }

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

  private async turn(
    threadIn: ThreadRecord,
    prompt: string,
    opts: { resume: boolean; userId: string },
  ): Promise<void> {
    const { cfg, store, fleet, slack, log } = this.d
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
    this.mergeGen.set(key, (this.mergeGen.get(key) || 0) + 1)
    let thread = threadIn
    try {
      await this.acquireSlot(thread)
      try {
        thread = await this.ensureWorkspace(thread)
        await this.setStatus(thread, {
          current: 'working',
          done: ['understanding'],
        })
        const res = await this.runClaudeTurn(
          thread,
          prompt,
          opts.resume ? thread.sessionId : undefined,
        )
        thread = store.getThread(thread.channel, thread.threadTs) || thread
        if (res.isError) {
          await this.failTurn(thread, res)
          return
        }
        const patch = await fleet.stage(
          thread.worktree as string,
          thread.runDir as string,
        )
        const hasChanges = patch.trim() !== ''
        const verdict = parseTurnVerdict(res.text, hasChanges)
        await this.postClaudeText(thread, res.text)
        if (verdict.close.length) await this.closeIssues(thread, verdict.close)
        if (verdict.status === 'done' && !hasChanges) {
          if (verdict.close.length) {
            verdict.status = 'stop'
          } else {
            await slack.post({
              channel: thread.channel,
              threadTs: thread.threadTs,
              text: 'No files changed, so nothing to ship. Say what you want, or `stop`.',
            })
            verdict.status = 'question'
          }
        }
        if (verdict.status === 'question') {
          store.updateThread(thread.channel, thread.threadTs, {
            state: 'waiting',
          })
          await this.setStatus(thread, {
            current: 'waiting',
            done: [
              'understanding',
              ...(hasChanges ? (['working'] as Step[]) : []),
            ],
            note: hasChanges
              ? 'Uncommitted changes are waiting in the worktree.'
              : undefined,
          })
          return
        }
        if (verdict.status === 'stop') {
          await this.stop(thread, verdict)
          return
        }
        await this.ship(thread, verdict)
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
        await fleet.postSignal(
          'harness',
          `Slack task ${thread.title}: ${errorMessage(err)}`,
          thread.runDir,
        )
        await fleet
          .finish('error', thread.runDir, {
            issue: thread.issueNumber,
            sessionId: thread.sessionId,
          })
          .catch(() => undefined)
      }
    } finally {
      this.busy.delete(key)
    }
  }

  /** Run directory + worktree on the first turn; both persist for the thread's life. */
  private async ensureWorkspace(thread: ThreadRecord): Promise<ThreadRecord> {
    const { cfg, store, fleet } = this.d
    if (thread.runDir && thread.worktree && fs.existsSync(thread.worktree))
      return thread
    const now = (this.d.now ?? (() => new Date()))()
    const stamp = runStamp(now)
    const runDir = thread.runDir || path.join(cfg.runsDir, `${stamp}-slack`)
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
    const branch =
      thread.branch ||
      `fleet/slack-${stamp}${thread.issueNumber ? `-${thread.issueNumber}` : ''}`
    const worktree = path.join(cfg.worktreeBase, path.basename(runDir))
    if (fs.existsSync(worktree))
      await fleet.worktreeRemove(worktree, undefined, runDir)
    const base = await fleet.worktreeAdd(branch, worktree, runDir)
    fs.writeFileSync(path.join(runDir, 'worktree-path'), worktree + '\n')
    this.d.log.info('workspace ready', { runDir, worktree, branch, base })
    return (
      store.updateThread(thread.channel, thread.threadTs, {
        runDir,
        worktree,
        branch,
        state: 'working',
      }) || { ...thread, runDir, worktree, branch }
    )
  }

  private async runClaudeTurn(
    thread: ThreadRecord,
    prompt: string,
    resume: string | undefined,
    statusBase: Partial<StatusView> = {
      current: 'working',
      done: ['understanding'],
    },
  ): Promise<ClaudeRunResult> {
    const { cfg, store, slack, lib, log } = this.d
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
    // Progress goes into the status message's note line, throttled, not into
    // the thread: one edited line instead of a message per tool call.
    const tracker = new ProgressTracker(lib.describeToolUse)
    let lastNote = ''
    const tick = async () => {
      const note = tracker.line()
      if (!note || note === lastNote) return
      lastNote = note
      await this.setStatus(thread, { ...statusBase, note })
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
        `Slack task ${thread.title}: ${res.errorMessage || 'claude failed'}`,
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

  private async stop(
    thread: ThreadRecord,
    verdict: TurnVerdict,
  ): Promise<void> {
    const { store, fleet } = this.d
    const runDir = thread.runDir as string
    await fleet.finish('stopped', runDir, {
      issue: thread.issueNumber,
      sessionId: thread.sessionId,
    })
    await this.cleanupWorktree(thread)
    store.updateThread(thread.channel, thread.threadTs, { state: 'closed' })
    await this.setStatus(thread, {
      finished: 'stopped',
      done: ['understanding', 'working'],
      note: verdict.summary || undefined,
    })
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

  private async ship(
    threadIn: ThreadRecord,
    verdict: TurnVerdict,
  ): Promise<void> {
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
    await this.setStatus(thread, {
      current: 'gate',
      done: ['understanding', 'working'],
    })
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
      return
    }

    // Learning (issue-linked tasks, like the fixer), commit, push, PR.
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
    const sha = await fleet.commit(worktree, messageFile, runDir)
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
    if (obvious && cfg.autoMerge) {
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
      await this.setStatus(thread, {
        current: 'waiting',
        done: ['understanding', 'working', 'gate', 'pr'],
        prUrl,
        note: 'waiting for CI, then merging',
      })
      this.startMergeWait(thread)
      return
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
    await this.setStatus(thread, {
      current: 'waiting',
      done: ['understanding', 'working', 'gate', 'pr'],
      prUrl,
    })
  }

  // ─── auto-merge: wait for CI, then merge, unless held ────────────────────

  private startMergeWait(thread: ThreadRecord): void {
    const key = this.key(thread.channel, thread.threadTs)
    const gen = (this.mergeGen.get(key) || 0) + 1
    this.mergeGen.set(key, gen)
    const p = this.awaitMerge(thread, gen)
      .catch((err) => {
        this.d.log.error('merge wait failed', {
          thread: key,
          error: errorMessage(err),
        })
      })
      .finally(() => {
        if (this.mergeWaits.get(key) === p) this.mergeWaits.delete(key)
      })
    this.mergeWaits.set(key, p)
  }

  private async awaitMerge(thread: ThreadRecord, gen: number): Promise<void> {
    const { cfg, store, fleet, slack } = this.d
    const key = this.key(thread.channel, thread.threadTs)
    const deadline = Date.now() + cfg.mergeWaitMs
    for (;;) {
      if (this.mergeGen.get(key) !== gen) return
      const fresh = store.getThread(thread.channel, thread.threadTs)
      if (!fresh || fresh.state !== 'pr_open' || !fresh.prNumber) return
      const pr = await fleet.prView(fresh.prNumber)
      if (pr.state === 'MERGED') {
        await this.recordMerged(fresh, pr, 'on GitHub')
        return
      }
      if (pr.state !== 'OPEN') {
        store.updateThread(fresh.channel, fresh.threadTs, { state: 'closed' })
        await slack.post({
          channel: fresh.channel,
          threadTs: fresh.threadTs,
          text: `<${pr.url}|PR #${pr.number}> was closed on GitHub.`,
        })
        await this.setStatus(fresh, { finished: 'closed' })
        return
      }
      const tier1 = await fleet.tier1Paths(pr.files.map((f) => f.path))
      const decision = evaluateMerge({
        userId: fresh.requestedBy,
        allowedUserIds: cfg.allowedUserIds,
        pr,
        tier1Violations: tier1,
        baseBranch: cfg.baseBranch,
      })
      if (decision.ok) {
        if (this.mergeGen.get(key) !== gen) return
        await fleet.prMerge(pr.number, fresh.runDir)
        await this.recordMerged(fresh, pr, 'CI green')
        return
      }
      const timedOut = Date.now() > deadline
      if (!decision.pending || timedOut) {
        const value = {
          channel: fresh.channel,
          threadTs: fresh.threadTs,
          pr: pr.number,
        }
        const text = `Not merging <${pr.url}|PR #${pr.number}>: ${decision.reasons.map(mrkdwnEscape).join('; ')}. Reply to fix it, or merge on GitHub.`
        await slack.post({
          channel: fresh.channel,
          threadTs: fresh.threadTs,
          text,
          blocks: buttonBlocks(text, [
            { actionId: 'merge_pr', text: 'Merge', value },
            { actionId: 'not_now', text: 'Hold', value },
          ]),
        })
        await this.setStatus(fresh, {
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

  /** After a merge (by the wait, the button, or a human on GitHub): close the issue, finish the run, clean up. */
  private async recordMerged(
    thread: ThreadRecord,
    pr: PrFacts,
    how: string,
  ): Promise<void> {
    const { cfg, store, fleet, slack, log } = this.d
    log.info('merged', { pr: pr.number, how })
    store.updateThread(thread.channel, thread.threadTs, { state: 'merged' })
    let closed = ''
    if (thread.issueNumber) {
      const commentFile = path.join(
        thread.runDir || cfg.runsDir,
        `issue-close-${thread.issueNumber}.md`,
      )
      fs.writeFileSync(
        commentFile,
        `**[fleet:slack] merged**\n\n${pr.url} was merged (${how}).\n`,
      )
      try {
        await fleet.issueClose(thread.issueNumber, commentFile, thread.runDir)
        closed = ` Closed #${thread.issueNumber}.`
      } catch (err) {
        closed = ` Could not close #${thread.issueNumber}: ${errorMessage(err)}`
      }
    }
    await slack.post({
      channel: thread.channel,
      threadTs: thread.threadTs,
      text: `🎉 Merged <${pr.url}|PR #${pr.number}> (${how}).${closed}`,
    })
    await this.setStatus(thread, {
      finished: 'merged',
      done: ['understanding', 'working', 'gate', 'pr', 'waiting'],
      prUrl: pr.url,
    })
    if (thread.runDir) {
      await fleet
        .finish('merged', thread.runDir, {
          issue: thread.issueNumber,
          ref: pr.url,
          sessionId: thread.sessionId,
        })
        .catch(() => undefined)
    }
    await this.cleanupWorktree(thread)
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

  // ─── merge flow ──────────────────────────────────────────────────────────

  async merge(thread: ThreadRecord, userId: string): Promise<void> {
    const { cfg, fleet, slack } = this.d
    if (!thread.prNumber) {
      await slack.post({
        channel: thread.channel,
        threadTs: thread.threadTs,
        text: 'No PR to merge in this thread.',
      })
      return
    }
    const pr = await fleet.prView(thread.prNumber)
    if (pr.state === 'MERGED') {
      await this.recordMerged(thread, pr, 'on GitHub')
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
        channel: thread.channel,
        threadTs: thread.threadTs,
        text: `${decision.pending ? '⏳' : '🚫'} Not merging <${pr.url}|PR #${pr.number}>: ${decision.reasons.map(mrkdwnEscape).join('; ')}.${decision.pending ? ' Click Merge again later.' : ''}`,
      })
      return
    }
    // A click retires any CI wait for the thread.
    const key = this.key(thread.channel, thread.threadTs)
    this.mergeGen.set(key, (this.mergeGen.get(key) || 0) + 1)
    await fleet.prMerge(pr.number, thread.runDir)
    await this.recordMerged(thread, pr, `by <@${userId}>`)
  }

  async notNow(thread: ThreadRecord, userId: string): Promise<void> {
    const key = this.key(thread.channel, thread.threadTs)
    this.mergeGen.set(key, (this.mergeGen.get(key) || 0) + 1)
    if (thread.state === 'pr_open')
      this.d.store.updateThread(thread.channel, thread.threadTs, {
        state: 'held',
      })
    await this.d.slack.post({
      channel: thread.channel,
      threadTs: thread.threadTs,
      text: `OK <@${userId}>, holding ${thread.prUrl ? `<${thread.prUrl}|the PR>` : 'it'}. Reply to change it, click Merge, or merge on GitHub.`,
    })
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async cleanupWorktree(thread: ThreadRecord): Promise<void> {
    if (!thread.worktree) return
    const keepBranch = Boolean(thread.prUrl)
    await this.d.fleet.worktreeRemove(
      thread.worktree,
      keepBranch ? undefined : thread.branch,
      thread.runDir,
    )
    this.d.store.updateThread(thread.channel, thread.threadTs, {
      worktree: undefined,
    })
  }

  private async setStatus(
    thread: ThreadRecord,
    view: Partial<StatusView>,
  ): Promise<void> {
    const fresh =
      this.d.store.getThread(thread.channel, thread.threadTs) || thread
    if (!fresh.statusTs) return
    const runId = fresh.runDir ? path.basename(fresh.runDir) : undefined
    const text = renderStatus({
      title: fresh.title,
      runId,
      prUrl: fresh.prUrl,
      transcriptUrl: runId ? transcriptUrl(this.d.cfg, runId) : undefined,
      ...view,
    })
    await this.d.slack
      .update({ channel: fresh.channel, ts: fresh.statusTs, text })
      .catch((err) => {
        this.d.log.warn('status update failed', { error: errorMessage(err) })
      })
  }
}
