import { fileURLToPath } from 'url'
import path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { Archive } from '../src/lib-client/types'
import os from 'os'
const { processTwitterArchive } = await import('../src/lib-server/db_insert')
const { pipe } = await import('../src/lib-server/fp')
const { uploadArchiveToStorage } = await import(
  '../src/lib-client/upload-archive/uploadArchiveToStorage'
)
const { removeProblematicCharacters } = await import(
  '../src/lib-client/removeProblematicChars'
)

// Initialize paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const isProd = false

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

async function fetchStoragePaths() {
  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('name')
    .eq('bucket_id', 'archives')

  if (error) {
    console.error('Error fetching storage objects:', error)
    process.exit(1)
  }

  return data.map((datum) => datum.name)
}

async function fetchAccountUsernames() {
  const { data, error } = await supabase.from('account').select('username')

  if (error) {
    console.error('Error fetching account usernames:', error)
    process.exit(1)
  }

  return data?.map((account) => account.username.toLowerCase()) || []
}

async function downloadAndProcessArchive(
  username: string,
  archivePath: string,
): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-'))
  const filePath = path.join(tempDir, 'archive.json')

  try {
    console.log(`Downloading archive for ${username}`)
    const { data, error } = await supabase.storage
      .from('archives')
      .download(archivePath)

    if (error) {
      console.error(`Error downloading ${username}:`, error)
      return
    }

    if (!(data instanceof Blob)) {
      console.error(`Unexpected data type for ${username}`)
      return
    }

    const buffer = Buffer.from(await data.arrayBuffer())
    fs.writeFileSync(filePath, buffer)
    console.log(`Downloaded: ${username}`)

    await uploadArchive(filePath)
  } finally {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function uploadArchive(filePath: string) {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8')
    const archive: any = pipe(
      removeProblematicCharacters,
      JSON.parse,
    )(fileContents)

    console.log('Processing archive for', archive.account)

    await processTwitterArchive(supabase, archive, (progress) => {
      console.log(`${progress.phase}: ${progress.percent?.toFixed(2)}%`)
    })

    console.log('Archive processing completed successfully')
  } catch (error) {
    console.error('Error processing archive:', error)
  }
}

async function processArchives(usernames: string[]) {
  const storageObjects = await fetchStoragePaths()

  for (const username of usernames) {
    const archivePath = storageObjects.find((path) =>
      path.toLowerCase().startsWith(`${username.toLowerCase()}/archive.json`),
    )
    if (!archivePath) {
      console.error(`No archive found for ${username}`)
      continue
    }

    await downloadAndProcessArchive(username, archivePath)
  }
}

async function checkAndProcessArchives() {
  const storageObjects = await fetchStoragePaths()
  const accountUsernames = await fetchAccountUsernames()

  const archivesInStorage = new Set(
    storageObjects.map((path) => path.split('/')[0].toLowerCase()),
  )
  const accountsInDb = new Set(
    accountUsernames.map((username) => username.toLowerCase()),
  )

  const archivesToProcess = [...archivesInStorage].filter(
    (archive) => !accountsInDb.has(archive),
  )

  console.log('Archives in storage but not in public.account:')
  archivesToProcess.forEach((archive) => console.log(archive))

  console.log(`\nTotal archives to process: ${archivesToProcess.length}`)

  if (archivesToProcess.length > 0) {
    console.log('\nProcessing archives...')
    await processArchives(archivesToProcess)
  } else {
    console.log('No archives to process.')
  }
}

checkAndProcessArchives()
