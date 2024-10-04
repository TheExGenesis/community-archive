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

async function fetchObjects() {
  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('id, name')

  if (error) {
    console.error('Error fetching objects:', error)
    process.exit(1)
  }

  return data || []
}

async function downloadBucketContents(bucketName: string) {
  const objects = await fetchObjects()
  await fs.mkdir('../../data', { recursive: true })
  const outputDir = path.join(__dirname, '../../data', 'downloads', bucketName)

  await fs.mkdir(outputDir, { recursive: true })

  for (const obj of objects) {
    const filePath = path.join(outputDir, obj.name)

    if (await fileExists(filePath)) {
      console.log(`Skipping existing file: ${obj.name}`)
      continue
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(obj.name)

    if (error) {
      console.error(`Error downloading ${obj.name}:`, error)
      continue
    }

    if (!(data instanceof Blob)) {
      console.error(`Unexpected data type for ${obj.name}`)
      continue
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, Buffer.from(await data.arrayBuffer()))
    console.log(`Downloaded: ${obj.name}`)
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

// Usage
downloadBucketContents('archives')
