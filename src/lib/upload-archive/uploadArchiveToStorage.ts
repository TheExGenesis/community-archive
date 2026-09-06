import { SupabaseClient } from '@supabase/supabase-js'
import { Archive } from '../types'
import { devLog } from '../devLog'
import { refreshSession } from '../refreshSession'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'

async function uploadPolicyCheckedObject(
  supabase: SupabaseClient,
  archive: Archive,
  accountId: string,
  username: string,
): Promise<string> {
  const { error: policyError } = await supabase.rpc(
    'assert_archive_upload_allowed',
    { p_account_id: accountId, p_username: username },
  )
  if (policyError) {
    throw new Error(`Archive upload blocked by policy: ${policyError.message}`)
  }

  const serializedArchive = JSON.stringify(archive)
  const archiveSize = serializedArchive.length / (1024 * 1024)
  console.log(`Size of archive: ${archiveSize.toFixed(2)} MB`)
  const objectPath = `${username.toLowerCase()}/archive.json`
  const { error: uploadError } = await supabase.storage
    .from('archives')
    .upload(objectPath, serializedArchive, { upsert: true })
  if (uploadError && uploadError.message !== 'The resource already exists') {
    throw new Error(
      `Error uploading archive to storage: ${uploadError.message}`,
    )
  }
  return objectPath
}

export const uploadArchiveToStorage = async (
  supabase: SupabaseClient,
  archive: Archive,
): Promise<string> => {
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

  const accountId = archive.account?.[0]?.account?.accountId
  const providerId = user.app_metadata?.provider_id
  if (
    typeof accountId !== 'string' ||
    !accountId.trim() ||
    typeof providerId !== 'string' ||
    providerId !== accountId
  ) {
    throw new Error(
      'Archive account id does not match the authenticated account',
    )
  }

  console.log('Uploading archive to storage', { username })

  devLog('storage - supabase config', {
    isDevelopment,
    useRemoteDevDb,
    supabase,
  })

  return uploadPolicyCheckedObject(supabase, archive, accountId, username)
}

/** Service-role/manual import entry point. It deliberately has no fallback:
 * PostgreSQL must approve the archive owner before the raw object is written. */
export const uploadArchiveToStorageAsService = async (
  supabase: SupabaseClient,
  archive: Archive,
): Promise<string> => {
  const account = archive.account?.[0]?.account
  const accountId = account?.accountId
  const username = account?.username
  if (!accountId || !username) {
    throw new Error('Archive owner identity is missing')
  }
  return uploadPolicyCheckedObject(supabase, archive, accountId, username)
}
