const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkTemporaryData() {
  console.log('Checking temporary_data table...\n')
  
  // Check types in temporary_data
  console.log('1. Checking what types exist...')
  const { data: types, error: typesError } = await supabase
    .from('temporary_data')
    .select('type')
    .limit(1000)
  
  if (typesError) {
    console.error('Error accessing types:', typesError)
    return
  }
  
  const uniqueTypes = [...new Set(types?.map(t => t.type))]
  console.log('Unique types found:', uniqueTypes)
  
  // Check api_tweet entries
  console.log('\n2. Checking api_tweet entries...')
  const { data: apiTweets, error: apiError, count } = await supabase
    .from('temporary_data')
    .select('*', { count: 'exact' })
    .eq('type', 'api_tweet')
    .order('inserted', { ascending: false, nullsFirst: false })
    .limit(5)
  
  if (apiError) {
    console.error('Error accessing api_tweet:', apiError)
  } else {
    console.log(`Total api_tweet records: ${count}`)
    console.log('Recent api_tweet entries:')
    apiTweets?.forEach(record => {
      console.log(`  ${record.inserted || 'NULL'}: user_id=${record.user_id}, item_id=${record.item_id}`)
    })
  }
  
  // Check entries with inserted timestamp
  console.log('\n3. Checking entries with inserted timestamp...')
  const { data: insertedEntries, error: insertedError, count: insertedCount } = await supabase
    .from('temporary_data')
    .select('type, user_id, inserted', { count: 'exact' })
    .not('inserted', 'is', null)
    .order('inserted', { ascending: false })
    .limit(10)
  
  if (insertedError) {
    console.error('Error:', insertedError)
  } else {
    console.log(`Total entries with inserted timestamp: ${insertedCount}`)
    console.log('Recent entries with timestamps:')
    insertedEntries?.forEach(record => {
      console.log(`  ${record.inserted}: type=${record.type}, user=${record.user_id}`)
    })
  }
  
  // Check recent entries of any type
  console.log('\n4. Checking most recent entries regardless of type...')
  const { data: recentEntries } = await supabase
    .from('temporary_data')
    .select('type, user_id, inserted, timestamp')
    .order('timestamp', { ascending: false })
    .limit(5)
  
  console.log('Most recent entries by timestamp:')
  recentEntries?.forEach(record => {
    console.log(`  ${record.timestamp}: type=${record.type}, user=${record.user_id}, inserted=${record.inserted}`)
  })
}

checkTemporaryData().catch(console.error)