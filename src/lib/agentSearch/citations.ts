import { parseListView, type ListView } from './listView'

// The agent cites tweets inline as [[t:<tweet id>]]. Code, not the model,
// decides whether a citation is valid: the id must appear in a tool result
// from the same conversation, in this run or an earlier turn (the digest's
// numbered-corpus rule, keyed by tweet id). A follow-up may cite a tweet an
// earlier turn found. The stored run (src/workflows/agentSearch.ts, with the
// earlier turns' ids from context.ts) and the page (messageView.ts, from the
// earlier messages it holds) apply the same rule.

// DeepSeek V4.1 Flash sometimes drops the prefix and writes [[<id>]]; in the
// eval it did so for 3 of 8 typed-tool answers, so the prefix is optional.
export const CITATION_PATTERN = /\[\[(?:t:)?(\d{1,20})\]\]/g

// A quote names its tweet: [[q:<id> | the tweet's own words]]. The page checks
// the words against that tweet before showing them as a quote.
export const QUOTE_PATTERN = /\[\[q:\s*(\d{1,20})\s*\|\s*([^\]\n]+?)\s*\]\]/g

// When the answer is a set of posts, the agent shows them as a list where it
// wants them: [[posts: <label> | <source> | <view>]]. The source is either
// tweet ids (`123, 456`) or a result file in the agent's workspace
// (`lists/living.jsonl`), which the reader resolves from the files the tools
// reported. Either way the same rule applies to every id: a tool must have
// returned it. The label may be empty and the view left out (listView.ts).
export const POST_LIST_PATTERN =
  /\[\[posts:\s*([^|\]\n]*?)\s*\|\s*([^|\]\n]*?)\s*(?:\|\s*([^\]\n]*?)\s*)?\]\]/g

/** A workspace path: relative, no `..`, ending in a file name. */
export const WORKSPACE_PATH = /^(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9_./-]{0,200}$/

const listIds = (raw: string) =>
  raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^\d{1,20}$/.test(id))
    .filter((id, index, all) => all.indexOf(id) === index)

/** A list's source: its ids, or the workspace file it names. */
function listSource(raw: string): { ids: string[]; path: string | null } {
  const trimmed = raw.trim()
  if (/^[\d,\s]*$/.test(trimmed)) return { ids: listIds(trimmed), path: null }
  return WORKSPACE_PATH.test(trimmed)
    ? { ids: [], path: trimmed }
    : { ids: [], path: null }
}

/** Resolves a workspace path to the ids its file held; undefined if unknown. */
export type WorkspaceFiles = ReadonlyMap<string, readonly string[]>

/**
 * Every tweet id the answer cites or lists, in order of first appearance.
 * Lists that name a workspace file resolve through `files`.
 */
export function extractCitationIds(
  text: string,
  files: WorkspaceFiles = new Map(),
): string[] {
  const ids: string[] = []
  const markers = [
    ...Array.from(text.matchAll(CITATION_PATTERN)),
    ...Array.from(text.matchAll(QUOTE_PATTERN)),
  ]
    .map((match) => ({ index: match.index ?? 0, ids: [match[1]] }))
    .concat(
      Array.from(text.matchAll(POST_LIST_PATTERN)).map((match) => {
        const source = listSource(match[2])
        return {
          index: match.index ?? 0,
          ids: source.path ? [...(files.get(source.path) ?? [])] : source.ids,
        }
      }),
    )
    .sort((a, b) => a.index - b.index)
  for (const marker of markers) {
    for (const id of marker.ids) if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

export type AnswerPart =
  | { type: 'text'; value: string }
  | {
      type: 'list'
      /** Null for a list with no label, shown inside the prose. */
      label: string | null
      ids: string[]
      path: string | null
      view: ListView
    }

/** Splits answer text into prose and post lists, in order. */
export function splitPostLists(text: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  let last = 0
  for (const match of Array.from(text.matchAll(POST_LIST_PATTERN))) {
    const index = match.index ?? 0
    if (index > last)
      parts.push({ type: 'text', value: text.slice(last, index) })
    parts.push({
      type: 'list',
      label: match[1].trim() || null,
      ...listSource(match[2]),
      view: parseListView(match[3]),
    })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

/**
 * The workspace files tools reported, latest write first wins: each tool
 * output may carry `files: { "<path>": ["<id>", ...] }` (see workspace).
 */
export function collectWorkspaceFiles(
  outputs: unknown[],
): Map<string, string[]> {
  const files = new Map<string, string[]>()
  for (const output of outputs) {
    const record = output as { files?: unknown } | null | undefined
    if (!record || typeof record !== 'object' || !record.files) continue
    if (typeof record.files !== 'object' || Array.isArray(record.files))
      continue
    for (const [path, ids] of Object.entries(record.files as object)) {
      if (!WORKSPACE_PATH.test(path) || !Array.isArray(ids)) continue
      files.set(
        path,
        ids.filter(
          (id): id is string => typeof id === 'string' && /^\d{1,20}$/.test(id),
        ),
      )
    }
  }
  return files
}

export function validateCitations(
  text: string,
  seenTweetIds: Iterable<string>,
  files: WorkspaceFiles = new Map(),
): { cited: string[]; invalid: string[] } {
  const seen = new Set(seenTweetIds)
  const cited: string[] = []
  const invalid: string[] = []
  for (const id of extractCitationIds(text, files)) {
    ;(seen.has(id) ? cited : invalid).push(id)
  }
  return { cited, invalid }
}

/** Splits answer text into plain segments and citation markers, in order. */
export function splitCitations(
  text: string,
): Array<{ type: 'text'; value: string } | { type: 'cite'; id: string }> {
  const parts: Array<
    { type: 'text'; value: string } | { type: 'cite'; id: string }
  > = []
  let last = 0
  for (const match of Array.from(text.matchAll(CITATION_PATTERN))) {
    const index = match.index ?? 0
    if (index > last)
      parts.push({ type: 'text', value: text.slice(last, index) })
    parts.push({ type: 'cite', id: match[1] })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

/** Collects every tweet id present in tool outputs (AgentTweet-shaped). */
export function collectToolTweetIds(outputs: unknown[]): Set<string> {
  const ids = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (
      typeof record.id === 'string' &&
      /^\d{1,20}$/.test(record.id) &&
      typeof record.text === 'string'
    ) {
      ids.add(record.id)
    }
    Object.values(record).forEach(visit)
  }
  outputs.forEach(visit)
  return ids
}
