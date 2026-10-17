/**
 * Read-only check of ClickHouse likes/follows against the raw uploaded
 * archives in the Supabase `archives` bucket.
 *
 * For each selected account it downloads every retained completed upload,
 * builds the union of like.js, follower.js and following.js, and compares it
 * with the account's current ClickHouse edges. It also checks that no
 * ClickHouse row is attributed to an upload whose archive lacks that edge.
 * Output is counts and IDs of mismatching uploads only, never archive content.
 *
 * `missing_only` (ClickHouse lacks edges a retained archive has, nothing extra)
 * is expected for accounts that deleted one of several overlapping archives
 * before this rollout: PostgreSQL then dropped those edges and the backfill
 * copied PostgreSQL. Anything else missing means a delivery or backfill gap.
 *
 * Runs inside the archive processor image with its runtime environment:
 *   node --import tsx verify_archive_graph.ts --sample 5
 *   node --import tsx verify_archive_graph.ts --account-ids 123,456
 * Exit status: 0 all match, 3 only missing_only accounts, 2 mismatch, 1 error.
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { archiveStoragePath } from './archive_storage_reference'
import { parseArchiveInput } from './archive_storage_input'

dotenv.config({ path: '.env' })

const UINT64 = /^(0|[1-9][0-9]{0,19})$/

interface Options {
  accountIds: string[]
  sample: number
  maxArchiveMb: number
}

function parseOptions(argv: string[]): Options {
  const options: Options = { accountIds: [], sample: 5, maxArchiveMb: 400 }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1]
    switch (argv[index]) {
      case '--account-ids':
        options.accountIds = (value ?? '').split(',').filter(Boolean)
        if (!options.accountIds.every((id) => UINT64.test(id))) {
          throw new Error('--account-ids must be comma-separated numeric IDs')
        }
        index += 1
        break
      case '--sample':
        options.sample = Number(value)
        if (!Number.isInteger(options.sample) || options.sample < 1 || options.sample > 500) {
          throw new Error('--sample must be an integer from 1 to 500')
        }
        index += 1
        break
      case '--max-archive-mb':
        options.maxArchiveMb = Number(value)
        if (!Number.isFinite(options.maxArchiveMb) || options.maxArchiveMb <= 0) {
          throw new Error('--max-archive-mb must be positive')
        }
        index += 1
        break
      default:
        throw new Error(`Unknown argument: ${argv[index]}`)
    }
  }
  return options
}

export type EdgeSets = { likes: Set<string>; followers: Set<string>; following: Set<string> }

export const emptyEdges = (): EdgeSets => ({
  likes: new Set(),
  followers: new Set(),
  following: new Set(),
})

export function archiveEdges(archive: any): EdgeSets {
  const edges = emptyEdges()
  const add = (target: Set<string>, value: unknown) => {
    const id = String(value ?? '').trim()
    if (UINT64.test(id)) target.add(id)
  }
  for (const record of archive?.like ?? []) add(edges.likes, record?.like?.tweetId)
  for (const record of archive?.follower ?? []) add(edges.followers, record?.follower?.accountId)
  for (const record of archive?.following ?? []) add(edges.following, record?.following?.accountId)
  return edges
}

async function clickhouse<T>(sql: string, params: Record<string, string>): Promise<T[]> {
  const url = process.env.CLICKHOUSE_URL
  const user = process.env.CLICKHOUSE_USER
  const password = process.env.CLICKHOUSE_PASSWORD
  if (!url || !user || !password) throw new Error('ClickHouse configuration is missing')
  const endpoint = new URL(url)
  endpoint.searchParams.set('database', process.env.CLICKHOUSE_DATABASE || 'community_archive')
  endpoint.searchParams.set('readonly', '1')
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(`param_${key}`, value)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` },
    body: `${sql}\nFORMAT JSONEachRow`,
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`ClickHouse HTTP ${response.status}`)
  const text = (await response.text()).trim()
  return text ? text.split('\n').map((line) => JSON.parse(line) as T) : []
}

async function clickhouseEdges(accountId: string) {
  // Current edges: any live per-upload row keeps the edge visible.
  const rows = await clickhouse<{ kind: string; target: string; uploads: string[] }>(
    `SELECT 'like' AS kind, toString(liked_tweet_id) AS target,
            groupUniqArray(toString(archive_upload_id)) AS uploads
     FROM account_likes FINAL
     WHERE account_id = {account_id:UInt64} AND is_tombstone = 0
     GROUP BY liked_tweet_id
     UNION ALL
     SELECT toString(direction) AS kind, toString(related_account_id) AS target,
            groupUniqArray(toString(archive_upload_id)) AS uploads
     FROM account_follows FINAL
     WHERE account_id = {account_id:UInt64} AND is_tombstone = 0
     GROUP BY direction, related_account_id`,
    { account_id: accountId },
  )
  const edges = emptyEdges()
  const byUpload = new Map<string, EdgeSets>()
  for (const row of rows) {
    const key = row.kind === 'like' ? 'likes' : row.kind === 'follower' ? 'followers' : 'following'
    edges[key].add(row.target)
    for (const upload of row.uploads) {
      if (!byUpload.has(upload)) byUpload.set(upload, emptyEdges())
      byUpload.get(upload)![key].add(row.target)
    }
  }
  return { edges, byUpload }
}

function difference(left: Set<string>, right: Set<string>): number {
  let count = 0
  for (const value of left) if (!right.has(value)) count += 1
  return count
}

const EDGE_KINDS = ['likes', 'followers', 'following'] as const

/**
 * The account's current ClickHouse edges must equal the union of its retained
 * archives, and every ClickHouse row must name an upload whose archive
 * contains that edge.
 *
 * Legacy uploads without a pinned storage path share one overwritten
 * `<username>/archive.json`, so only the newest of them still exists. For
 * those uploads ClickHouse must contain the stored archive, but may hold
 * extra edges that came from the overwritten files.
 */
