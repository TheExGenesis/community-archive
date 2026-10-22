import { createBrowserClient } from '@/utils/supabase'
import { ArchiveUpload } from '../types'

export const fetchArchiveUpload = async (
  accountId: string,
): Promise<ArchiveUpload | undefined> => {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .schema('public')
    .from('archive_upload')
    .select('archive_at')
    .eq('account_id', accountId)
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
