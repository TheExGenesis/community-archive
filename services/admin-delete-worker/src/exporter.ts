import type postgres from 'postgres'
import { logger } from './logger.ts'

// `any` here because the SupabaseClient generic chain (introduced in
// recent @supabase/supabase-js) varies between createClient call sites
// in this repo and the worker's. We only use `.storage`, which doesn't
// depend on the schema generics.
type SupabaseClient = any

const EXPORT_BUCKET = 'admin-deleted-user-data'
const ARCHIVES_BUCKET = 'archives'

// Tables we dump per-account into JSON. Keep this list as exhaustive as
// possible — anything missing means lost forensics after delete.
//
// `column` is what we filter on. Most are 'account_id' = the Twitter
// numeric id. tweet_media / tweet_urls / user_mentions are keyed on
// tweet_id, so we have to expand them through tweets first (see
// dumpTweetDependentTable). archive_upload is keyed on account_id.
const PER_ACCOUNT_TABLES: ReadonlyArray<{
  name: string
  column: 'account_id' | 'user_id' | 'tweet_id'
}> = [
  { name: 'tweets', column: 'account_id' },
  { name: 'likes', column: 'account_id' },
  { name: 'followers', column: 'account_id' },
  { name: 'following', column: 'account_id' },
  { name: 'all_account', column: 'account_id' },
  { name: 'all_profile', column: 'account_id' },
  { name: 'archive_upload', column: 'account_id' },
  { name: 'user_action_log', column: 'account_id' },
  // tweet_media / tweet_urls / user_mentions are dumped after `tweets`
  // because they filter on tweet_id, not account_id. Handled separately
  // in run() below.
]

const PAGE_SIZE = 1000

export interface ExportArgs {
  accountId: string
  username: string
  reason: string
  requesterUserId: string
  enqueuedAt: string
}

export interface ExportResult {
  exportPrefix: string
  archiveFilesCopied: string[]
  rowCounts: Record<string, number>
  phaseMs: Record<string, number>
}

/**
 * Run the full export → delete pipeline for one account.
 *
 *  1. Copy `archives/{username}/*` → `admin-deleted-user-data/{prefix}/archives/`
 *  2. Dump per-account tables as JSON into the same prefix
 *  3. Write manifest.json with metadata + counts
 *  4. Call public.delete_user_archive(account_id)
 *  5. Remove the original archives/{username}/ files
 *
 * Throws on the first failure. Caller (runJob) is responsible for marking
 * job_queue + worker_runs as FAILED with the error message.
 */
export async function exportAndDelete(
  storage: SupabaseClient,
  sql: postgres.Sql,
  args: ExportArgs,
): Promise<ExportResult> {
  const phaseMs: Record<string, number> = {}
  const tick = (name: string, since: number) => {
    phaseMs[name] = Date.now() - since
  }

  const exportPrefix = `${args.enqueuedAt.replace(/[:.]/g, '-')}-${args.accountId}`
  const log = logger.child({ account_id: args.accountId, prefix: exportPrefix })

  // 1. archives/<username>/* → admin-deleted-user-data/<prefix>/archives/*
  log.info('phase: archives_copy starting')
  const tArchives = Date.now()
  const archiveFilesCopied = await copyArchiveFolder(
    storage,
    args.username,
    exportPrefix,
  )
  tick('archives_copy', tArchives)
  log.info(
    { copied: archiveFilesCopied.length, ms: phaseMs.archives_copy },
    'phase: archives_copy done',
  )

  // 2. Dump per-account tables.
  const rowCounts: Record<string, number> = {}
  for (const table of PER_ACCOUNT_TABLES) {
    const tTable = Date.now()
    const count = await dumpPerAccountTable(
      storage,
      sql,
      exportPrefix,
      table.name,
      table.column,
      args.accountId,
    )
    rowCounts[table.name] = count
    tick(`dump_${table.name}`, tTable)
    log.info(
      { table: table.name, rows: count, ms: phaseMs[`dump_${table.name}`] },
      'phase: table dump done',
    )
  }

  // tweet-dependent tables. Cheap; we already have all tweet ids in the
  // dumped tweets.json, but for simplicity we re-derive via a CTE-style
  // join in SQL so we don't have to round-trip through JS.
  for (const table of ['tweet_media', 'tweet_urls', 'user_mentions']) {
    const tTable = Date.now()
    const count = await dumpTweetDependentTable(
      storage,
      sql,
      exportPrefix,
      table,
      args.accountId,
    )
    rowCounts[table] = count
    tick(`dump_${table}`, tTable)
    log.info(
      { table, rows: count, ms: phaseMs[`dump_${table}`] },
      'phase: tweet-dependent table dump done',
    )
  }

  // 3. manifest.json — written last so its presence in the bucket means
  // "everything before me actually completed". Useful when triaging
  // partially-failed runs later.
  const tManifest = Date.now()
  const manifest = {
    account_id: args.accountId,
    username: args.username,
    reason: args.reason,
    requested_by_user_id: args.requesterUserId,
    enqueued_at: args.enqueuedAt,
    completed_at: new Date().toISOString(),
    archive_files_copied: archiveFilesCopied,
    row_counts: rowCounts,
    phase_ms: phaseMs,
    notes:
      'Exported by services/admin-delete-worker before calling ' +
      'public.delete_user_archive. The archives/ subfolder mirrors the ' +
      "original storage bucket contents; the per-table JSON files are " +
      'the canonical recovery source for anything that was only in the DB.',
  }
  const { error: manifestErr } = await storage.storage
    .from(EXPORT_BUCKET)
    .upload(
      `${exportPrefix}/manifest.json`,
      new Blob([JSON.stringify(manifest, null, 2)], {
        type: 'application/json',
      }),
      { contentType: 'application/json', upsert: false },
    )
  if (manifestErr) throw new Error(`upload manifest: ${manifestErr.message}`)
  tick('manifest_upload', tManifest)

  // 4. delete_user_archive — runs the per-table cascade in Postgres.
  // 20-minute statement timeout per its definition.
  log.info('phase: delete_user_archive starting')
  const tDelete = Date.now()
  await sql`SELECT public.delete_user_archive(${args.accountId})`
  tick('delete_user_archive', tDelete)
  log.info({ ms: phaseMs.delete_user_archive }, 'phase: delete_user_archive done')

  // 5. Remove the source archives/{username}/ files.
  const tArchiveCleanup = Date.now()
  await removeArchiveFolder(storage, args.username)
  tick('archives_cleanup', tArchiveCleanup)

  return { exportPrefix, archiveFilesCopied, rowCounts, phaseMs }
}

