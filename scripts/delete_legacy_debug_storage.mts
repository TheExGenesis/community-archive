import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'debug'
const CONFIRMATION = 'empty-legacy-debug-bucket'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

if (process.env.CONFIRM_EMPTY_LEGACY_DEBUG !== CONFIRMATION) {
  throw new Error(
    `Set CONFIRM_EMPTY_LEGACY_DEBUG=${CONFIRMATION} to remove every legacy debug object`,
  )
}

const supabase = createClient(
  required('SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE'),
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const { error: bucketError } = await supabase.storage.updateBucket(BUCKET, {
  public: false,
})
if (bucketError)
  throw new Error(`Failed to privatize ${BUCKET}: ${bucketError.message}`)

const { error: emptyError } = await supabase.storage.emptyBucket(BUCKET)
if (emptyError)
  throw new Error(`Failed to empty ${BUCKET}: ${emptyError.message}`)

const { data: remaining, error: listError } = await supabase.storage
  .from(BUCKET)
  .list('', { limit: 1 })
if (listError)
  throw new Error(`Failed to verify ${BUCKET}: ${listError.message}`)
if ((remaining ?? []).length > 0)
  throw new Error(`${BUCKET} still contains objects after cleanup`)

console.log(`Emptied legacy ${BUCKET} Storage bucket; bucket is private`)
