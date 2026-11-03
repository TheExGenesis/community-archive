// Routing: which Slack message or click does what. Only users in the
// allowlist are acted on; everything else is ignored and logged.
import type { Commands } from './commands.js'
import { parseCommand } from './commands.js'
import type { Config } from './config.js'
import type { FleetTask } from './fleetTask.js'
import { errorMessage, type Logger } from './log.js'
import type { TaskRunner } from './runner.js'
import type { SlackClient } from './slack.js'
import type { Store } from './store.js'

export interface IncomingMessage {
  channel: string
  ts: string
  threadTs?: string
  user?: string
  text: string
  channelType?: string
  botId?: string
  subtype?: string
}

export interface IncomingAction {
  actionId: string
  value: string
  user: string
  channel: string
  messageTs: string
  threadTs?: string
}

export interface BotDeps {
  cfg: Config
  store: Store
  runner: TaskRunner
  commands: Commands
  slack: SlackClient
  fleet: FleetTask
  log: Logger
  botUserId?: string
}

export class Bot {
  constructor(private d: BotDeps) {}

  private allowed(user: string | undefined): boolean {
    return Boolean(user && this.d.cfg.allowedUserIds.has(user))
  }

  private stripMention(text: string): string {
    return text
      .replace(/<@[A-Z0-9]+(\|[^>]*)?>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** app_mention in a channel. */
  async onMention(m: IncomingMessage): Promise<void> {
    if (m.botId || (m.subtype && m.subtype !== 'thread_broadcast')) return
    if (!this.allowed(m.user)) {
      this.d.log.info('ignored mention from a user outside the allowlist', {
        user: m.user,
        channel: m.channel,
      })
      return
    }
    await this.handleText(m, 'mention')
  }

  /** message events: DMs and replies in threads the agent knows. */
  async onMessage(m: IncomingMessage): Promise<void> {
    if (m.botId || m.subtype) return
    if (!m.user) return
    // A mention in a channel also arrives as a message event; app_mention handles it.
    if (
      this.d.botUserId &&
      m.text.includes(`<@${this.d.botUserId}>`) &&
      m.channelType !== 'im'
    )
      return
    if (!this.allowed(m.user)) {
      if (m.channelType === 'im') {
        this.d.log.info('ignored DM from a user outside the allowlist', {
          user: m.user,
        })
      }
      return
    }
    if (m.channelType === 'im') {
      await this.handleText(m, 'dm')
      return
    }
    if (m.threadTs && m.threadTs !== m.ts) {
      await this.handleThreadReply(m)
    }
  }

  private async handleText(
    m: IncomingMessage,
    source: 'mention' | 'dm',
  ): Promise<void> {
    const threadTs = m.threadTs || m.ts
    const text = this.stripMention(m.text)
    const known = this.d.store.getThread(m.channel, threadTs)
    if (known && m.threadTs && m.threadTs !== m.ts) {
      await this.handleThreadReply({ ...m, text })
      return
    }
    const cmd = parseCommand(text)
    if (cmd) {
      await this.d.slack.react({ channel: m.channel, ts: m.ts, name: 'eyes' })
      let reply: string
      try {
        reply = await this.d.commands.execute(cmd)
      } catch (err) {
        reply = `Command failed: ${errorMessage(err)}`
      }
      await this.d.slack.post({ channel: m.channel, threadTs, text: reply })
      return
    }
    if (!text) {
      await this.d.slack.post({
        channel: m.channel,
        threadTs,
        text: 'Tell me what to do, or say `help`.',
      })
      return
    }
    await this.d.slack.react({ channel: m.channel, ts: m.ts, name: 'eyes' })
    await this.d.runner.start({
      channel: m.channel,
      threadTs,
      userId: m.user as string,
      text,
      source,
      messageTs: m.ts,
    })
  }

  private async handleThreadReply(m: IncomingMessage): Promise<void> {
    const threadTs = m.threadTs as string
    const thread = this.d.store.getThread(m.channel, threadTs)
    const text = this.stripMention(m.text)
    if (!thread) {
      // A reply under an intake post: start the fix with the reply as instructions.
      const posted = this.findPostedIssue(m.channel, threadTs)
      if (posted) {
        await this.startIssueTask(
          posted,
          m.channel,
          threadTs,
          m.user as string,
          text,
          m.ts,
        )
      }
      return
    }
    if (thread.kind === 'intake') return
    if (/^(stop|cancel|drop it|never mind)\.?$/i.test(text)) {
      await this.d.runner.reply(
        thread,
        'Stop: the human wants to drop this task. End with status "stop".',
        m.user as string,
      )
      return
    }
    if (this.d.runner.isBusy(m.channel, threadTs)) {
      await this.d.slack.post({
        channel: m.channel,
        threadTs,
        text: "I'm still working on the previous message in this thread; send that again when I've answered.",
      })
      return
    }
    await this.d.slack.react({ channel: m.channel, ts: m.ts, name: 'eyes' })
    await this.d.runner.reply(thread, text, m.user as string, m.ts)
  }

  private findPostedIssue(
    channel: string,
    threadTs: string,
  ): number | undefined {
    return this.d.store.getPostedIssueByThread(channel, threadTs)?.issueNumber
  }

  private async startIssueTask(
    issueNumber: number,
    channel: string,
    threadTs: string,
    userId: string,
    instructions: string,
    messageTs?: string,
  ): Promise<void> {
    const issues = await this.d.fleet.issuesList().catch(() => [])
    const issue = issues.find((i) => i.number === issueNumber)
    const url = `https://github.com/${this.d.cfg.repo}/issues/${issueNumber}`
    await this.d.runner.start({
      channel,
      threadTs,
      userId,
      text: instructions,
      source: 'intake',
      messageTs,
      issue: issue
        ? { number: issue.number, title: issue.title, body: issue.body, url }
        : {
            number: issueNumber,
            title: `issue #${issueNumber}`,
            body: '(issue no longer open; read it on GitHub)',
            url,
          },
    })
  }

  /** Button clicks. The value is JSON written by this service. */
  async onAction(a: IncomingAction): Promise<void> {
    if (!this.allowed(a.user)) {
      this.d.log.info('ignored click from a user outside the allowlist', {
        user: a.user,
        action: a.actionId,
      })
      await this.d.slack
        .post({
          channel: a.channel,
          threadTs: a.threadTs || a.messageTs,
          text: `<@${a.user}>, only the maintainers can press that.`,
        })
        .catch(() => undefined)
      return
    }
    let value: {
      channel?: string
      threadTs?: string
      pr?: number
      issue?: number
    } = {}
    try {
      value = JSON.parse(a.value || '{}') as typeof value
    } catch {
      value = {}
    }
    const channel = value.channel || a.channel
    const threadTs = value.threadTs || a.threadTs || a.messageTs
    try {
      if (a.actionId === 'go_ahead') {
        if (!value.issue) return
        if (this.d.store.getThread(channel, threadTs)) {
          await this.d.slack.post({
            channel,
            threadTs,
            text: 'Already on it in this thread.',
          })
          return
        }
        await this.startIssueTask(value.issue, channel, threadTs, a.user, '')
        return
      }
      const pr = value.pr || this.d.store.getThread(channel, threadTs)?.prNumber
      if (!pr) {
        await this.d.slack.post({
          channel,
          threadTs,
          text: 'I no longer know this PR (restarted with a fresh database?).',
        })
        return
      }
      if (a.actionId === 'merge_pr') await this.d.runner.merge(pr, a.user)
      else if (a.actionId === 'not_now') await this.d.runner.notNow(pr, a.user)
    } catch (err) {
      this.d.log.error('action failed', {
        action: a.actionId,
        error: errorMessage(err),
      })
      await this.d.slack
        .post({
          channel,
          threadTs,
          text: `❌ ${a.actionId} failed: ${errorMessage(err).slice(0, 600)}`,
        })
        .catch(() => undefined)
    }
  }
}
