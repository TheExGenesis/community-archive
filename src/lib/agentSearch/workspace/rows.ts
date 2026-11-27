import type { AgentTweet } from '../types'

// Result files in the agent's workspace are JSON Lines, one tweet per line,
// so they compose with jq, grep, sort, head and wc. The text is always the
// full tweet; the model previews with head, cut or jq and reads in full only
// what it needs.

/** One tweet as a workspace file holds it. */
export interface TweetRow {
  id: string
  author: string
  date: string
  likes: number
  reposts: number
  replyTo?: string
  replyToAuthor?: string
  quotes?: string
  media?: number
  p?: number
  text: string
  [extra: string]: unknown
}

/**
 * Fields rebuilt from the gateway when a file is rehydrated. replyToAuthor is
 * left out on purpose: the id lookup that rebuilds files does not return it,
 * so the manifest carries it with the row like other small fields (a handle,
 * never tweet text).
 */
export const ROW_FIELDS = new Set([
  'id',
  'author',
  'date',
  'likes',
  'reposts',
  'replyTo',
  'quotes',
  'media',
  'p',
  'text',
])

const TWEET_ID = /^\d{1,20}$/

export function toRow(tweet: AgentTweet, p?: number): TweetRow {
  const row: TweetRow = {
    id: tweet.id,
    author: `@${tweet.username}`,
    date: tweet.createdAt.slice(0, 10),
    likes: tweet.likes,
    reposts: tweet.rts,
    text: tweet.text,
  }
  if (tweet.replyToTweetId) row.replyTo = tweet.replyToTweetId
  if (tweet.replyToTweetId && tweet.replyToUsername)
    row.replyToAuthor = `@${tweet.replyToUsername}`
  if (tweet.quoteTweetId) row.quotes = tweet.quoteTweetId
  if (tweet.media?.length) row.media = tweet.media.length
  if (p !== undefined) row.p = Math.round(p * 1000) / 1000
  return row
}

export const formatRows = (rows: TweetRow[]) =>
  rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '')

type RowRefs = Array<{ id: string; row: Record<string, unknown> | null }>

/** A tweet reference from one JSON value: an object with a tweet id, or an id. */
function rowRef(value: unknown): RowRefs[number] | null {
  if (typeof value === 'string')
    return TWEET_ID.test(value) ? { id: value, row: null } : null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id =
    typeof record.id === 'string'
      ? record.id
      : typeof record.id === 'number'
        ? String(record.id)
        : ''
  return TWEET_ID.test(id) ? { id, row: record } : null
}

/**
 * A file as tweet references in JSON Lines: on every non-empty line, a JSON
 * object with a tweet `id` or a bare tweet id (as `jq -r .id` writes).
 */
export function parseRowLines(content: string): RowRefs | null {
  const lines = content.split('\n').filter((line) => line.trim())
  if (!lines.length) return null
  const out: RowRefs = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (TWEET_ID.test(trimmed)) {
      out.push({ id: trimmed, row: null })
      continue
    }
    if (!trimmed.startsWith('{')) return null
    try {
      const ref = rowRef(JSON.parse(trimmed))
      if (!ref) return null
      out.push(ref)
    } catch {
      return null
    }
  }
  return out
}

/**
 * The same rows written another way jq makes easy by mistake: one JSON array
 * (`jq -sc 'unique_by(.id)'`, no `[]`) or objects printed over several lines
 * (`jq -s '…[]'`, no `-c`). A raw newline cannot occur inside a JSON string,
 * so a `}` and `{` on either side of a line break sit between two values.
 */
function parseRowJson(content: string): RowRefs | null {
  const trimmed = content.trim()
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null
  let values: unknown
  try {
    values = JSON.parse(
      trimmed.startsWith('[')
        ? trimmed
        : `[${trimmed.replace(/}\s*\n\s*{/g, '},{')}]`,
    )
  } catch {
    return null
  }
  if (!Array.isArray(values) || !values.length) return null
  const out: RowRefs = []
  for (const value of values) {
    const ref = rowRef(value)
    if (!ref) return null
    out.push(ref)
  }
  return out
}

/**
 * A file's tweet references, or null when it is not a tweet file: JSON Lines
 * (parseRowLines), or the same rows as one JSON array or multi-line objects.
 */
export function parseRowFile(content: string): RowRefs | null {
  return parseRowLines(content) ?? parseRowJson(content)
}

/** Ids in a file's order, each once. */
export function uniqueIds(rows: Array<{ id: string }>): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const { id } of rows) {
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}
