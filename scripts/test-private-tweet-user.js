const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
// Use service role key to access private schema
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseKey || !supabaseUrl) {
  console.error('Missing SUPABASE_SERVICE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function testPrivateTweetUser() {
  console.log('Testing private.tweet_user table...\n')

  // Test 1: Check table structure and data
  console.log('1. Checking private.tweet_user data...')
  const { data: sampleData, error: sampleError, count } = await supabase
    .schema('private')
    .from('tweet_user')
    .select('*', { count: 'exact' })
    .order('inserted', { ascending: false })
    .limit(5)
  
  if (sampleError) {
    console.error('Error accessing private.tweet_user:', sampleError)
    return
  }
  
  console.log(`Total records: ${count}`)
  console.log('Latest records:')
  sampleData?.forEach(record => {
    console.log(`  ${record.inserted}: tweet_id=${record.tweet_id}, scraper=${record.scraped_username}`)
  })
  
  // Test 2: Get date range
  console.log('\n2. Getting date range of streamed tweets...')
  const { data: minMax, error: rangeError } = await supabase
    .schema('private')
    .from('tweet_user')
    .select('inserted')
    .order('inserted', { ascending: true })
    .limit(1)
  
  const { data: maxData } = await supabase
    .schema('private')
    .from('tweet_user')
    .select('inserted')
    .order('inserted', { ascending: false })
    .limit(1)
    
  if (minMax && minMax[0] && maxData && maxData[0]) {
    console.log(`Date range: ${minMax[0].inserted} to ${maxData[0].inserted}`)
  }
  
  // Test 3: Count by hour for last 24 hours
  console.log('\n3. Testing hourly aggregation (last 24 hours)...')
  const now = new Date()
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000)
  
  // We need to use raw SQL via RPC for complex aggregation
  const { data: hourlyData, error: hourlyError } = await supabase.rpc('get_hourly_stats_from_tweet_user', {
    p_start_date: dayAgo.toISOString(),
    p_end_date: now.toISOString()
  }).catch(err => ({ data: null, error: err.error || err }))
  
  if (hourlyError) {
    console.log('Function not found, trying direct query...')
    // Try a simpler approach
    const { data: recentData, error: recentError } = await supabase
      .schema('private')
      .from('tweet_user')
      .select('inserted')
      .gte('inserted', dayAgo.toISOString())
      .lte('inserted', now.toISOString())
    
    if (!recentError && recentData) {
      // Manual aggregation
      const hourCounts = {}
      recentData.forEach(record => {
        const hour = new Date(record.inserted).toISOString().substring(0, 13) + ':00:00'
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
      })
      console.log(`Found ${Object.keys(hourCounts).length} hours with data`)
      console.log(`Total tweets in last 24h: ${recentData.length}`)
      
      // Show last 3 hours
      const sortedHours = Object.keys(hourCounts).sort().slice(-3)
      console.log('Last 3 hours:')
      sortedHours.forEach(hour => {
        console.log(`  ${hour}: ${hourCounts[hour]} tweets`)
      })
    }
  } else {
    console.log(`Retrieved ${hourlyData?.length || 0} hours`)
  }
  
  // Test 4: Test daily aggregation for 7 days
  console.log('\n4. Testing daily aggregation (last 7 days)...')
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  
  const { data: weekData, error: weekError } = await supabase
    .schema('private')
    .from('tweet_user')
    .select('inserted')
    .gte('inserted', weekAgo.toISOString())
    .lte('inserted', now.toISOString())
  
  if (!weekError && weekData) {
    // Manual daily aggregation
    const dayCounts = {}
    weekData.forEach(record => {
      const day = new Date(record.inserted).toISOString().substring(0, 10)
      dayCounts[day] = (dayCounts[day] || 0) + 1
    })
    console.log(`Found ${Object.keys(dayCounts).length} days with data`)
    console.log(`Total tweets in last 7 days: ${weekData.length}`)
    
    // Show all days
    const sortedDays = Object.keys(dayCounts).sort()
    console.log('Daily breakdown:')
    sortedDays.forEach(day => {
      console.log(`  ${day}: ${dayCounts[day]} tweets`)
    })
  }
  
  // Test 5: Check unique scrapers
  console.log('\n5. Checking unique scrapers...')
  const { data: scraperData, error: scraperError } = await supabase
    .schema('private')
    .from('tweet_user')
    .select('scraped_username')
    .gte('inserted', dayAgo.toISOString())
  
  if (!scraperError && scraperData) {
    const uniqueScrapers = new Set(scraperData.map(r => r.scraped_username))
    console.log(`Unique scrapers in last 24h: ${uniqueScrapers.size}`)
    console.log('Scrapers:', Array.from(uniqueScrapers).slice(0, 5).join(', '), '...')
  }
}

testPrivateTweetUser().catch(console.error)