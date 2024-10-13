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

const anonKey = isProd
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  : process.env.NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY

if (!supabaseUrl || !anonKey) {
  console.error('Missing Supabase URL or service role key')
  process.exit(1)
}

// const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
//   auth: {
//     autoRefreshToken: false,
//     persistSession: false,
//   },
// })
const supabase = createClient(supabaseUrl, anonKey, {
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

async function downloadBucketContents(
  bucketName: string,
  outputDir: string,
  paths: string[],
) {
  await fs.mkdir(outputDir, { recursive: true })

  for (const stg_path of paths) {
    const filePath = path.join(outputDir, stg_path)

    if (await fileExists(filePath)) {
      console.log(`Skipping existing file: ${stg_path}`)
      continue
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(stg_path)

    if (error) {
      console.error(`Error downloading ${stg_path}:`, error)
      continue
    }

    if (!(data instanceof Blob)) {
      console.error(`Unexpected data type for ${stg_path}`)
      continue
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, Buffer.from(await data.arrayBuffer()))
    console.log(`Downloaded: ${stg_path}`)
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
const outputDir = '../../data/downloads/archives_'
const paths = (await fetchObjects()).map((obj) => obj.name)
// console.log(paths)
downloadBucketContents('archives', outputDir, paths)
