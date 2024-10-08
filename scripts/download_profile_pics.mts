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

async function fetchProfileUrls() {
  const { data, error } = await supabase
    .schema('public')
    .from('profile')
    .select('id, account_id, avatar_media_url')
    .neq('avatar_media_url', null) // Exclude null URLs

  if (error) {
    console.error('Error fetching profiles:', error)
    process.exit(1)
  }

  return data || []
}

async function downloadProfilePictures() {
  const profiles = await fetchProfileUrls()
  const outputDir = path.join(__dirname, '../../data', 'profile_pictures')

  await fs.mkdir(outputDir, { recursive: true })

  for (const profile of profiles) {
    const { id, account_id, avatar_media_url } = profile

    if (!avatar_media_url) {
      console.log(`No avatar URL for account_id ${account_id}, skipping.`)
      continue
    }

    const url = avatar_media_url.trim()
    const fileExtension = path.extname(new URL(url).pathname) || '.jpg'
    const fileName = `${account_id}${fileExtension}`
    const filePath = path.join(outputDir, fileName)

    if (await fileExists(filePath)) {
      console.log(`Skipping existing file: ${fileName}`)
      continue
    }

    try {
      const response = await fetch(url)
      if (!response.ok) {
        console.error(`Failed to download ${url}: ${response.statusText}`)
        continue
      }

      const buffer = await response.buffer()
      await fs.writeFile(filePath, buffer)
      console.log(`Downloaded: ${fileName}`)
    } catch (error) {
      console.error(`Error downloading ${url}:`, error)
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// Start the download process
downloadProfilePictures()
