import { Archive } from '../types'
import { processTwitterArchive } from '@/lib-server/db_insert'
import { uploadArchiveToStorage } from '@/lib-client/upload-archive/uploadArchiveToStorage'
import { SupabaseClient } from '@supabase/supabase-js'

export const uploadArchive = async (
  supabase: SupabaseClient,
  progressCallback: (progress: {
    phase: string
    percent: number | null
  }) => void,
  archive: Archive,
) => {
  console.log('admin supabase?', {
    supabase,
    dev: process.env.NODE_ENV,
    role: process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE,
  })

  progressCallback({ phase: 'Uploading archive', percent: 0 })

  // Use the new function here
  await uploadArchiveToStorage(supabase, archive)

  // Process the archive
  await processTwitterArchive(supabase, archive, progressCallback)
}
