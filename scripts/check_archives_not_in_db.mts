import { fileURLToPath } from 'url'
import path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import { Archive } from '../src/lib-client/types'
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

async function downloadUserArchives(usernames: string[]) {
  const outputDir = path.join(__dirname, '../../data', 'downloads', 'archives')
  await fs.mkdir(outputDir, { recursive: true })

  const storageObjects = await fetchStoragePaths()
  console.log('storageObjects', storageObjects)
  const paths = []

  for (const username of usernames) {
    const archivePath = storageObjects.find((path) =>
      path.startsWith(`${username}/`),
    )
    if (!archivePath) {
      console.error(`No archive found for ${username}`)
      continue
    }

    const filePath = path.join(outputDir, archivePath)

    console.log('downloading')
    const { data, error } = await supabase.storage
      .from('archives')
      .download(archivePath)

    if (error) {
      console.error(`Error downloading ${username}:`, error)
      continue
    }

    if (!(data instanceof Blob)) {
      console.error(`Unexpected data type for ${username}`)
      continue
    }

    await fs.writeFile(filePath, Buffer.from(await data.arrayBuffer()))
    console.log(`Downloaded: ${username}`)
    paths.push(filePath)
  }

  return paths
}

async function uploadArchive(filePath: string) {
  try {
    const fileContents = await fs.readFile(filePath, 'utf8')
    const archive: any = pipe(
      removeProblematicCharacters,
      JSON.parse,
    )(fileContents)

    console.log('archive', archive.account)

    // await uploadArchiveToStorage(supabase, archive)
    // console.log('Archive uploaded to storage successfully')

    await processTwitterArchive(supabase, archive, (progress) => {
      console.log(`${progress.phase}: ${progress.percent?.toFixed(2)}%`)
    })

    console.log('Archive upload and processing completed successfully')
  } catch (error) {
    console.error('Error uploading and processing archive:', error)
  }
}

async function processArchives(usernames: string[]) {
  await downloadUserArchives(usernames)

  const outputDir = path.join(__dirname, '../../data', 'downloads', 'archives')
  for (const archiveName of usernames) {
    const filePath = path.join(outputDir, `${archiveName}.json`)
    await uploadArchive(filePath)
  }
}

async function checkArchives() {
  const storageObjects =
    (await fetchStoragePaths())
      ?.map((path) => path.split('/')[0])
      .map((obj) => obj.toLowerCase()) || []
  const accountUsernames = (await fetchAccountUsernames()).map((username) =>
    username.toLowerCase(),
  )

  const missingArchives = storageObjects
    .filter((obj) => !accountUsernames.includes(obj))
    .filter((obj) => !obj.includes('ceeeeeres'))
  const extraAccounts = accountUsernames.filter(
    (username) => !storageObjects.includes(username),
  )

  console.log('Archives in storage but not in public.account:')
  missingArchives.forEach((archive) => console.log(archive))

  console.log('\nUsernames in public.account but not in storage:')
  extraAccounts.forEach((username) => console.log(username))

  console.log(`\nTotal missing archives: ${missingArchives.length}`)
  console.log(`Total extra accounts: ${extraAccounts.length}`)
  // if (missingArchives.length > 0) {
  //   console.log('\nProcessing missing archives...')
  //   await processArchives(missingArchives)
  // }
}

// Run the check
checkArchives()
