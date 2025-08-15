const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTables() {
  console.log('Checking table structure...\n')

  // Check tweets table for streamed tweets
  console.log('1. Checking tweets table for streamed tweets...')
  const { data: streamedTweets, error: tweetsError } = await supabase
    .from('tweets')
    .select('created_at, tweet_id')
    .is('archive_upload_id', null)
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (tweetsError) {
    console.error('Error accessing tweets:', tweetsError)
  } else {
    console.log(`Found ${streamedTweets?.length || 0} streamed tweets`)
    streamedTweets?.forEach(tweet => {
      console.log(`  - ${tweet.created_at}: ${tweet.tweet_id}`)
    })
  }

  // Check if private.tweet_user exists and what columns it has
  console.log('\n2. Checking private.tweet_user structure...')
  console.log('Note: private.tweet_user is used for tracking scraped tweets, not streamed tweets')
  console.log('For streamed tweets, we should use the tweets table directly')

  // Count total streamed tweets
  console.log('\n3. Counting total streamed tweets...')
  const { count, error: countError } = await supabase
    .from('tweets')
    .select('tweet_id', { count: 'exact', head: true })
    .is('archive_upload_id', null)
  
  if (countError) {
    console.error('Error counting tweets:', countError)
  } else {
    console.log(`Total streamed tweets: ${count}`)
  }

  // Get date range of streamed tweets
  console.log('\n4. Getting date range of streamed tweets...')
  const { data: minDate } = await supabase
    .from('tweets')
    .select('created_at')
    .is('archive_upload_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
  
  const { data: maxDate } = await supabase
    .from('tweets')
    .select('created_at')
    .is('archive_upload_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
  
  if (minDate && minDate[0] && maxDate && maxDate[0]) {
    console.log(`Date range: ${minDate[0].created_at} to ${maxDate[0].created_at}`)
  }
}

checkTables().catch(console.error)