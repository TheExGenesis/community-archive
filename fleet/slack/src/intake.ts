// Signal intake: every few minutes, list the open `signal` and `bug` issues,
// post each one the channel has not seen as its own thread, and in that
// thread run a cheap one-turn classification with a "Go ahead" button.
// Nothing is fixed without a click.
import fs from 'node:fs'
import path from 'node:path'
import type { TranscriptLib } from '../types/transcript-lib.js'
import { runClaude } from './claude.js'
import type { Config } from './config.js'
import {
  issueLabelNames,
  type FleetTask,
  type InboxIssue,
} from './fleetTask.js'
import { errorMessage, type Logger } from './log.js'
import { buttonBlocks, mrkdwnEscape, type SlackClient } from './slack.js'
import type { Store } from './store.js'
import { humanText, oneLine } from './summarise.js'
import { parseClassification, type ClassificationVerdict } from './verdict.js'

export interface SignalMeta {
  severity?: string
  route?: string
  source?: string
  link?: string
  summary: string
}

/** The human paragraph and the machine fields of a signal issue body. */
export function parseSignalBody(body: string | null | undefined): SignalMeta {
  const text = body || ''
  const meta: SignalMeta = { summary: '' }
  const fence = text.match(/```json signal\s*\n([\s\S]*?)\n\s*```/)
  if (fence) {
    try {
      const d = JSON.parse(fence[1]) as Record<string, unknown>
      const str = (v: unknown) =>
        typeof v === 'string' && v.trim() ? v.trim() : undefined
      meta.severity = str(d.severity)
      meta.route = str(d.route)
      meta.source = str(d.source)
      meta.link = str(d.link)
      if (!meta.summary) meta.summary = str(d.summary) || ''
    } catch {
      // body without a readable block
    }
  }
  const before = fence ? text.slice(0, fence.index) : text
  const paragraph = before
    .split(/\n\s*\n/)
    .map((p) => p.replace(/<!--[\s\S]*?-->/g, '').trim())
    .find((p) => p && !p.startsWith('```'))
  if (paragraph) meta.summary = paragraph
  meta.summary = oneLine(meta.summary || '(no summary)', 400)
  return meta
}

