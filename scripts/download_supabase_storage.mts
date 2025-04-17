import { fileURLToPath } from 'url'
import path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'

// Initialize paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// const isProd = process.argv[3]
//   ? process.argv[3] === 'true'
//   : process.env.NODE_ENV === 'production'
const isProd = true

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

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Define a type for the object data for clarity
type StorageObject = {
  id: string
  name: string
  bucket_id: string
  updated_at: string // Assuming it's a string representation of a date
}

async function fetchObjects(bucketName: string): Promise<StorageObject[]> {
  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('id, name, bucket_id, updated_at') // Fetch updated_at
    .eq('bucket_id', bucketName)

  if (error) {
    console.error('Error fetching objects:', error)
    process.exit(1)
  }

  return (data as StorageObject[]) || []
}

async function downloadBucketContents(bucketName: string) {
  const objects = await fetchObjects(bucketName)
  // Create base data directory (one level up)
  await fs.mkdir(path.resolve(__dirname, '../../data'), { recursive: true })
  // Define specific output directory within data/downloads
  const outputDir = path.resolve(
    __dirname,
    '../../data',
    'downloads',
    bucketName,
  )

  // Ensure the specific output directory exists
  await fs.mkdir(outputDir, { recursive: true })

  for (const obj of objects) {
    // Construct the full file path
    const filePath = path.join(outputDir, obj.name)
    // Ensure parent directory for the file exists (handles nested paths in obj.name)
    await fs.mkdir(path.dirname(filePath), { recursive: true })

    const remoteLastModified = new Date(obj.updated_at)

    let shouldDownload = false

    try {
      const stats = await fs.stat(filePath)
      const localLastModified = stats.mtime

      if (remoteLastModified > localLastModified) {
        console.log(
          `Remote file ${obj.name} is newer (${remoteLastModified.toISOString()}). Downloading.`,
        )
        shouldDownload = true
      } else {
        console.log(`Skipping existing file (up-to-date): ${obj.name}`)
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.log(`Local file ${obj.name} not found. Downloading.`)
        shouldDownload = true
      } else {
        console.error(`Error checking local file ${obj.name}:`, err)
        continue // Skip this file on error
      }
    }

    if (shouldDownload) {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .download(obj.name)

      if (error) {
        console.error(`Error downloading ${obj.name}:`, error)
        continue
      }

      if (!(data instanceof Blob)) {
        console.error(`Unexpected data type for ${obj.name}: ${typeof data}`)
        continue
      }

      try {
        await fs.writeFile(filePath, Buffer.from(await data.arrayBuffer()))
        console.log(`Downloaded: ${obj.name}`)
      } catch (writeError) {
        console.error(`Error writing file ${obj.name}:`, writeError)
        // Decide if we should continue or stop on write error
        continue
      }
    }
  }
}

// Usage
downloadBucketContents('archives')
