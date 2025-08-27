const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey || !supabaseUrl) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function testNewFunctions() {
  console.log('Testing new streaming stats functions...\n')
  
  const now = new Date()
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const yearAgo = new Date(now - 365 * 24 * 60 * 60 * 1000)

  // Test 1: Hourly stats (24 hours)
  console.log('1. Testing hourly stats (last 24 hours)...')
  const { data: hourlyData, error: hourlyError } = await supabase
    .rpc('get_streaming_stats', {
      p_start_date: dayAgo.toISOString(),
      p_end_date: now.toISOString(),
      p_granularity: 'hour'
    })
  
  if (hourlyError) {
    console.error('Hourly error:', hourlyError)
  } else {
    console.log(`Retrieved ${hourlyData?.length || 0} hours`)
    const total = hourlyData?.reduce((sum, h) => sum + h.tweet_count, 0) || 0
    const maxScrapers = hourlyData?.reduce((max, h) => Math.max(max, h.unique_scrapers), 0) || 0
    console.log(`Total tweets: ${total}, Max unique scrapers: ${maxScrapers}`)
    
    if (hourlyData && hourlyData.length > 0) {
      console.log('Last 3 hours:')
      hourlyData.slice(-3).forEach(h => {
        console.log(`  ${h.period_start}: ${h.tweet_count} tweets, ${h.unique_scrapers} scrapers`)
      })
    }
  }

  // Test 2: Daily stats (last 7 days)
  console.log('\n2. Testing daily stats (last 7 days)...')
  const { data: dailyData, error: dailyError } = await supabase
    .rpc('get_streaming_stats', {
      p_start_date: weekAgo.toISOString(),
      p_end_date: now.toISOString(),
      p_granularity: 'day'
    })
  
  if (dailyError) {
    console.error('Daily error:', dailyError)
  } else {
    console.log(`Retrieved ${dailyData?.length || 0} days`)
    const total = dailyData?.reduce((sum, d) => sum + d.tweet_count, 0) || 0
    const maxScrapers = dailyData?.reduce((max, d) => Math.max(max, d.unique_scrapers), 0) || 0
    console.log(`Total tweets: ${total}, Max unique scrapers: ${maxScrapers}`)
    
    if (dailyData && dailyData.length > 0) {
      console.log('All days:')
      dailyData.forEach(d => {
        const date = new Date(d.period_start).toLocaleDateString()
        console.log(`  ${date}: ${d.tweet_count} tweets, ${d.unique_scrapers} scrapers`)
      })
    }
  }

  // Test 3: Weekly stats (last year, limited to 10 weeks for testing)
  console.log('\n3. Testing weekly stats (last 10 weeks)...')
  const tenWeeksAgo = new Date(now - 10 * 7 * 24 * 60 * 60 * 1000)
  const { data: weeklyData, error: weeklyError } = await supabase
    .rpc('get_streaming_stats', {
      p_start_date: tenWeeksAgo.toISOString(),
      p_end_date: now.toISOString(),
      p_granularity: 'week'
    })
  
  if (weeklyError) {
    console.error('Weekly error:', weeklyError)
  } else {
    console.log(`Retrieved ${weeklyData?.length || 0} weeks`)
    const total = weeklyData?.reduce((sum, w) => sum + w.tweet_count, 0) || 0
    const maxScrapers = weeklyData?.reduce((max, w) => Math.max(max, w.unique_scrapers), 0) || 0
    console.log(`Total tweets: ${total}, Max unique scrapers: ${maxScrapers}`)
    
    if (weeklyData && weeklyData.length > 0) {
      console.log('All weeks:')
      weeklyData.forEach(w => {
        const date = new Date(w.period_start).toLocaleDateString()
        console.log(`  Week of ${date}: ${w.tweet_count} tweets, ${w.unique_scrapers} scrapers`)
      })
    }
  }
}

testNewFunctions().catch(console.error)