export function renderIssuePost(
  issue: InboxIssue,
  meta: SignalMeta,
  repo: string,
): string {
  const url = `https://github.com/${repo}/issues/${issue.number}`
  const labels = issueLabelNames(issue)
  const facts = [
    meta.severity ? `severity \`${meta.severity}\`` : '',
    meta.route ? `route \`${meta.route}\`` : '',
    meta.source ? `source \`${meta.source}\`` : '',
    labels.length ? `labels \`${labels.join('`, `')}\`` : '',
  ].filter(Boolean)
  return [
    `*<${url}|#${issue.number}> ${mrkdwnEscape(issue.title)}*`,
    facts.join(' · '),
    mrkdwnEscape(meta.summary),
    meta.link ? `<${meta.link}|source link>` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function renderClassification(v: ClassificationVerdict): string {
  const reason = mrkdwnEscape(v.reason || '(no reason given)')
  switch (v.verdict) {
    case 'obvious':
      return `Looks obvious: ${reason}`
    case 'wontfix':
      return `Probably not worth fixing: ${reason}`
    default:
      return `Needs a decision: ${reason}`
  }
}

export type Classifier = (
  issue: InboxIssue,
  meta: SignalMeta,
) => Promise<ClassificationVerdict>

export interface IntakeDeps {
  cfg: Config
  store: Store
  fleet: FleetTask
  slack: SlackClient
  log: Logger
  classify: Classifier
}

export class Intake {
  private running = false

  constructor(private d: IntakeDeps) {}

  /** One pass; resolves with how many issues were posted. Never throws. */
  async tick(): Promise<{ posted: number; seen: number }> {
    if (this.running) return { posted: 0, seen: 0 }
    this.running = true
    try {
      return await this.pass()
    } catch (err) {
      this.d.log.error('intake pass failed', { error: errorMessage(err) })
      return { posted: 0, seen: 0 }
    } finally {
      this.running = false
    }
  }

  private async pass(): Promise<{ posted: number; seen: number }> {
    const { cfg, store, fleet, slack, log } = this.d
    const issues = await fleet.issuesList()
    let posted = 0
    const fresh = issues
      .filter((i) => !store.hasPostedIssue(i.number))
      .sort((a, b) => a.number - b.number)
    for (const issue of fresh) {
      const meta = parseSignalBody(issue.body)
      const top = await slack.post({
        channel: cfg.signalsChannel,
        text: renderIssuePost(issue, meta, cfg.repo),
      })
      store.recordPostedIssue(issue.number, top.channel, top.ts)
      posted += 1
      log.info('posted issue', { issue: issue.number, ts: top.ts })
      let verdict: ClassificationVerdict
      try {
        verdict = await this.d.classify(issue, meta)
      } catch (err) {
        verdict = {
          verdict: 'needs-decision',
          reason: `classification failed: ${errorMessage(err)}`,
          explicit: false,
        }
      }
      store.setIssueClassification(issue.number, verdict.verdict)
      const text = renderClassification(verdict)
      await slack.post({
        channel: top.channel,
        threadTs: top.ts,
        text,
        blocks: buttonBlocks(text, [
          {
            actionId: 'go_ahead',
            text:
              verdict.verdict === 'wontfix'
                ? 'Try anyway'
                : verdict.verdict === 'obvious'
                  ? 'Fix it'
                  : 'Go ahead',
            style: verdict.verdict === 'obvious' ? 'primary' : undefined,
            value: {
              issue: issue.number,
              channel: top.channel,
              threadTs: top.ts,
            },
          },
        ]),
      })
    }
    return { posted, seen: issues.length }
  }
}

/**
 * The default classifier: `claude -p --max-turns 1` on the issue text with
 * INSTRUCTIONS.md as context, in its own small run directory (transcript and
 * result.json like any run), no tools.
 */
export function claudeClassifier(d: {
  cfg: Config
  fleet: FleetTask
  lib: TranscriptLib
  log: Logger
  instructions: () => string
  now?: () => Date
}): Classifier {
  return async (issue, meta) => {
    const now = (d.now ?? (() => new Date()))()
    const stamp = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z')
    const runDir = path.join(
      d.cfg.runsDir,
      `${stamp}-slack-triage-${issue.number}`,
    )
    await d.fleet.initRun('slack-triage', runDir)
    fs.writeFileSync(
      path.join(runDir, 'issue.json'),
      JSON.stringify(issue) + '\n',
    )
    const prompt = [
      `Classify GitHub issue #${issue.number} for the fleet. Do not use tools and do not edit anything: answer from the issue text alone, in one message.`,
      '',
      `Title: ${issue.title}`,
      meta.severity ? `Severity: ${meta.severity}` : '',
      meta.route ? `Route: ${meta.route}` : '',
      `Labels: ${issueLabelNames(issue).join(', ') || '(none)'}`,
      '',
      '---',
      issue.body || '(no body)',
      '---',
      '',
      'Answer with two or three sentences a maintainer reads in Slack, then end with exactly one fenced ```json block:',
      '{"verdict": "obvious" | "needs-decision" | "wontfix", "reason": "<one sentence>"}',
      '`obvious`: a small Tier 0 fix whose cause and change are clear from the report. `needs-decision`: a product, data, consent or design question has to be answered first, or the change is Tier 1 or large. `wontfix`: not a bug, a duplicate, noise, or not worth changing.',
    ]
      .filter((l) => l !== undefined)
      .join('\n')
    fs.writeFileSync(path.join(runDir, 'prompt.md'), prompt)
    const literals = d.lib.secretLiterals(d.cfg.env)
    const res = await runClaude({
      bin: d.cfg.claudeBin,
      cwd: d.cfg.fleetRoot,
      prompt,
      systemPrompt: d.instructions(),
      maxTurns: 1,
      model: d.cfg.claudeModel,
      allowedTools: [],
      disallowedTools: [
        'Bash',
        'Edit',
        'Write',
        'Read',
        'Grep',
        'Glob',
        'WebFetch',
        'WebSearch',
        'Agent',
        'NotebookEdit',
      ],
      env: d.cfg.env,
      transcriptPath: path.join(runDir, 'transcript.jsonl'),
      outputPath: path.join(runDir, 'claude-output.json'),
      stderrPath: path.join(runDir, 'claude-stderr.txt'),
      invocationsPath: path.join(runDir, 'claude-invocations.txt'),
      scrub: (line) => d.lib.scrubLine(line, literals),
      timeoutMs: 5 * 60 * 1000,
    })
    await d.fleet.transcriptRender(
      path.join(runDir, 'transcript.jsonl'),
      path.join(runDir, 'transcript.md'),
      `Fleet slack triage · ${path.basename(runDir)} · issue #${issue.number}`,
      runDir,
    )
    if (res.isError) {
      await d.fleet
        .finish('error', runDir, {
          issue: issue.number,
          sessionId: res.sessionId,
        })
        .catch(() => undefined)
      throw new Error(res.errorMessage || 'claude failed')
    }
    const verdict = parseClassification(res.text)
    const human = humanText(res.text)
    if (human && verdict.explicit)
      verdict.reason = `${oneLine(human, 600)}\n_${verdict.reason}_`
    fs.writeFileSync(
      path.join(runDir, 'result-extra.json'),
      JSON.stringify({
        mode: 'slack-triage',
        classification: verdict.verdict,
      }) + '\n',
    )
    await d.fleet
      .finish('triaged', runDir, {
        issue: issue.number,
        sessionId: res.sessionId,
      })
      .catch((err) => {
        d.log.warn('triage finish failed', { error: errorMessage(err) })
      })
    return verdict
  }
}
