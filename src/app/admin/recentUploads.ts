import 'server-only'
import type { Database } from '@/database-types'
import { getAdminClient } from './data'

type Upload = Database['public']['Tables']['archive_upload']['Row']
export type RecentArchiveUpload = Pick<
  Upload,
  | 'id'
  | 'account_id'
  | 'username'
  | 'created_at'
  | 'archive_at'
  | 'upload_phase'
>
export type RecentArchiveUploadsData = {
  uploads: RecentArchiveUpload[]
  failed: boolean
}

export async function loadRecentArchiveUploads(): Promise<RecentArchiveUploadsData> {
  const admin = await getAdminClient()
  try {
    const { data, error } = await admin
      .from('archive_upload')
      .select('id, account_id, username, created_at, archive_at, upload_phase')
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(20)
    if (error) throw error
    return { uploads: data ?? [], failed: false }
  } catch {
    return { uploads: [], failed: true }
  }
}
