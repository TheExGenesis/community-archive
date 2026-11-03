// Stream events → short progress lines for the Slack thread, and a batcher
// that posts them at most once every few seconds.
import type { StreamEvent } from './claude.js'

export type DescribeToolUse = (name: string, input?: unknown) => string

export interface SummariseOptions {
  describeToolUse?: DescribeToolUse
  /** Max characters of an assistant text line (default 400). */
  textLimit?: number
}

const defaultDescribe: DescribeToolUse = (name, input) => {
  const i = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >
  const target = i.file_path || i.command || i.pattern || ''
  return target ? `${name} \`${String(target).slice(0, 120)}\`` : name
}

export function oneLine(s: string, limit: number): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}

/** Strip the fenced JSON verdict and code fences from text meant for humans. */
export function humanText(text: string): string {
  return text
    .replace(/```json\s*\n[\s\S]*?\n\s*```\s*$/m, '')
    .replace(/```json\s*\n\{[\s\S]*?"status"[\s\S]*?\n\s*```/g, '')
    .trim()
}

/** Progress lines for one stream-json event; empty for events not worth a line. */
export function summariseEvent(
  ev: StreamEvent,
  opts: SummariseOptions = {},
): string[] {
  const describe = opts.describeToolUse || defaultDescribe
  const textLimit = opts.textLimit ?? 400
  const out: string[] = []
  if (ev.type === 'assistant') {
    const message = ev.message as { content?: unknown } | undefined
    const content = Array.isArray(message?.content)
      ? (message?.content as unknown[])
      : []
    for (const b of content) {
      const block = b as {
        type?: string
        text?: string
        name?: string
        input?: unknown
      }
      if (block.type === 'text' && block.text && block.text.trim()) {
        const text = humanText(block.text)
        if (text) out.push(`💬 ${oneLine(text, textLimit)}`)
      } else if (block.type === 'tool_use' && block.name) {
        out.push(`🔧 ${oneLine(describe(block.name, block.input), 200)}`)
      }
    }
    if (typeof ev.error === 'string' && ev.error)
      out.push(`⚠️ ${oneLine(ev.error, 200)}`)
    return out
  }
  if (ev.type === 'user') {
    const message = ev.message as { content?: unknown } | undefined
    const content = Array.isArray(message?.content)
      ? (message?.content as unknown[])
      : []
    for (const b of content) {
      const block = b as {
        type?: string
        is_error?: boolean
        content?: unknown
      }
      if (block.type === 'tool_result' && block.is_error) {
        const raw =
          typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content ?? '').slice(0, 300)
        out.push(`⚠️ tool error: ${oneLine(raw, 200)}`)
      }
    }
    return out
  }
  if (ev.type === 'result') {
    const turns =
      typeof ev.num_turns === 'number' ? `${ev.num_turns} turns` : ''
    const cost =
      typeof ev.total_cost_usd === 'number'
        ? `$${ev.total_cost_usd.toFixed(2)}`
        : ''
    const detail = [turns, cost].filter(Boolean).join(', ')
    out.push(
      ev.is_error
        ? `❌ Claude run failed${detail ? ` (${detail})` : ''}`
        : `✅ turn finished${detail ? ` (${detail})` : ''}`,
    )
  }
  return out
}

/**
 * ProgressBatcher collects lines and flushes them as one message at most
 * every `intervalMs` (and never more than `maxLines` per message; the rest
 * waits for the next flush). `drain()` flushes whatever is left.
 */
export class ProgressBatcher {
  private pending: string[] = []
  private timer: NodeJS.Timeout | undefined
  private lastFlush = 0
  private flushing: Promise<void> = Promise.resolve()
  private readonly intervalMs: number
  private readonly maxLines: number
  private readonly maxChars: number

  constructor(
    private flushFn: (lines: string[]) => Promise<void>,
    opts: {
      intervalMs?: number
      maxLines?: number
      maxChars?: number
      now?: () => number
    } = {},
  ) {
    this.intervalMs = opts.intervalMs ?? 6000
    this.maxLines = opts.maxLines ?? 12
    this.maxChars = opts.maxChars ?? 2800
    this.now = opts.now ?? (() => Date.now())
  }

  private now: () => number

  push(...lines: string[]): void {
    for (const l of lines) if (l) this.pending.push(l)
    if (this.pending.length === 0) return
    const due = this.lastFlush + this.intervalMs - this.now()
    if (due <= 0) {
      void this.flush()
    } else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), due)
      this.timer.unref?.()
    }
  }

  /** Flush now; resolves when the message has been handed to flushFn. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    if (this.pending.length === 0) return this.flushing
    const batch: string[] = []
    let chars = 0
    while (this.pending.length && batch.length < this.maxLines) {
      const next = this.pending[0]
      if (batch.length && chars + next.length > this.maxChars) break
      batch.push(this.pending.shift() as string)
      chars += next.length + 1
    }
    this.lastFlush = this.now()
    this.flushing = this.flushing
      .then(() => this.flushFn(batch))
      .catch(() => undefined)
    if (this.pending.length) {
      this.timer = setTimeout(() => void this.flush(), this.intervalMs)
      this.timer.unref?.()
    }
    return this.flushing
  }

  async drain(): Promise<void> {
    while (this.pending.length) {
      this.lastFlush = 0
      await this.flush()
    }
    await this.flushing
  }
}
