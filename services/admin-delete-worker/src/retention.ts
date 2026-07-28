import type postgres from 'postgres'
import { logger } from './logger.ts'

type SupabaseClient = any

const EXPORT_BUCKET = 'admin-deleted-user-data'
const RETENTION_HOURS = 24
const PAGE_SIZE = 1000

type ExpiredJob = {
  key: string
  args: {
    account_id?: string
    enqueued_at?: string
    export_prefix?: string
  } | null
}

export async function purgeExpiredExports(
  storage: SupabaseClient,
  sql: postgres.Sql,
): Promise<void> {
  const jobs = await sql<ExpiredJob[]>`
    SELECT key, args
    FROM private.admin_jobs
    WHERE job_name = 'admin_delete_with_export'
      AND status IN ('DONE', 'FAILED')
      AND updated_at < now() - (${RETENTION_HOURS} * interval '1 hour')
      AND COALESCE(args->>'export_deleted_at', '') = ''
    ORDER BY updated_at ASC
    LIMIT 20
  `

  for (const job of jobs) {
    const prefix = exportPrefix(job.args)
    if (!prefix) {
      logger.warn({ job_key: job.key }, 'cannot derive expired export prefix')
      continue
    }

    try {
      const paths = await listFilesRecursively(storage, prefix)
      for (let offset = 0; offset < paths.length; offset += 100) {
        const { error } = await storage.storage
          .from(EXPORT_BUCKET)
          .remove(paths.slice(offset, offset + 100))
        if (error) throw new Error(error.message)
      }

      await sql`
        UPDATE private.admin_jobs
        SET args = COALESCE(args, '{}'::jsonb)
          || jsonb_build_object(
            'export_deleted_at', now(),
            'export_retention_hours', ${RETENTION_HOURS}::integer
          ),
          updated_at = now()
        WHERE key = ${job.key}
      `
      logger.info(
        { job_key: job.key, prefix, objects_deleted: paths.length },
        'expired admin deletion export removed',
      )
    } catch (error) {
      logger.error(
        { job_key: job.key, prefix, error },
        'failed to remove expired admin deletion export',
      )
    }
  }
}

function exportPrefix(args: ExpiredJob['args']): string | null {
  if (args?.export_prefix) return args.export_prefix
  if (!args?.enqueued_at || !args.account_id) return null
  return `${args.enqueued_at.replace(/[:.]/g, '-')}-${args.account_id}`
}

async function listFilesRecursively(
  storage: SupabaseClient,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await storage.storage
      .from(EXPORT_BUCKET)
      .list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
    if (error) throw new Error(error.message)

    const entries = (data ?? []) as Array<{ id?: string | null; name: string }>
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`
      if (entry.id) {
        paths.push(path)
      } else {
        paths.push(...(await listFilesRecursively(storage, path)))
      }
    }
    if (entries.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return paths
}
