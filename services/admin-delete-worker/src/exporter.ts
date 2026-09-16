import type postgres from 'postgres'
import { logger } from './logger.ts'

type SupabaseClient = any

const TOMBSTONE_BUCKET = 'admin-deleted-user-data'
const ARCHIVES_BUCKET = 'archives'
const STORAGE_PAGE_SIZE = 1000

export interface ExportArgs {
  accountId?: string | null
  username: string
  reason: string
  requesterUserId: string
  enqueuedAt: string
}

export interface ExportResult {
  export_prefix: string
  archive_files_copied: string[]
  tweet_ids: string[]
  row_counts: Record<string, number>
  phase_ms: Record<string, number>
}

/**
 * Apply the database tombstone first, remove every raw archive object, then
 * persist only stable IDs. No authored text, profile data, raw archive, reason,
 * username, or requester identity is copied into recovery Storage.
 */
export async function exportAndDelete(
  storage: SupabaseClient,
  sql: postgres.Sql,
  args: ExportArgs,
): Promise<ExportResult> {
  const phase_ms: Record<string, number> = {}
  const tick = (name: string, since: number) => {
    phase_ms[name] = Date.now() - since
  }
  const identity = args.accountId ?? 'unknown-account'
  const export_prefix = `tombstones/${identity}/${args.enqueuedAt.replace(/[:.]/g, '-')}`
  const log = logger.child({ account_id: args.accountId ?? null })

  if (args.accountId) {
    log.info('phase: tombstone_policy_account starting')
    const started = Date.now()
    await sql`SELECT public.tombstone_policy_account(${args.accountId})`
    tick('delete_user_archive', started)
    log.info(
      { ms: phase_ms.delete_user_archive },
      'phase: tombstone_policy_account done',
    )
  }

  const cleanupStarted = Date.now()
  await removeArchiveFolder(storage, args.username)
  tick('archives_cleanup', cleanupStarted)

  const tweetIds = args.accountId
    ? await sql<{ tweet_id: string }[]>`
        SELECT tweet_id
        FROM public.tweets
        WHERE account_id = ${args.accountId}
          AND is_tombstone IS TRUE
        ORDER BY tweet_id
      `
    : []

  const manifestStarted = Date.now()
  const manifest = {
    format: 'community-archive-policy-tombstone-v1',
    account_id: args.accountId ?? null,
    tweet_ids: tweetIds.map((row) => row.tweet_id),
    content_free: true,
    completed_at: new Date().toISOString(),
  }
  const { error: manifestError } = await storage.storage
    .from(TOMBSTONE_BUCKET)
    .upload(
      `${export_prefix}/manifest.json`,
      new Blob([JSON.stringify(manifest)], { type: 'application/json' }),
      { contentType: 'application/json', upsert: true },
    )
  if (manifestError) {
    throw new Error(`upload tombstone manifest: ${manifestError.message}`)
  }
  tick('manifest_upload', manifestStarted)

  return {
    export_prefix,
    archive_files_copied: [],
    tweet_ids: tweetIds.map((row) => row.tweet_id),
    row_counts: {
      all_account: args.accountId ? 1 : 0,
      tweets: tweetIds.length,
    },
    phase_ms,
  }
}

async function removeArchiveFolder(
  storage: SupabaseClient,
  username: string,
): Promise<void> {
  const normalizedUsername = username.toLowerCase()
  const paths = await listArchiveFilesRecursively(storage, normalizedUsername)
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error: removeError } = await storage.storage
      .from(ARCHIVES_BUCKET)
      .remove(paths.slice(offset, offset + 100))
    if (removeError) {
      throw new Error(`remove archives: ${removeError.message}`)
    }
  }
}

async function listArchiveFilesRecursively(
  storage: SupabaseClient,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await storage.storage
      .from(ARCHIVES_BUCKET)
      .list(prefix, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
    if (error) throw new Error(`list archives for cleanup: ${error.message}`)

    const entries = (data ?? []) as Array<{ id?: string | null; name: string }>
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`
      if (entry.id) paths.push(path)
      else paths.push(...(await listArchiveFilesRecursively(storage, path)))
    }
    if (entries.length < STORAGE_PAGE_SIZE) break
    offset += STORAGE_PAGE_SIZE
  }

  return paths
}
