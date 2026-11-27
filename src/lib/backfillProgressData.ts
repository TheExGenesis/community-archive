import 'server-only'
import { readFile } from 'fs/promises'
import { requireAdmin } from '@/app/admin/data'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { createServerServiceRoleClient } from '@/utils/supabase'
import {
  BACKFILL_SNAPSHOT_BUCKET,
  BACKFILL_SNAPSHOT_PATH,
  buildBackfillView,
  validateBackfillSnapshot,
  validateMemberTweetCounts,
  type BackfillSnapshot,
  type MemberTweetCounts,
} from '@/lib/backfillProgress'

/**
 * Admin gate. Signed-out visitors are redirected before any data is read; a
 * signed-in non-admin gets a 404. The loopback-only local admin preview
 * (LOCAL_ADMIN_PREVIEW=true under `pnpm dev`) is read-only, like Bulletin's.
 */
export async function requireBackfillAdmin() {
  if ((await getLocalAdminPreview()) !== 'admin')
    await requireAdmin('/admin/backfill')
}

async function readLocalJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function loadSnapshot(localPreview: boolean): Promise<BackfillSnapshot> {
  const localFile = process.env.BACKFILL_PROGRESS_LOCAL_SNAPSHOT_FILE
  let value: unknown
  if (localPreview && localFile) {
    value = await readLocalJson(localFile)
  } else {
    const { data, error } = await createServerServiceRoleClient()
      .storage.from(BACKFILL_SNAPSHOT_BUCKET)
      .download(BACKFILL_SNAPSHOT_PATH)
    if (error || !data) throw error ?? new Error('Snapshot is missing')
    value = JSON.parse(await data.text())
  }
  validateBackfillSnapshot(value)
  return value
}

async function loadCounts(
  localPreview: boolean,
): Promise<MemberTweetCounts | null> {
  const localFile = process.env.BACKFILL_PROGRESS_LOCAL_COUNTS_FILE
  try {
    const value =
      localPreview && localFile
        ? await readLocalJson(localFile)
        : (
            await fetchAnalyticsGatewayJson<{ data: unknown }>(
              ['member-tweet-counts'],
              new URLSearchParams(),
              { timeoutMs: 20_000 },
            )
          ).data
    validateMemberTweetCounts(value)
    return value
  } catch (error) {
    // The crawl columns still render; held tweets show as unknown.
    console.error('[admin backfill] member tweet counts unavailable:', error)
    return null
  }
}

export async function loadBackfillProgress() {
  const localPreview = (await getLocalAdminPreview()) === 'admin'
  const [snapshot, counts] = await Promise.all([
    loadSnapshot(localPreview),
    loadCounts(localPreview),
  ])
  return buildBackfillView(snapshot, counts)
}
