import { createBrowserClient } from '@/utils/supabase'
import { getSchemaName } from '../getTableName'
import { ArchiveUpload } from '../types'

export const fetchArchiveUpload = async (
  userMetadata: any,
): Promise<ArchiveUpload | undefined> => {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('archive_upload')
    .select('archive_at')
    .eq('account_id', userMetadata.provider_id)
    .order('archive_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Error fetching archive upload:', error)
    return
  }
  if (data && data.length > 0) {
    return data[0] as ArchiveUpload
  }
}
