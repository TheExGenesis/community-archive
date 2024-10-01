import { SupabaseClient } from '@supabase/supabase-js'
import { Archive } from '../types'
import { devLog } from '../devLog'
import { createAdminBrowserClient } from '@/utils/supabase'
import { refreshSession } from '../refreshSession'

export const uploadArchiveToStorage = async (
  supabase: SupabaseClient,
  archive: Archive,
  accountId: string,
  archiveId: string,
): Promise<void> => {
  const archiveSize = JSON.stringify(archive).length / (1024 * 1024)
  console.log(`Size of archive: ${archiveSize.toFixed(2)} MB`)
  const isDevelopment = process.env.NODE_ENV === 'development'
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'

  console.log('Uploading archive to storage', { accountId, archiveId })

  await refreshSession(supabase)

  // const supabaseAdmin = createAdminBrowserClient()

  devLog('storage - supabase config', {
    isDevelopment,
    useRemoteDevDb,
    supabase,
    // supabaseAdmin,
  })

  const bucketName =
    process.env.NODE_ENV === 'production' ? 'archives' : 'dev_archives'
  const { data, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(`${accountId}/${archiveId}.json`, JSON.stringify(archive), {
      upsert: true,
    })
  if (uploadError && uploadError.message !== 'The resource already exists') {
    throw new Error(
      `Error uploading archive to storage: ${uploadError.message}`,
    )
  }
}
