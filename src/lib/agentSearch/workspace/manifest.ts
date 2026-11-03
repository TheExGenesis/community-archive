import { ROW_FIELDS, parseRowFile } from './rows'

// The workspace lives in memory for one command. Between commands (each its
// own durable workflow step, possibly in another process) and between turns
// of a conversation it is carried as this manifest: for each tweet file, the
// tweet ids in order with their score and any small fields the agent added,
// never tweet text. Text comes back from the gateway when a file is rebuilt,
// so a tweet whose author has since opted out drops out of the file.
//
// Other files (notes, counts) are kept as text for the rest of the run, which
// the workflow's own event log already holds; they are not stored with the
// answer, because they may hold tweet text (see history.ts).

/** A tweet in a file: its id, score, and small fields the agent added. */
export interface RowRef {
  id: string
  p?: number
  x?: Record<string, string | number | boolean | null>
}

export type ManifestFile =
  | { kind: 'tweets'; rows: RowRef[] }
  | { kind: 'text'; text: string }

/** Workspace path (relative, e.g. `lists/living.jsonl`) to its file. */
export type WorkspaceManifest = Record<string, ManifestFile>

/** Changes one command made: a file per path, or null for a removed one. */
export type ManifestChanges = Record<string, ManifestFile | null>

/** Text files above this size are not carried to the next command. */
export const MAX_TEXT_FILE_CHARS = 20_000
/** Agent-added string fields longer than this are dropped (could be text). */
const MAX_EXTRA_CHARS = 60
const MAX_EXTRA_FIELDS = 8

function extras(row: Record<string, unknown> | null): RowRef['x'] | undefined {
  if (!row) return undefined
  const out: NonNullable<RowRef['x']> = {}
  let count = 0
  for (const [key, value] of Object.entries(row)) {
    if (ROW_FIELDS.has(key) || count >= MAX_EXTRA_FIELDS) continue
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null ||
      (typeof value === 'string' && value.length <= MAX_EXTRA_CHARS)
    ) {
      out[key] = value
      count += 1
    }
  }
  return count ? out : undefined
}

/** What a file's content becomes in the manifest; null when not carried. */
export function manifestFileFor(content: string): ManifestFile | null {
  const parsed = parseRowFile(content)
  if (parsed) {
    return {
      kind: 'tweets',
      rows: parsed.map(({ id, row }) => {
        const ref: RowRef = { id }
        const p = row?.p
        if (typeof p === 'number' && Number.isFinite(p)) ref.p = p
        const x = extras(row)
        if (x) ref.x = x
        return ref
      }),
    }
  }
  if (content.length > MAX_TEXT_FILE_CHARS) return null
  return { kind: 'text', text: content }
}

export function applyChanges(
  manifest: WorkspaceManifest,
  changes: ManifestChanges,
): WorkspaceManifest {
  const next: WorkspaceManifest = { ...manifest }
  for (const [path, file] of Object.entries(changes)) {
    if (file) next[path] = file
    else delete next[path]
  }
  return next
}

/** Tweet files only: what may be stored with an answer. */
export function tweetFilesOnly(changes: unknown): ManifestChanges {
  const out: ManifestChanges = {}
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return out
  }
  for (const [path, file] of Object.entries(changes as object)) {
    if (file === null) out[path] = null
    else if (isTweetFile(file)) out[path] = file
  }
  return out
}

function isTweetFile(
  value: unknown,
): value is ManifestFile & { kind: 'tweets' } {
  const file = value as { kind?: unknown; rows?: unknown } | null
  return (
    Boolean(file) &&
    file?.kind === 'tweets' &&
    Array.isArray(file.rows) &&
    file.rows.every(
      (row) =>
        Boolean(row) &&
        typeof (row as { id?: unknown }).id === 'string' &&
        /^\d{1,20}$/.test((row as { id: string }).id),
    )
  )
}

/**
 * The workspace a conversation's earlier turns left, from their stored bash
 * outputs in order (each carries the changes its command made).
 */
export function manifestFromOutputs(outputs: unknown[]): WorkspaceManifest {
  let manifest: WorkspaceManifest = {}
  for (const output of outputs) {
    const workspace = (output as { workspace?: unknown } | null)?.workspace
    manifest = applyChanges(manifest, tweetFilesOnly(workspace))
  }
  return manifest
}

/** One line per file, for the model: `c1.jsonl · 23 tweets`. */
export function describeManifest(manifest: WorkspaceManifest): string[] {
  return Object.keys(manifest)
    .sort()
    .map((path) => {
      const file = manifest[path]
      return file.kind === 'tweets'
        ? `${path} · ${file.rows.length} ${file.rows.length === 1 ? 'tweet' : 'tweets'}`
        : `${path} · notes`
    })
}
