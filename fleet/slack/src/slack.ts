// The slice of Slack the service uses, behind an interface so tests run
// against a fake. The Bolt adapter at the bottom is the only Slack-SDK code.
import type { App } from '@slack/bolt'

/** Bolt's web client (the @slack/web-api WebClient), without a direct dependency on that package. */
export type WebClient = App['client']

export interface PostArgs {
  channel: string
  text: string
  threadTs?: string
  blocks?: unknown[]
  unfurl?: boolean
}

export interface SlackClient {
  post(args: PostArgs): Promise<{ ts: string; channel: string }>
  update(args: {
    channel: string
    ts: string
    text: string
    blocks?: unknown[]
  }): Promise<void>
  react(args: { channel: string; ts: string; name: string }): Promise<void>
  permalink(channel: string, ts: string): Promise<string | undefined>
}

export interface ButtonSpec {
  actionId: string
  text: string
  value: Record<string, unknown>
  style?: 'primary' | 'danger'
}

/** A text section plus a row of buttons, as Block Kit. */
export function buttonBlocks(
  text: string,
  buttons: ButtonSpec[],
  blockId = 'fleet',
): unknown[] {
  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text } },
  ]
  if (buttons.length) {
    blocks.push({
      type: 'actions',
      block_id: `${blockId}-${Date.now()}`,
      elements: buttons.map((b) => ({
        type: 'button',
        text: { type: 'plain_text', text: b.text, emoji: true },
        action_id: b.actionId,
        value: JSON.stringify(b.value),
        ...(b.style ? { style: b.style } : {}),
      })),
    })
  }
  return blocks
}

/** Slack mrkdwn escaping for text that is not meant to be markup. */
export function mrkdwnEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A fenced code block, clipped to what Slack renders comfortably. */
export function codeBlock(s: string, limit = 3000): string {
  let body = s.replace(/```/g, "'''").trimEnd()
  if (body.length > limit) body = `${body.slice(0, limit)}\n… (clipped)`
  return '```\n' + body + '\n```'
}

export function boltSlackClient(web: WebClient): SlackClient {
  return {
    async post(a) {
      const r = await web.chat.postMessage({
        channel: a.channel,
        text: a.text,
        thread_ts: a.threadTs,
        blocks: a.blocks as never,
        unfurl_links: a.unfurl ?? false,
        unfurl_media: false,
      })
      return { ts: String(r.ts), channel: String(r.channel || a.channel) }
    },
    async update(a) {
      await web.chat.update({
        channel: a.channel,
        ts: a.ts,
        text: a.text,
        blocks: (a.blocks ?? []) as never,
      })
    },
    async react(a) {
      try {
        await web.reactions.add({
          channel: a.channel,
          timestamp: a.ts,
          name: a.name,
        })
      } catch {
        // a reaction is decoration
      }
    },
    async permalink(channel, ts) {
      try {
        const r = await web.chat.getPermalink({ channel, message_ts: ts })
        return r.permalink ? String(r.permalink) : undefined
      } catch {
        return undefined
      }
    },
  }
}
