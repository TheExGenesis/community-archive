import { SupabaseClient } from '@supabase/supabase-js'
import { Archive } from '../types'
import { devLog } from '../devLog'
import { createAdminBrowserClient } from '@/utils/supabase'
import { refreshSession } from '../refreshSession'

export const uploadArchiveToStorage = async (
  supabase: SupabaseClient,
  archive: Archive,
): Promise<void> => {
  const latestTweetDate = archive.tweets.reduce(
    (latest: string, tweet: any) => {
      const tweetDate = new Date(tweet.tweet.created_at)
      return latest
        ? tweetDate > new Date(latest)
          ? tweetDate.toISOString()
          : latest
        : tweetDate.toISOString()
    },
    '',
  )
  // Upload archive objects to storage
  const username = archive.account[0].account.username.toLowerCase()

  const archiveSize = JSON.stringify(archive).length / (1024 * 1024)
  console.log(`Size of archive: ${archiveSize.toFixed(2)} MB`)
  const isDevelopment = process.env.NODE_ENV === 'development'
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'

  console.log('Uploading archive to storage', { username, latestTweetDate })

  try {
    await refreshSession(supabase)
  } catch (error) {
    console.error('Error refreshing session:', error)
  }

  // const supabaseAdmin = createAdminBrowserClient()

  devLog('storage - supabase config', {
    isDevelopment,
    useRemoteDevDb,
    supabase,
  })

  const bucketName = 'archives'
  const { data, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(`${username}/archive.json`, JSON.stringify(archive), {
      upsert: true,
    })
  if (uploadError && uploadError.message !== 'The resource already exists') {
    throw new Error(
      `Error uploading archive to storage: ${uploadError.message}`,
    )
  }
}