export function compareAccountGraph(
  archivesByUpload: Map<string, EdgeSets>,
  actual: { edges: EdgeSets; byUpload: Map<string, EdgeSets> },
  overwrittenUploads: ReadonlySet<string> = new Set(),
) {
  const expected = emptyEdges()
  for (const edges of archivesByUpload.values()) {
    for (const key of EDGE_KINDS) for (const value of edges[key]) expected[key].add(value)
  }
  const report: Record<string, unknown> & { status?: 'match' | 'missing_only' | 'mismatch' } = {
    uploads: archivesByUpload.size,
  }
  let mismatch = false
  let missingAny = false
  for (const key of EDGE_KINDS) {
    const missing = difference(expected[key], actual.edges[key])
    const extra = difference(actual.edges[key], expected[key])
    report[key] = { archive: expected[key].size, clickhouse: actual.edges[key].size, missing, extra }
    if (missing) missingAny = true
    if (extra && overwrittenUploads.size === 0) mismatch = true
  }
  report.overwritten_uploads = [...overwrittenUploads].sort()
  const misattributed: string[] = []
  for (const [upload, edges] of actual.byUpload) {
    if (overwrittenUploads.has(upload)) continue
    const source = archivesByUpload.get(upload)
    if (!source || EDGE_KINDS.some((key) => difference(edges[key], source[key]) > 0)) {
      misattributed.push(upload)
    }
  }
  report.misattributed_uploads = misattributed.sort()
  report.status = mismatch || misattributed.length
    ? 'mismatch'
    : missingAny ? 'missing_only' : 'match'
  return report
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (!process.env.POSTGRES_CONNECTION_STRING) throw new Error('POSTGRES_CONNECTION_STRING is required')
  const sql = postgres(process.env.POSTGRES_CONNECTION_STRING, { max: 1, prepare: false })
  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!).storage
  let mismatches = 0
  let missingOnly = 0
  try {
    const accounts = options.accountIds.length
      ? options.accountIds
      : (await sql`
          SELECT account_id
          FROM public.archive_upload
          WHERE upload_phase = 'completed'
          GROUP BY account_id
          ORDER BY max(id) DESC
          LIMIT ${options.sample}
        `).map((row) => String(row.account_id))

    for (const accountId of accounts) {
      const uploads = await sql`
        SELECT id::text AS id, account_id, username, storage_path, storage_sha256
        FROM public.archive_upload
        WHERE account_id = ${accountId} AND upload_phase = 'completed'
        ORDER BY id
      `
      const perUpload = new Map<string, EdgeSets>()
      const uploadsByPath = new Map<string, string[]>()
      for (const upload of uploads) {
        const path = archiveStoragePath(String(upload.username), upload)
        uploadsByPath.set(path, [...(uploadsByPath.get(path) ?? []), String(upload.id)])
      }
      // Older uploads that share a legacy path were overwritten by the newest.
      const overwritten = new Set(
        [...uploadsByPath.values()].flatMap((ids) => ids.slice(0, -1)),
      )
      let skipped = false
      for (const upload of uploads) {
        if (overwritten.has(String(upload.id))) continue
        const path = archiveStoragePath(String(upload.username), upload)
        const { data, error } = await storage.from('archives').download(path)
        if (error) throw new Error(`Archive download failed for upload ${upload.id}`)
        if (data.size > options.maxArchiveMb * 1024 * 1024) {
          skipped = true
          break
        }
        perUpload.set(
          String(upload.id),
          archiveEdges(parseArchiveInput(await data.text(), upload as never)),
        )
      }
      if (skipped) {
        console.log(JSON.stringify({ account_id: accountId, status: 'skipped_large_archive' }))
        continue
      }

      const report = {
        account_id: accountId,
        ...compareAccountGraph(perUpload, await clickhouseEdges(accountId), overwritten),
      }
      if (report.status === 'mismatch') mismatches += 1
      if (report.status === 'missing_only') missingOnly += 1
      console.log(JSON.stringify(report))
    }
  } finally {
    await sql.end()
  }
  console.log(JSON.stringify({ mismatching_accounts: mismatches, missing_only_accounts: missingOnly }))
  process.exitCode = mismatches ? 2 : missingOnly ? 3 : 0
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'verification failed')
    process.exitCode = 1
  })
}
