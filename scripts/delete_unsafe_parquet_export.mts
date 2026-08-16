import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'enriched_tweets'
const OBJECT = 'enriched_tweets.parquet'
const CONFIRMATION = 'delete-enriched-tweets-parquet'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

if (process.env.CONFIRM_DELETE_UNSAFE_PARQUET !== CONFIRMATION) {
  throw new Error(
    `Set CONFIRM_DELETE_UNSAFE_PARQUET=${CONFIRMATION} to delete the exact historical export`,
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

const { error: removeError } = await supabase.storage
  .from(BUCKET)
  .remove([OBJECT])
if (removeError)
  throw new Error(`Failed to delete ${OBJECT}: ${removeError.message}`)

const { data: remaining, error: listError } = await supabase.storage
  .from(BUCKET)
  .list('', { search: OBJECT })
if (listError)
  throw new Error(`Failed to verify deletion: ${listError.message}`)
if ((remaining ?? []).some((entry) => entry.name === OBJECT)) {
  throw new Error(`${BUCKET}/${OBJECT} still exists after deletion`)
}

console.log(`Deleted ${BUCKET}/${OBJECT}; bucket is private`)
