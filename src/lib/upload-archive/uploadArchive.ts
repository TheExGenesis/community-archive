import { Archive } from '../types'
import { insertArchiveForProcessing } from '@/lib/db_insert'
import { uploadArchiveToStorage } from '@/lib/upload-archive/uploadArchiveToStorage'
import { SupabaseClient } from '@supabase/supabase-js'

export const uploadArchive = async (
  supabase: SupabaseClient,
  progressCallback: (progress: {
    phase: string
    percent: number | null
  }) => void,
  archive: Archive,
) => {
  progressCallback({ phase: 'Uploading archive to storage', percent: 0 })

  // Use the new function here
  await uploadArchiveToStorage(supabase, archive)

  progressCallback({ phase: 'Archive Uploaded to storage', percent: 100 })

  // Process the archive
  console.log(
    'Uploaded to storage, insertion into db will be handled by our worker.',
  )
  await insertArchiveForProcessing(supabase, archive, progressCallback)
}
