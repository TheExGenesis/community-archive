import { fileURLToPath } from 'url'
import path from 'path'
import * as dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '../src/database-types' // Assuming database-types.ts is in src

// Initialize paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const isProd = false // Set to true to target production, false for local

const supabaseUrl = isProd
  ? process.env.NEXT_PUBLIC_SUPABASE_URL
  : process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL

const supabaseServiceRoleKey = isProd
  ? process.env.SUPABASE_SERVICE_ROLE
  : process.env.NEXT_PUBLIC_LOCAL_SERVICE_ROLE

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase URL or service role key')
  process.exit(1)
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const usernamesToDelete = [

]

const deleteUserArchive = async (
  supabaseClient: SupabaseClient<Database>,
  username: string,
) => {
  console.log(`Attempting to delete archive for user: ${username}`)
  const { data: fileList, error: listError } = await supabaseClient.storage
    .from('archives')
    .list(username)

  if (listError) {
    console.error(
      `Error listing files for user ${username}:`,
      listError.message,
    )
    return // Skip to next user if listing fails
  }

  if (fileList && fileList.length > 0) {
    const filesToDelete = fileList.map(
      (file: { name: string }) => `${username}/${file.name}`,
    )
    console.log(`Found files to delete for ${username}:`, filesToDelete)
    const { error: deleteError } = await supabaseClient.storage
      .from('archives')
      .remove(filesToDelete)

    if (deleteError) {
      console.error(
        `Error deleting files for user ${username}:`,
        deleteError.message,
      )
    } else {
      console.log(`Successfully deleted archive for user: ${username}`)
    }
  } else {
    console.log(`No archive files found for user: ${username}`)
  }
}

async function main() {
  console.log('Starting deletion process for user archives...')
  for (const username of usernamesToDelete) {
    await deleteUserArchive(supabase, username.toLowerCase())
  }
  console.log('Finished deletion process.')
}

main().catch((error) => {
  console.error('Unhandled error in main execution:', error)
  process.exit(1)
})
