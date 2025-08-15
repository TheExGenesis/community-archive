const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testScrapingStats() {
  console.log('Testing scraping stats functions...\n')

  // Test 1: Check if private.tweet_user has data
  console.log('1. Checking private.tweet_user table...')
  const { count: countData, error: countError } = await supabase
    .schema('private')
    .from('tweet_user')
    .select('inserted', { count: 'exact', head: true })
  
  if (countError) {
    console.error('Error accessing tweet_user:', countError)
  } else {
    console.log(`Found ${countData} records in tweet_user table`)
  }

  // Test 2: Get some sample data from tweet_user
  console.log('\n2. Getting sample data from tweet_user...')
  const { data: sampleData, error: sampleError } = await supabase
    .from('tweet_user')
    .select('inserted, scraped_username')
    .order('inserted', { ascending: false })
    .limit(5)
  
  if (sampleError) {
    console.error('Error getting sample data:', sampleError)
  } else {
    console.log('Latest records:')
    sampleData?.forEach(record => {
      console.log(`  - ${record.inserted}: ${record.scraped_username}`)
    })
  }

  // Test 3: Test compute_hourly_scraping_stats function
  console.log('\n3. Testing compute_hourly_scraping_stats...')
  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  
  const { data: computeData, error: computeError } = await supabase
    .rpc('compute_hourly_scraping_stats', {
      p_start_date: dayAgo.toISOString(),
      p_end_date: now.toISOString()
    })
  
  if (computeError) {
    console.error('Error calling compute_hourly_scraping_stats:', computeError)
  } else {
    console.log(`Computed ${computeData?.length || 0} hourly periods`)
    if (computeData && computeData.length > 0) {
      console.log('First 3 periods:')
      computeData.slice(0, 3).forEach(period => {
        console.log(`  - ${period.period_start}: ${period.tweet_count} tweets, ${period.unique_scrapers} scrapers`)
      })
    }
  }

  // Test 4: Test get_hourly_scraping_stats function
  console.log('\n4. Testing get_hourly_scraping_stats...')
  const { data: getHourlyData, error: getHourlyError } = await supabase
    .rpc('get_hourly_scraping_stats', {
      p_hours_back: 24
    })
  
  if (getHourlyError) {
    console.error('Error calling get_hourly_scraping_stats:', getHourlyError)
  } else {
    console.log(`Retrieved ${getHourlyData?.length || 0} hourly periods`)
    if (getHourlyData && getHourlyData.length > 0) {
      const total = getHourlyData.reduce((sum, p) => sum + (p.tweet_count || 0), 0)
      console.log(`Total tweets in last 24 hours: ${total}`)
    }
  }

  // Test 5: Check cached data
  console.log('\n5. Checking cached data in scraping_stats...')
  const { data: cacheData, error: cacheError } = await supabase
    .from('scraping_stats')
    .select('*')
    .eq('period_type', 'hour')
    .order('period_start', { ascending: false })
    .limit(5)
  
  if (cacheError) {
    console.error('Error checking cache:', cacheError)
  } else {
    console.log(`Found ${cacheData?.length || 0} cached periods`)
    cacheData?.forEach(period => {
      console.log(`  - ${period.period_start}: ${period.tweet_count} tweets (cached at ${period.last_updated})`)
    })
  }

  // Test 6: Test the simple streamed counts function (original)
  console.log('\n6. Testing get_simple_streamed_tweet_counts...')
  const { data: simpleData, error: simpleError } = await supabase
    .rpc('get_simple_streamed_tweet_counts', {
      start_date: dayAgo.toISOString(),
      end_date: now.toISOString(),
      granularity: 'hour'
    })
  
  if (simpleError) {
    console.error('Error calling get_simple_streamed_tweet_counts:', simpleError)
  } else {
    console.log(`Retrieved ${simpleData?.length || 0} periods from simple function`)
    if (simpleData && simpleData.length > 0) {
      const total = simpleData.reduce((sum, p) => sum + (p.tweet_count || 0), 0)
      console.log(`Total tweets: ${total}`)
    }
  }
}

testScrapingStats().catch(console.error)