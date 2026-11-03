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
import type { FleetTask } from './fleetTask.js'
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
import { humanText, ProgressBatcher, summariseEvent } from './summarise.js'
import { parseTurnVerdict, type TurnVerdict } from './verdict.js'

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

export class TaskRunner {
  private busy = new Set<string>()
  private active = 0
  private waiters: (() => void)[] = []

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
        text: 'There is no Claude session to resume in this thread yet; mention me with the task again.',
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
      `- The human is <@${thread.requestedBy}> in Slack; your final message of each turn is posted to the thread as is, so write it for them.`,
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
      text: `Queued behind ${this.active} running task${this.active === 1 ? '' : 's'}; I'll start as soon as one finishes.`,
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
        text: "I'm still working on the previous message in this thread; send that again when I've answered.",
      })
      return
    }
    this.busy.add(key)
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
        if (verdict.status === 'done' && !hasChanges) {
          await slack.post({
            channel: thread.channel,
            threadTs: thread.threadTs,
            text: 'Claude says it is done but changed no files, so there is nothing to ship. Reply with what you want, or say stop.',
          })
          verdict.status = 'question'
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
          text: `❌ The task hit an error on my side: ${mrkdwnEscape(errorMessage(err)).slice(0, 600)}\nReply to retry the last step, or mention me with a new task.`,
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
    const batcher = new ProgressBatcher(
      async (lines) => {
        await slack.post({
          channel: thread.channel,
          threadTs: thread.threadTs,
          text: lines.join('\n'),
        })
      },
      { intervalMs: cfg.progressIntervalMs },
    )
    const literals = lib.secretLiterals(cfg.env)
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
      env: cfg.env,
      transcriptPath: path.join(runDir, 'transcript.jsonl'),
      outputPath: path.join(
        runDir,
        n === 1 ? 'claude-output.json' : `claude-output-${n}.json`,
      ),
      stderrPath: path.join(runDir, 'claude-stderr.txt'),
      invocationsPath: path.join(runDir, 'claude-invocations.txt'),
      scrub: (line) => lib.scrubLine(line, literals),
      timeoutMs: RUN_TIMEOUT_MS,
      onEvent: (ev) => {
        if (ev.type === 'result') return
        batcher.push(
          ...summariseEvent(ev, { describeToolUse: lib.describeToolUse }),
        )
      },
    })
    await batcher.drain()
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
      text: `❌ Claude Code failed: ${mrkdwnEscape(res.errorMessage || 'unknown error')}\nReply to retry, or mention me with a new task.`,
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
      human.length > limit
        ? `${human.slice(0, limit)}\n… (clipped; the transcript has the rest)`
        : human
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
    await this.postRunLine(thread, 'stopped')
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
      await slack.post({
        channel: thread.channel,
        threadTs: thread.threadTs,
        text: `Gate failed (${gate.summary.join(', ')}). Asking Claude to repair it once.`,
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
          `❌ The gate is still red after one repair attempt: ${gate.summary.join(', ')}.`,
          tail ? codeBlock(tail, 2500) : '',
          'Nothing was pushed. Reply with guidance and I will try again, or say stop.',
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

    const buttons = [
      ...(tier1.length
        ? []
        : [
            {
              actionId: 'merge_pr',
              text: 'Merge',
              style: 'primary' as const,
              value: {
                channel: thread.channel,
                threadTs: thread.threadTs,
                pr: prNumber,
              },
            },
          ]),
      {
        actionId: 'not_now',
        text: 'Not now',
        value: {
          channel: thread.channel,
          threadTs: thread.threadTs,
          pr: prNumber,
        },
      },
    ]
    const obvious = !tier1.length && changed <= cfg.maxChangedLines
    const text = [
      threadIn.prUrl
        ? `Pushed \`${sha.slice(0, 7)}\` to <${prUrl}|PR #${prNumber}>.`
        : `Opened <${prUrl}|PR #${prNumber}>: ${mrkdwnEscape(title)}`,
      `${changed} changed lines · gate green locally · CI runs on the PR.`,
      ...warnings.map((w) => `⚠️ ${mrkdwnEscape(w)}`),
      obvious
        ? 'This looks like a small Tier 0 change. Merge when CI is green?'
        : tier1.length
          ? 'Tier 1 paths are touched, so a human merges this on GitHub.'
          : 'Merge when you have looked at it?',
    ].join('\n')
    await slack.post({
      channel: thread.channel,
      threadTs: thread.threadTs,
      text,
      blocks: buttonBlocks(text, buttons),
    })
    await this.setStatus(thread, {
      current: 'waiting',
      done: ['understanding', 'working', 'gate', 'pr'],
      prUrl,
    })
    await this.postRunLine(thread, 'pr_opened')
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
    const { cfg, store, fleet, slack, log } = this.d
    if (!thread.prNumber) {
      await slack.post({
        channel: thread.channel,
        threadTs: thread.threadTs,
        text: 'This thread has no PR to merge.',
      })
      return
    }
    const pr = await fleet.prView(thread.prNumber)
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
    await fleet.prMerge(pr.number, thread.runDir)
    log.info('merged', { pr: pr.number, by: userId })
    store.updateThread(thread.channel, thread.threadTs, { state: 'merged' })
    let closed = ''
    if (thread.issueNumber) {
      const commentFile = path.join(
        thread.runDir || cfg.runsDir,
        `issue-close-${thread.issueNumber}.md`,
      )
      fs.writeFileSync(
        commentFile,
        `**[fleet:slack] merged**\n\n${pr.url} was merged from Slack by \`${userId}\`.\n`,
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
      text: `🎉 Merged <${pr.url}|PR #${pr.number}> (squash) by <@${userId}>.${closed}`,
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

  async notNow(thread: ThreadRecord, userId: string): Promise<void> {
    await this.d.slack.post({
      channel: thread.channel,
      threadTs: thread.threadTs,
      text: `OK <@${userId}>, leaving ${thread.prUrl ? `<${thread.prUrl}|the PR>` : 'it'} open. Reply here to change it, click Merge later, or merge on GitHub.`,
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

  private async postRunLine(
    thread: ThreadRecord,
    outcome: string,
  ): Promise<void> {
    if (!thread.runDir) return
    const runId = path.basename(thread.runDir)
    const url = transcriptUrl(this.d.cfg, runId)
    await this.d.slack
      .post({
        channel: thread.channel,
        threadTs: thread.threadTs,
        text: url
          ? `Run \`${runId}\` · outcome \`${outcome}\` · <${url}|transcript>`
          : `Run \`${runId}\` · outcome \`${outcome}\` · transcript: \`fleet/bin/runs.sh show ${runId}\` on the box`,
      })
      .catch(() => undefined)
  }
}