async function copyArchiveFolder(
  storage: SupabaseClient,
  username: string,
  exportPrefix: string,
): Promise<string[]> {
  const { data: files, error } = await storage.storage
    .from(ARCHIVES_BUCKET)
    .list(username)
  if (error) throw new Error(`list archives: ${error.message}`)
  if (!files?.length) return []

  // Parallel — storage.copy is a server-side operation, no need to
  // bottleneck on our connection.
  const copied = await Promise.all(
    (files as { name: string }[]).map(async (file) => {
      const src = `${username}/${file.name}`
      const dst = `${exportPrefix}/archives/${file.name}`
      const { error: copyErr } = await storage.storage
        .from(ARCHIVES_BUCKET)
        .copy(src, dst, { destinationBucket: EXPORT_BUCKET })
      if (copyErr) throw new Error(`copy ${src}: ${copyErr.message}`)
      return file.name
    }),
  )
  return copied
}

async function removeArchiveFolder(
  storage: SupabaseClient,
  username: string,
): Promise<void> {
  const { data: files, error: listErr } = await storage.storage
    .from(ARCHIVES_BUCKET)
    .list(username)
  if (listErr) throw new Error(`list archives for cleanup: ${listErr.message}`)
  if (!files?.length) return
  const paths = (files as { name: string }[]).map(
    (f) => `${username}/${f.name}`,
  )
  const { error: removeErr } = await storage.storage
    .from(ARCHIVES_BUCKET)
    .remove(paths)
  if (removeErr) throw new Error(`remove archives: ${removeErr.message}`)
}

async function dumpPerAccountTable(
  storage: SupabaseClient,
  sql: postgres.Sql,
  exportPrefix: string,
  table: string,
  column: 'account_id' | 'user_id' | 'tweet_id',
  accountId: string,
): Promise<number> {
  // postgres.js's `unsafe()` interpolates identifiers safely; we hand-roll
  // the OFFSET loop instead of using cursor() so we can also pageination-
  // log progress on big tables.
  const rows: unknown[] = []
  let offset = 0
  while (true) {
    const page = await sql.unsafe(
      `SELECT * FROM public.${table} WHERE ${column} = $1 ORDER BY ${columnsToOrder(table)} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      [accountId],
    )
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += page.length
  }
  await uploadJson(storage, exportPrefix, `${table}.json`, rows)
  return rows.length
}

async function dumpTweetDependentTable(
  storage: SupabaseClient,
  sql: postgres.Sql,
  exportPrefix: string,
  table: string,
  accountId: string,
): Promise<number> {
  const rows: unknown[] = []
  let offset = 0
  while (true) {
    const page = await sql.unsafe(
      `SELECT t2.*
         FROM public.${table} AS t2
         JOIN public.tweets AS t ON t.tweet_id = t2.tweet_id
        WHERE t.account_id = $1
        ORDER BY ${columnsToOrder(table)}
        LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      [accountId],
    )
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += page.length
  }
  await uploadJson(storage, exportPrefix, `${table}.json`, rows)
  return rows.length
}

/** Stable sort order per table, used to keep paginated dumps deterministic. */
function columnsToOrder(table: string): string {
  switch (table) {
    case 'tweets':
      return 'tweet_id'
    case 'likes':
    case 'followers':
    case 'following':
    case 'archive_upload':
    case 'tweet_urls':
    case 'user_mentions':
    case 'user_action_log':
      return 'id'
    case 'all_account':
    case 'all_profile':
      return 'account_id'
    case 'tweet_media':
      return 'media_id'
    default:
      // Fall back to ctid — Postgres physical row order. Not ideal but
      // never wrong.
      return 'ctid'
  }
}

async function uploadJson(
  storage: SupabaseClient,
  exportPrefix: string,
  filename: string,
  rows: unknown[],
): Promise<void> {
  const body = JSON.stringify(rows, null, 0)
  const { error } = await storage.storage
    .from(EXPORT_BUCKET)
    .upload(
      `${exportPrefix}/${filename}`,
      new Blob([body], { type: 'application/json' }),
      { contentType: 'application/json', upsert: false },
    )
  if (error) throw new Error(`upload ${filename}: ${error.message}`)
}
