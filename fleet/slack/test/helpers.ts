// Shared fakes for fleet/slack tests: an in-memory Slack, a temp directory.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PostArgs, SlackClient } from '../src/slack.js'

export interface FakeMessage extends PostArgs {
  ts: string
}

export class FakeSlack implements SlackClient {
  posts: FakeMessage[] = []
  updates: { channel: string; ts: string; text: string; blocks?: unknown[] }[] =
    []
  reactions: { channel: string; ts: string; name: string }[] = []
  private counter = 1000

  async post(a: PostArgs) {
    const ts = `${++this.counter}.000100`
    this.posts.push({ ...a, ts })
    return { ts, channel: a.channel }
  }

  async update(a: {
    channel: string
    ts: string
    text: string
    blocks?: unknown[]
  }) {
    this.updates.push(a)
  }

  async react(a: { channel: string; ts: string; name: string }) {
    this.reactions.push(a)
  }

  async permalink(channel: string, ts: string) {
    return `https://slack.example/archives/${channel}/p${ts.replace('.', '')}`
  }

  /** Messages posted in one thread, in order. */
  thread(channel: string, threadTs: string): FakeMessage[] {
    return this.posts.filter(
      (p) => p.channel === channel && p.threadTs === threadTs,
    )
  }

  texts(channel?: string, threadTs?: string): string[] {
    return this.posts
      .filter(
        (p) =>
          (!channel || p.channel === channel) &&
          (!threadTs || p.threadTs === threadTs),
      )
      .map((p) => p.text)
  }

  /** The last update of one message. */
  lastUpdate(ts: string): string | undefined {
    const u = [...this.updates].reverse().find((x) => x.ts === ts)
    return u?.text
  }
}

export function tmpDir(prefix = 'fleet-slack-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/** Button action ids and values of a posted message's blocks. */
export function buttonsOf(
  msg: FakeMessage,
): { actionId: string; value: Record<string, unknown> }[] {
  const out: { actionId: string; value: Record<string, unknown> }[] = []
  for (const block of (msg.blocks || []) as {
    type: string
    elements?: { action_id: string; value: string }[]
  }[]) {
    if (block.type !== 'actions') continue
    for (const el of block.elements || [])
      out.push({ actionId: el.action_id, value: JSON.parse(el.value) })
  }
  return out
}
