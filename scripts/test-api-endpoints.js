// Test the API endpoints for all three time views
const testEndpoints = async () => {
  console.log('Testing /api/scraping-stats endpoints...\n')
  
  // Test 1: 24 hours view
  console.log('1. Testing 24 hours view...')
  try {
    const response1 = await fetch('http://localhost:3000/api/scraping-stats?hoursBack=24&granularity=hour')
    if (!response1.ok) throw new Error(`HTTP ${response1.status}`)
    const data1 = await response1.json()
    console.log(`✓ 24h: ${data1.summary.totalTweets} tweets, ${data1.summary.uniqueScrapers} scrapers, ${data1.data.length} periods`)
  } catch (error) {
    console.log('✗ 24h failed:', error.message)
  }
  
  // Test 2: 7 days view  
  console.log('2. Testing 7 days view...')
  try {
    const now = new Date()
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const params2 = new URLSearchParams({
      startDate: weekAgo.toISOString(),
      endDate: now.toISOString(), 
      granularity: 'day'
    })
    const response2 = await fetch(`http://localhost:3000/api/scraping-stats?${params2}`)
    if (!response2.ok) throw new Error(`HTTP ${response2.status}`)
    const data2 = await response2.json()
    console.log(`✓ 7d: ${data2.summary.totalTweets} tweets, ${data2.summary.uniqueScrapers} scrapers, ${data2.data.length} periods`)
  } catch (error) {
    console.log('✗ 7d failed:', error.message)
  }
  
  // Test 3: 1 year view
  console.log('3. Testing 1 year view (last 10 weeks for testing)...')
  try {
    const now = new Date()
    const tenWeeksAgo = new Date(now - 10 * 7 * 24 * 60 * 60 * 1000)
    const params3 = new URLSearchParams({
      startDate: tenWeeksAgo.toISOString(),
      endDate: now.toISOString(),
      granularity: 'week'
    })
    const response3 = await fetch(`http://localhost:3000/api/scraping-stats?${params3}`)
    if (!response3.ok) throw new Error(`HTTP ${response3.status}`)
    const data3 = await response3.json()
    console.log(`✓ 10w: ${data3.summary.totalTweets} tweets, ${data3.summary.uniqueScrapers} scrapers, ${data3.data.length} periods`)
  } catch (error) {
    console.log('✗ 10w failed:', error.message)
  }
}

testEndpoints().catch(console.error)