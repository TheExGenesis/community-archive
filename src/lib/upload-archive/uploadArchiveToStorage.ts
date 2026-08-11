import { SupabaseClient } from '@supabase/supabase-js'
import { Archive } from '../types'
import { devLog } from '../devLog'
import { refreshSession } from '../refreshSession'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'

export const uploadArchiveToStorage = async (
  supabase: SupabaseClient,
  archive: Archive,
): Promise<void> => {
  const serializedArchive = JSON.stringify(archive)
  const archiveSize = serializedArchive.length / (1024 * 1024)
  console.log(`Size of archive: ${archiveSize.toFixed(2)} MB`)
  const isDevelopment = process.env.NODE_ENV === 'development'
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'

  try {
    await refreshSession(supabase)
  } catch (error) {
    console.error('Error refreshing session:', error)
  }

  // getUser verifies the session with Supabase Auth. Never derive this path
  // from the uploaded archive: its account metadata is controlled by the file.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error(
      `Unable to verify the archive owner: ${userError?.message ?? 'no authenticated user'}`,
    )
  }

  const username = getSessionTwitterUsername(user)
  if (!username) {
    throw new Error('Unable to determine a trusted username for this session')
  }

  console.log('Uploading archive to storage', { username })

  devLog('storage - supabase config', {
    isDevelopment,
    useRemoteDevDb,
    supabase,
  })

  const bucketName = 'archives'
  const { data, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(`${username}/archive.json`, serializedArchive, {
      upsert: true,
    })
  if (uploadError && uploadError.message !== 'The resource already exists') {
    throw new Error(
      `Error uploading archive to storage: ${uploadError.message}`,
    )
  }
}
