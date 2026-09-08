/** Upload a normalized display package to private Supabase Storage.
 * Usage: node scripts/community-apps/upload_display_data.mjs <directory> <env-file>
 * The private manifest pointer changes only after every versioned file uploads.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const [directory, envFile] = process.argv.slice(2)
if (!directory || !envFile)
  throw new Error(
    'Provide the display directory and credential source env-file',
  )
config({ path: envFile, override: true })
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const manifestBytes = await fs.readFile(path.join(directory, 'manifest.json'))
const manifest = JSON.parse(manifestBytes)
if (manifest.version !== 1 || !/^v1\/[a-zA-Z0-9_-]+$/.test(manifest.prefix))
  throw new Error('Invalid display manifest')
const bucket = 'community-app-data'
const { data: existing, error: lookupError } =
  await client.storage.getBucket(bucket)
if (existing?.public) throw new Error('Display bucket must be private')
if (!existing) {
  if (lookupError && !/not found/i.test(lookupError.message))
    throw new Error('Could not inspect display bucket')
  const { error } = await client.storage.createBucket(bucket, {
    public: false,
    allowedMimeTypes: ['application/json'],
    fileSizeLimit: 10000000,
  })
  if (error) throw new Error('Could not create private display bucket')
}
let count = 0,
  bytes = 0
for (const key of [
  ...manifest.birdseye.map(({ username }) => {
    if (!/^[a-z0-9_]{1,15}$/.test(username))
      throw new Error('Invalid display username')
    return `${manifest.prefix}/birdseye/${username}.json`
  }),
  `${manifest.prefix}/strands.json`,
]) {
  const body = await fs.readFile(path.join(directory, key))
  JSON.parse(body)
  const { error } = await client.storage
    .from(bucket)
    .upload(key, body, { contentType: 'application/json', upsert: false })
  if (error) throw new Error(`Display upload failed for ${key}`)
  count++
  bytes += body.length
}
const { error } = await client.storage
  .from(bucket)
  .upload('manifest.json', manifestBytes, {
    contentType: 'application/json',
    upsert: true,
    cacheControl: '0',
  })
if (error) throw new Error('Display manifest publication failed')
const { data: verified, error: verifyError } = await client.storage
  .from(bucket)
  .download('manifest.json')
if (verifyError || JSON.parse(await verified.text()).prefix !== manifest.prefix)
  throw new Error('Display manifest read-back failed')
console.log(
  JSON.stringify({
    bucket,
    public: false,
    files: count + 1,
    bytes,
    accounts: manifest.birdseye.length,
  }),
)
