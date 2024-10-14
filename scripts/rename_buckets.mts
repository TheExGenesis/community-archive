import { fileURLToPath } from 'url'
import path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

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

async function listBucketContents(
  bucketName: string,
  prefix: string = '',
): Promise<string[]> {
  const listContents = async (prefix: string): Promise<any[]> => {
    const { data, error } = await supabase.storage.from(bucketName).list(prefix)
    if (error) {
      console.error(`Error listing contents of ${prefix}:`, error)
      return []
    }
    return data || []
  }

  const contents = await listContents(prefix)
  const paths = contents.flatMap(async (item) =>
    item.id
      ? await (async (item: any) => [`${prefix}${item.name}`])(item)
      : listContents(`${prefix}${item.name}/`).then((subItems) =>
          subItems.map((subItem) => `${prefix}${item.name}/${subItem.name}`),
        ),
  )
  const names = await Promise.all(paths).then((results) => results.flat())
  console.log('names', names)
  return names
}

function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString)
  return date instanceof Date && !isNaN(date.getTime())
}

async function renameObjects(bucket: string, paths: string[]) {
  for (const path of paths) {
    const [id, rest] = path.split('/')
    const [_, username, timestamp] =
      rest.match(
        /^(.+)_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\.json$/,
      ) || []
    if (
      !username ||
      !timestamp ||
      !/^[a-zA-Z0-9_]+$/.test(username) ||
      !isValidISODate(timestamp) ||
      `${timestamp}.json` === rest
    ) {
      console.error(
        `Failed to rename object ${path}: invalid username or timestamp`,
      )
    } else {
      const newName = `${username}/${timestamp}.json`

      const { data, error } = await supabase.storage
        .from(bucket)
        .move(path, newName)

      if (error) {
        // list objects in the bucket to see if the object was renamed
        const { data: objects, error: listError } = await supabase.storage
          .from(bucket)
          .list(path)
        // console.log('list objects', { objects, listError })
        // console.error(`Failed to rename object ${path} to ${newName}:`, error)
      } else {
        console.log(`Renamed object ${path} to ${newName}`)
      }
    }
  }

  console.log(`Renaming process completed`)
}

async function renameObjects2(bucket: string, paths: string[]) {
  for (const path of paths) {
    const [username, timestamp] = path.split('/')
    const newName = `${username.toLowerCase()}/archive.json`

    const { error } = await supabase.storage.from(bucket).move(path, newName)

    if (error) {
      console.error(`Failed to rename ${path} to ${newName}:`, error)
    } else {
      console.log(`Renamed ${path} to ${newName}`)
    }
  }
  console.log('Renaming process completed')
}

const bucket = 'archives'
listBucketContents(bucket)
  .then((paths) => renameObjects2(bucket, paths))
  .catch((error) => console.error('Error in renaming process:', error))

// supabase.storage
//   .from(bucket)
//   .download('820288038/RomeoStevens76_2024-09-13T18:36:59.000Z.json')
//   .then(({ data, error }) => {
//     console.log('data', { data, error })
//   })
