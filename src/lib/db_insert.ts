import { devLog } from '@/lib/devLog'
import { Archive } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { removeProblematicCharacters } from '@/lib/removeProblematicChars'

// Load environment variables from .env file in the scratchpad directory
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })
}

const BATCH_SIZE = 1000 // Adjust as needed

const MAX_RETRIES = 5
const RETRY_DELAY = 1000 // 1 second

type RetryOptions = {
  maxRetries?: number
  retryDelay?: number
}

export const retryOperation = async <T>(
  operation: () => Promise<T>,
  errorMessage: string,
  options: RetryOptions = {},
): Promise<T> => {
  const maxRetries = options.maxRetries ?? MAX_RETRIES
  const retryDelay = options.retryDelay ?? RETRY_DELAY

  let retries = 0
  while (retries < maxRetries) {
    try {
      return await operation()
    } catch (error) {
      retries++
      if (retries >= maxRetries) {
        throw new Error(`${errorMessage}: ${(error as Error).message}`)
      }
      console.log(`Attempt ${retries} failed. Retrying in ${retryDelay}ms...`)
      console.info(`${errorMessage}: ${(error as Error).message}`)
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
    }
  }
  throw new Error(`Max retries reached for operation: ${errorMessage}`)
}


type UploadPhase = 'uploading' | 'ready_for_commit' | 'committed' | 'failed'

const setUploadPhase = async (
  supabase: SupabaseClient,
  archiveUploadId: number,
  phase: UploadPhase,
): Promise<void> => {
  await retryOperation(async () => {
    const { error } = await supabase
      .from('archive_upload')
      .update({ upload_phase: phase })
      .eq('id', archiveUploadId)
  }, `Error updating archive upload phase to ${phase}`)
}


const insertAccountAndUploadRow = async (
  supabase: SupabaseClient,
  accountId: string,
  archiveData: Archive,
  latestTweetDate: string,
): Promise<number> => {
  // Compute counts
  const num_tweets = archiveData.tweets.length
  const num_following = archiveData.following?.length ?? 0
  const num_followers = archiveData.follower?.length ?? 0
  const num_likes = archiveData.like?.length ?? 0

  // Insert into all_account first
  console.log('Inserting account data...')
  await retryOperation(async () => {
    const { error } = await supabase.from('all_account').upsert({
      account_id: accountId,
      created_via: 'twitter_archive',
      username: archiveData.account[0].account.username,
      created_at: archiveData.account[0].account.createdAt,
      account_display_name: archiveData.account[0].account.accountDisplayName,
      num_tweets,
      num_following,
      num_followers,
      num_likes,
    })
    if (error) throw error
  }, 'Error inserting all_account data')

  // Create initial archive_upload record
  console.log('Creating/updating archive upload record...')
  const uploadOptions = archiveData['upload-options'] || {
    keepPrivate: false,
    uploadLikes: true,
    startDate: null,
    endDate: null,
  }

  const {data: lastUploadedArchive, error: lastUploadedArchiveError} = await supabase.from('archive_upload').
  select('id,archive_at').eq('account_id', accountId).in('upload_phase', ['uploading', 'ready_for_commit'])
  .order('created_at', { ascending: false }).limit(1).maybeSingle()

  let supabaseUpsertQuery;
  if (lastUploadedArchive) {
     supabaseUpsertQuery = supabase
      .from('archive_upload')
      .update({ 
        archive_at: latestTweetDate,
        keep_private: uploadOptions.keepPrivate,
        upload_likes: uploadOptions.uploadLikes,
        start_date: uploadOptions.startDate,
        end_date: uploadOptions.endDate,
        upload_phase: 'uploading',
        created_at: new Date().toISOString(),
      })
      .eq('id', lastUploadedArchive.id)
      .select('id')
      .maybeSingle()
      console.log("has other records, updating")
  }else{
    supabaseUpsertQuery = supabase
        .from('archive_upload')
        .insert({
          account_id: accountId,
          archive_at: latestTweetDate,
          keep_private: uploadOptions.keepPrivate,
          upload_likes: uploadOptions.uploadLikes,
          start_date: uploadOptions.startDate,
          end_date: uploadOptions.endDate,
          upload_phase: 'uploading',
        })
        .select('id')
        .single()
        console.log("no other records, inserting")
  }

  const { data: archiveUploadIdData, error: uploadError } = await supabaseUpsertQuery;

  console.log('archiveUploadIdData', { archiveUploadIdData })
  const archiveUploadId = archiveUploadIdData?.id

  if (!archiveUploadId) throw new Error('Archive upload ID not found')
  if (uploadError) throw uploadError

  return archiveUploadId
}

export const insertArchiveForProcessing = async (
  supabase: SupabaseClient,
  archiveData: Archive,
  progressCallback: (progress: {
    phase: string
    percent: number | null
  }) => void,
): Promise<void> => {
  const startTime = performance.now()
  console.log('Starting Twitter Archive processing...')
  devLog('archiveData', { archiveData })

  const accountId = archiveData.account[0].account.accountId
  const suffix = accountId

  // Calculate latest tweet date first since we need it for the archive_upload
  const latestTweetDate = archiveData.tweets.reduce(
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
  const archiveUploadId = await insertAccountAndUploadRow(
    supabase,
    accountId,
    archiveData,
    latestTweetDate,
  )

  try{
    // Update upload_phase to ready_for_commit with longer timeout
    await setUploadPhase(supabase, archiveUploadId, 'ready_for_commit')

    
    progressCallback({
      phase: 'Insertion into archive_upload record completed successfully.',
      percent: 100,
    })
    const endTime = performance.now()
    const totalTimeInSeconds = (endTime - startTime) / 1000
    console.log(
      `Total archive upload time: ${totalTimeInSeconds.toFixed(2)} seconds`,
    )
  } catch (error: any) {
    console.error('Error processing Twitter archive:', error)

    // Update upload_phase to failed
    try {
      await setUploadPhase(supabase, archiveUploadId, 'failed')
    } catch (updateError: any) {
      console.error('Error updating upload phase to failed:', updateError)
    }

    // Throw a new error with more context
    throw new Error(`Error processing Twitter archive: ${error.message}`)
  }
}

export const deleteArchive = async (
  supabase: SupabaseClient,
  accountId: string,
): Promise<void> => {
  try {
    const { error } = await supabase
      .schema('public')
      .rpc('delete_user_archive', {
        p_account_id: accountId,
      })

    if (error) throw error

    console.log(`All archives for account ${accountId} deleted successfully`)
  } catch (error: any) {
    throw new Error(
      `Error deleting archives of account ${accountId}: ${error.message}`,
    )
  }
}
