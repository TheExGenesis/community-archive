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

async function testStreamingFilter() {
  console.log('Testing streaming filter (total vs streamed-only)...\n')
  
  const now = new Date()
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000)

  // Test 1: Total counts (including system)
  console.log('1. Testing TOTAL counts (including archives)...')
  const { data: totalData, error: totalError } = await supabase
    .rpc('get_streaming_stats', {
      p_start_date: dayAgo.toISOString(),
      p_end_date: now.toISOString(),
      p_granularity: 'hour',
      p_streamed_only: false
    })
  
  if (totalError) {
    console.error('Total error:', totalError)
  } else {
    const totalTweets = totalData?.reduce((sum, h) => sum + h.tweet_count, 0) || 0
    const maxScrapers = totalData?.reduce((max, h) => Math.max(max, h.unique_scrapers), 0) || 0
    console.log(`✓ Total (24h): ${totalTweets} tweets, ${maxScrapers} scrapers/sources`)
  }

  // Test 2: Streamed-only counts (excluding system) 
  console.log('\n2. Testing STREAMED-ONLY counts (excluding archives)...')
  const { data: streamedData, error: streamedError } = await supabase
    .rpc('get_streaming_stats', {
      p_start_date: dayAgo.toISOString(),
      p_end_date: now.toISOString(),
      p_granularity: 'hour',
      p_streamed_only: true
    })
  
  if (streamedError) {
    console.error('Streamed error:', streamedError)
  } else {
    const streamedTweets = streamedData?.reduce((sum, h) => sum + h.tweet_count, 0) || 0
    const maxScrapers = streamedData?.reduce((max, h) => Math.max(max, h.unique_scrapers), 0) || 0
    console.log(`✓ Streamed (24h): ${streamedTweets} tweets, ${maxScrapers} scrapers`)
  }
  
  // Calculate difference
  if (totalData && streamedData) {
    const totalTweets = totalData.reduce((sum, h) => sum + h.tweet_count, 0)
    const streamedTweets = streamedData.reduce((sum, h) => sum + h.tweet_count, 0)
    const archiveTweets = totalTweets - streamedTweets
    
    console.log('\n📊 Comparison:')
    console.log(`Total tweets: ${totalTweets.toLocaleString()}`)
    console.log(`Streamed tweets: ${streamedTweets.toLocaleString()}`)
    console.log(`Archive tweets: ${archiveTweets.toLocaleString()}`)
    console.log(`Archive percentage: ${((archiveTweets / totalTweets) * 100).toFixed(1)}%`)
  }
  
  // Test API endpoints
  console.log('\n3. Testing API endpoints...')
  
  try {
    const totalResponse = await fetch('http://localhost:3000/api/scraping-stats?hoursBack=24&streamedOnly=false')
    if (totalResponse.ok) {
      const totalApiData = await totalResponse.json()
      console.log(`✓ Total API: ${totalApiData.summary.totalTweets} tweets`)
    }
  } catch (e) {
    console.log('✗ Total API failed (server may not be running)')
  }
  
  try {
    const streamedResponse = await fetch('http://localhost:3000/api/scraping-stats?hoursBack=24&streamedOnly=true')
    if (streamedResponse.ok) {
      const streamedApiData = await streamedResponse.json()
      console.log(`✓ Streamed API: ${streamedApiData.summary.totalTweets} tweets`)
    }
  } catch (e) {
    console.log('✗ Streamed API failed (server may not be running)')
  }
}

testStreamingFilter().catch(console.error)