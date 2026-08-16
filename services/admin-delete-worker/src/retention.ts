import type postgres from 'postgres'
import { logger } from './logger.ts'

type SupabaseClient = any

const EXPORT_BUCKET = 'admin-deleted-user-data'
// Contentful recovery exports predate policy tombstones and are not valid
// durable recovery material. Delete them on the next sweep; ID-only manifests
// under tombstones/ are retained.
const PAGE_SIZE = 1000

export async function purgeExpiredExports(
  storage: SupabaseClient,
  sql: postgres.Sql,
): Promise<void> {
  try {
    const paths = await listLegacyFiles(storage)
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await storage.storage
        .from(EXPORT_BUCKET)
        .remove(paths.slice(offset, offset + 100))
      if (error) throw new Error(error.message)
    }

    await sql`
      UPDATE private.admin_jobs
      SET args = jsonb_strip_nulls(jsonb_build_object(
            'account_id', args->>'account_id',
            'completed_at', args->>'completed_at',
            'failed_at', args->>'failed_at',
            'export_prefix', CASE
              WHEN args->>'export_prefix' LIKE 'tombstones/%'
              THEN args->>'export_prefix'
              ELSE NULL
            END,
            'legacy_export_deleted_at', now()
          )),
          updated_at = now()
      WHERE job_name = 'admin_delete_with_export'
        AND status IN ('DONE', 'FAILED')
        AND (
          args ? 'username'
          OR args ? 'reason'
          OR args ? 'requested_by_user_id'
          OR args ? 'error'
          OR COALESCE(args->>'export_prefix', '') NOT LIKE 'tombstones/%'
        )
    `
    if (paths.length > 0) {
      logger.info(
        { objects_deleted: paths.length },
        'legacy contentful admin deletion exports removed',
      )
    }
  } catch (error) {
    logger.error({ error }, 'failed to remove legacy admin deletion exports')
  }
}

async function listLegacyFiles(storage: SupabaseClient): Promise<string[]> {
  const paths: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await storage.storage.from(EXPORT_BUCKET).list('', {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(error.message)

    const entries = (data ?? []) as Array<{ id?: string | null; name: string }>
    for (const entry of entries) {
      if (entry.name === 'tombstones') continue
      if (entry.id) paths.push(entry.name)
      else paths.push(...(await listFilesRecursively(storage, entry.name)))
    }
    if (entries.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return paths
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
