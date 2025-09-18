import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import unzipper from 'unzipper'
import { Archive } from '../src/lib/types'
import { v4 as uuidv4 } from 'uuid'
import { removeProblematicCharacters } from '../src/lib/removeProblematicChars'
const { validateFileContents } = await import(
  '../src/lib/upload-archive/validateContent'
)
const { insertArchiveForProcessing } = await import('../src/lib/db_insert')
const { uploadArchiveToStorage } = await import(
  '../src/lib/upload-archive/uploadArchiveToStorage'
)

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

const requiredFiles = [
  'profile',
  'account',
  'tweets',
  'like',
  'follower',
  'following',
]

const optionalFiles = ['note-tweet', 'community-tweet']

const extractZip = async (filePath: string): Promise<Archive> => {
  const directory = await unzipper.Open.file(filePath)
  const tweetPartRegex = /.*data\/tweets-part\d+\.js$/
  const allFilePaths = [
    ...requiredFiles.map((file) => `data/${file}.js`),
    ...optionalFiles.map((file) => `data/${file}.js`),
  ]
  console.log({ directory: directory.files.map((x: any) => x.path) })

  const fileContents: Record<string, string[]> = {}
  for (const file of directory.files) {
    if (
      allFilePaths.some((path) => file.path.includes(path)) ||
      tweetPartRegex.test(file.path)
    ) {
      const key = file.path.includes('data/tweets-part')
        ? 'tweets'
        : file.path.match(/.*data\/(.+?)\.js/)?.[1] || ''
      const text = removeProblematicCharacters(
        (await file.buffer()).toString('utf8'),
      )
      console.log({ text })
      fileContents[key] = [...(fileContents[key] || []), text]
    }
  }
  console.log({ fileContents })
  if (!requiredFiles.every((file) => fileContents[file])) {
    throw new Error('Missing required files in the zip')
  }

  validateFileContents(fileContents)

  return Object.fromEntries(
    Object.entries(fileContents).map(([key, contents]: [string, any]) => [
      key,
      key === 'tweets'
        ? contents.flatMap((content: any) =>
            JSON.parse(content.slice(content.indexOf('['))),
          )
        : JSON.parse(contents[0].slice(contents[0].indexOf('['))),
    ]),
  ) as Archive
}

const uploadArchive = async (filePath: string) => {
  try {
    const archive = await extractZip(filePath)

    await uploadArchiveToStorage(supabase, archive)
    console.log('Archive uploaded to storage successfully')

    await insertArchiveForProcessing(supabase, archive, (progress) => {
      console.log(`${progress.phase}: ${progress.percent?.toFixed(2)}%`)
    })
    console.log('Archive processing completed successfully')
  } catch (error) {
    console.error('Error uploading and processing archive:', error)
  }
}

// Execute
const archiveFilePath = process.argv[2]
if (!archiveFilePath) {
  console.error('Provide path to the archive zip file as an argument')
  process.exit(1)
}

uploadArchive(archiveFilePath)
