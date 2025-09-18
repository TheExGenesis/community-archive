const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  console.log('Testing simplified stats functions...\n')

  // Test simple version
  console.log('1. Testing get_hourly_stats_simple...')
  const { data: simpleData, error: simpleError } = await supabase
    .rpc('get_hourly_stats_simple', { p_hours_back: 24 })
  
  if (simpleError) {
    console.error('Error:', simpleError)
  } else {
    console.log(`Got ${simpleData?.length || 0} hours of data`)
    const total = simpleData?.reduce((sum, h) => sum + h.tweet_count, 0) || 0
    console.log(`Total tweets: ${total}`)
    if (simpleData && simpleData.length > 0) {
      console.log('Latest 3 hours:')
      simpleData.slice(-3).forEach(h => {
        console.log(`  ${h.period_start}: ${h.tweet_count} tweets`)
      })
    }
  }

  // Test optimized version
  console.log('\n2. Testing get_hourly_scraping_stats...')
  const { data: hourlyData, error: hourlyError } = await supabase
    .rpc('get_hourly_scraping_stats', { p_hours_back: 24 })
  
  if (hourlyError) {
    console.error('Error:', hourlyError)
  } else {
    console.log(`Got ${hourlyData?.length || 0} hours of data`)
    const total = hourlyData?.reduce((sum, h) => sum + h.tweet_count, 0) || 0
    console.log(`Total tweets: ${total}`)
    if (hourlyData && hourlyData.length > 0) {
      console.log('Latest 3 hours:')
      hourlyData.slice(-3).forEach(h => {
        console.log(`  ${h.period_start}: ${h.tweet_count} tweets`)
      })
    }
  }

  // Test the original simple function
  console.log('\n3. Testing get_simple_streamed_tweet_counts...')
  const now = new Date()
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000)
  const { data: origData, error: origError } = await supabase
    .rpc('get_simple_streamed_tweet_counts', {
      start_date: dayAgo.toISOString(),
      end_date: now.toISOString(),
      granularity: 'hour'
    })
  
  if (origError) {
    console.error('Error:', origError)
  } else {
    console.log(`Got ${origData?.length || 0} hours of data`)
    const total = origData?.reduce((sum, h) => sum + h.tweet_count, 0) || 0
    console.log(`Total tweets: ${total}`)
  }
}

test().catch(console.error)