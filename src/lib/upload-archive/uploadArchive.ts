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
  const objectPath = await uploadArchiveToStorage(supabase, archive)

  progressCallback({ phase: 'Archive Uploaded to storage', percent: 100 })

  // Process the archive
  console.log(
    'Uploaded to storage, insertion into db will be handled by our worker.',
  )
  try {
    await insertArchiveForProcessing(supabase, archive, progressCallback)
  } catch (error) {
    // A policy change can land after the Storage statement but before the
    // PostgreSQL metadata write. Remove the partial raw object on that path.
    const { error: cleanupError } = await supabase.storage
      .from('archives')
      .remove([objectPath])
    if (cleanupError) {
      console.error('Failed to remove rejected archive upload:', cleanupError)
    }
    throw error
  }
}
