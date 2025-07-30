// get potential circle tweets (top level tweets in the right time period) from the community archive
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Initialize paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BATCHES_DIR = path.resolve(
  __dirname,
  'tweet_data/batches-potential-tweets',
)

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase URL or service role key')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - The function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in ms
 * @param {string} [operationName] - Optional name of the operation for better logging
 * @returns {Promise<any>} - Result of the function
 */
async function retryWithBackoff(
  fn,
  maxRetries = 3,
  initialDelay = 1000,
  operationName = 'operation',
) {
  let retries = 0

  while (true) {
    try {
      return await fn()
    } catch (error) {
      // Check for specific error types
      const isRateLimited = error.message && error.message.includes('429')
      const isNotFound = error.message && error.message.includes('404')

      // Handle rate limiting with longer backoff
      if (isRateLimited) {
        // For rate limiting, use a longer backoff period
        const rateLimitDelay = initialDelay * 10 * Math.pow(2, retries)
        console.warn(
          `Rate limited (429). Backing off for ${Math.round(rateLimitDelay / 1000)}s before continuing...`,
        )
        await new Promise((resolve) => setTimeout(resolve, rateLimitDelay))
        continue // Don't count rate limits against our retry limit
      }

      // If it's a not found error and we're configured to continue, just log and throw
      if (isNotFound) {
        console.warn(
          `Resource not found (404) during ${operationName}. Continuing.`,
        )
        throw error // Let the caller handle 404s as needed
      }

      // For other errors, check if we've reached the retry limit
      if (retries >= maxRetries) {
        console.error(
          `Failed ${operationName} after ${maxRetries} retries:`,
          error,
        )
        throw error
      }

      retries++
      const delay = initialDelay * Math.pow(2, retries - 1)
      console.log(
        `Retry ${retries}/${maxRetries} for ${operationName} after ${delay}ms...`,
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

/**
 * Fetch all top-level tweets (non-replies) between August 2022 and November 2023
 * with pagination to handle large datasets
 * @param {Object} savedProgress - Optional progress object to resume from
 * @returns {Array} - Array of tweets
 */
async function fetchTopLevelTweets(savedProgress = null) {
  const startDate = '2022-08-01T00:00:00Z'
  const endDate = '2023-11-30T23:59:59Z'
  const pageSize = 1000

  console.log(`Fetching top-level tweets between ${startDate} and ${endDate}`)

  // We don't need to store all tweets in memory anymore since we save each batch
  let allTweets = []
  let page = savedProgress ? savedProgress.page : 0
  let hasMore = savedProgress ? savedProgress.hasMore : true
  let totalFetched = savedProgress ? savedProgress.collectedCount || 0 : 0
  let totalExpected = 0

  // Set up interval to save progress periodically
  const progressInterval = setInterval(() => {
    const progress = {
      page,
      hasMore,
      collectedCount: totalFetched,
      totalExpected: totalExpected || undefined,
      lastUpdated: new Date().toISOString(),
    }
    saveProgress(progress)
  }, 60000) // Save progress every minute

  try {
    // Get approximate total count first to show overall progress percentage
    try {
      const { count, error } = await supabase
        .from('tweets')
        .select('*', { count: 'exact', head: true })
        .is('reply_to_tweet_id', null)
        .gte('created_at', startDate)
        .lte('created_at', endDate)

      if (!error && count) {
        totalExpected = count
        console.log(
          `Expected to fetch approximately ${totalExpected} tweets in total`,
        )
      }
    } catch (error) {
      console.warn(`Could not get exact count: ${error.message}`)
    }

    while (hasMore) {
      const from = page * pageSize

      // Calculate and show progress percentage if we have a total
      let progressInfo = `Fetching page ${page + 1} (offset: ${from})`
      if (totalExpected > 0) {
        const progressPct = Math.min(
          100,
          Math.round((totalFetched / totalExpected) * 100),
        )
        progressInfo += `, Progress: ${progressPct}% (${totalFetched}/${totalExpected})`
      } else {
        progressInfo += `, Total collected so far: ${totalFetched}`
      }
      console.log(progressInfo)

      try {
        // Use retry logic for each query with named operation
        const result = await retryWithBackoff(
          async () => {
            // Query to get tweets that are not replies (reply_to_tweet_id is null)
            // within the specified date range
            const { data, error, count } = await supabase
              .from('tweets')
              .select(
                `
              tweet_id,
              account_id,
              created_at,
              full_text,
              retweet_count,
              favorite_count
            `,
                { count: 'planned' },
              )
              .is('reply_to_tweet_id', null)
              .gte('created_at', startDate)
              .lte('created_at', endDate)
              .order('created_at', { ascending: false })
              .range(from, from + pageSize - 1)

            if (error) throw error
            return { data, count }
          },
          3,
          1000,
          `fetch page ${page + 1}`,
        )

        const tweets = result.data

        if (tweets && tweets.length > 0) {
          // Update total expected if we have an estimated count
          if (!totalExpected && result.count) {
            totalExpected = result.count
            console.log(`Updated total tweet count to ${totalExpected}`)
          }

          console.log(`Retrieved ${tweets.length} tweets on page ${page + 1}`)

          // Save this batch to its own file
          saveBatchTweets(tweets, page + 1)

          // Keep track of the total count
          totalFetched += tweets.length

          // Show progress percentage
          if (totalExpected > 0) {
            const progressPct = Math.min(
              100,
              Math.round((totalFetched / totalExpected) * 100),
            )
            console.log(
              `Overall progress: ${progressPct}% (${totalFetched}/${totalExpected})`,
            )
          }

          // Save progress after each successful page
          const progress = {
            page: page + 1, // Increment page for next fetch
            hasMore,
            collectedCount: totalFetched,
            totalExpected: totalExpected || undefined,
            lastUpdated: new Date().toISOString(),
          }
          saveProgress(progress)

          // Add to allTweets only if we're returning them
          // This could also be skipped entirely to save memory
          allTweets = [...allTweets, ...tweets]

          // Increment page for next fetch
          page++

          // Check if we've reached the end
          hasMore = tweets.length === pageSize
        } else {
          console.log(`No more tweets found on page ${page + 1}`)
          hasMore = false
        }
      } catch (error) {
        // Check for rate limiting and back off if needed
        if (error.message && error.message.includes('429')) {
          const backoffTime = 60000 + Math.random() * 30000
          console.warn(
            `Rate limited (429). Backing off for ${Math.round(backoffTime / 1000)} seconds...`,
          )

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, backoffTime))

          // Don't advance the page and try again
          console.log(`Retrying page ${page + 1} after backoff...`)
          continue
        }

        console.error(`Failed to fetch page ${page + 1}:`, error)

        // Save progress before breaking
        const progress = {
          page,
          hasMore,
          collectedCount: totalFetched,
          totalExpected: totalExpected || undefined,
          lastUpdated: new Date().toISOString(),
          error: error.message,
        }
        saveProgress(progress)

        break
      }
    }
  } finally {
    // Clear the interval when done
    clearInterval(progressInterval)

    // Final progress save
    const progress = {
      page,
      hasMore: false,
      collectedCount: totalFetched,
      totalExpected: totalExpected || undefined,
      lastUpdated: new Date().toISOString(),
      completed: true,
    }
    saveProgress(progress)
  }

  // Show final progress
  const progressPct =
    totalExpected > 0
      ? Math.min(100, Math.round((totalFetched / totalExpected) * 100))
      : '?'
  console.log(
    `Complete! Found ${totalFetched} top-level tweets${totalExpected ? ` (${progressPct}% of ${totalExpected} expected)` : ''}`,
  )

  // Return all tweet pages combined
  return loadAllPageTweets()
}

/**
 * Ensure the output directory exists
 * @param {string} dirPath - Directory path to create
 */
function ensureDirectoryExists(dirPath) {
  const fullPath = path.resolve(__dirname, dirPath)
  if (!fs.existsSync(fullPath)) {
    console.log(`Creating directory: ${fullPath}`)
    fs.mkdirSync(fullPath, { recursive: true })
  }
  return fullPath
}

/**
 * Save tweets to a JSON file in a dedicated directory
 * @param {Array} tweets - Array of tweets to save
 * @param {string} filename - File name
 * @param {string} dirName - Directory name (default: 'tweet_data')
 * @param {boolean} append - Whether to append to an existing file (default: false)
 */
function saveTweetsToFile(
  tweets,
  filename,
  dirName = 'tweet_data',
  append = false,
) {
  const dirPath = ensureDirectoryExists(dirName)
  const outputPath = path.join(dirPath, filename)

  if (append && fs.existsSync(outputPath)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
      console.log(
        `Appending ${tweets.length} tweets to existing file with ${existingData.length} tweets`,
      )

      // Create a Set of existing tweet IDs for fast lookup
      const existingIds = new Set(existingData.map((tweet) => tweet.tweet_id))

      // Filter out tweets that already exist in the file
      const newTweets = tweets.filter(
        (tweet) => !existingIds.has(tweet.tweet_id),
      )

      if (newTweets.length > 0) {
        const combined = [...existingData, ...newTweets]
        fs.writeFileSync(outputPath, JSON.stringify(combined, null, 2))
        console.log(
          `Saved ${newTweets.length} new tweets (total: ${combined.length}) to ${outputPath}`,
        )
      } else {
        console.log(
          `No new tweets to save. File already contains all ${existingData.length} tweets.`,
        )
      }
      return outputPath
    } catch (error) {
      console.error(`Error appending to ${outputPath}:`, error)
      // Fall back to overwriting if append fails
    }
  }

  // Just write the file if not appending or if append failed
  fs.writeFileSync(outputPath, JSON.stringify(tweets, null, 2))
  console.log(`Saved ${tweets.length} tweets to ${outputPath}`)
  return outputPath
}

/**
 * Get the highest existing page number from saved tweet pages
 * @returns {number} - The highest page number found, or 0 if no pages exist
 */
function getLastPageNumber() {
  const dirPath = BATCHES_DIR
  if (!fs.existsSync(dirPath)) {
    return 0
  }

  const pageFiles = fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith('.json') && file.startsWith('tweets_page_'))

  if (pageFiles.length === 0) {
    return 0
  }

  // Extract page numbers from filenames and find the maximum
  const pageNumbers = pageFiles.map((filename) => {
    // Extract the number part from "tweets_page_0001.json" format
    const match = filename.match(/tweets_page_(\d+)\.json/)
    return match ? parseInt(match[1], 10) : 0
  })

  return Math.max(...pageNumbers)
}

/**
 * Save a batch of tweets incrementally
 * @param {Array} tweets - Batch of tweets to save
 * @param {number} pageNum - Page number for naming
 */
function saveBatchTweets(tweets, pageNum) {
  // Get the last existing page number to ensure we continue from there
  const lastPageNum = getLastPageNumber()

  // If the provided pageNum is less than or equal to the last page number,
  // use lastPageNum + 1 to ensure we don't overwrite existing pages
  const actualPageNum = pageNum <= lastPageNum ? lastPageNum + 1 : pageNum

  const pageFilename = `tweets_page_${actualPageNum.toString().padStart(4, '0')}.json`
  console.log(
    `Saving as page ${actualPageNum} (last existing page was ${lastPageNum})`,
  )
  return saveTweetsToFile(
    tweets,
    pageFilename,
    'tweet_data/batches-potential-tweets',
    false,
  )
}

/**
 * Save progress file to resume later
 * @param {Object} progress - Progress object with page, hasMore, etc.
 */
function saveProgress(progress) {
  const dirPath = ensureDirectoryExists('tweet_data')
  const progressPath = path.join(dirPath, 'fetch_progress.json')
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2))
  console.log(`Saved progress to ${progressPath}`)
}

/**
 * Load progress file if it exists
 */
function loadProgress() {
  const progressPath = path.resolve(__dirname, 'tweet_data/fetch_progress.json')
  if (fs.existsSync(progressPath)) {
    try {
      const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'))
      console.log(
        `Loaded progress: page ${progress.page}, collected ${progress.collectedCount} tweets so far`,
      )
      return progress
    } catch (error) {
      console.error('Error loading progress file:', error)
    }
  }
  return null
}

/**
 * Load all tweets from pages directory
 * @returns {Array} - Combined array of all tweets
 */
function loadAllPageTweets() {
  const dirPath = BATCHES_DIR
  if (!fs.existsSync(dirPath)) {
    console.log('No page tweet data found.')
    return []
  }

  let allTweets = []
  const files = fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith('.json') && file.startsWith('tweets_page_'))
    .sort() // Sort files to process them in order

  console.log(`Found ${files.length} tweet page files.`)

  for (const file of files) {
    const filePath = path.join(dirPath, file)
    try {
      const tweets = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      console.log(`Loaded ${tweets.length} tweets from ${file}`)
      allTweets = [...allTweets, ...tweets]
    } catch (error) {
      console.error(`Error loading tweets from ${file}:`, error)
    }
  }

  // Deduplicate tweets by tweet_id
  const uniqueIds = new Set()
  const uniqueTweets = allTweets.filter((tweet) => {
    if (uniqueIds.has(tweet.tweet_id)) return false
    uniqueIds.add(tweet.tweet_id)
    return true
  })

  console.log(
    `Loaded ${uniqueTweets.length} unique tweets from ${files.length} files.`,
  )
  return uniqueTweets
}

/**
 * Load tweets from a combined file
 * @param {string} filename - File name to load
 * @param {string} dirName - Directory name (default: 'tweet_data')
 */
function loadTweetsFromFile(filename, dirName = 'tweet_data') {
  const filePath = path.resolve(__dirname, dirName, filename)
  if (fs.existsSync(filePath)) {
    try {
      console.log(`Loading tweets from ${filePath}...`)
      const tweets = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      console.log(`Loaded ${tweets.length} tweets from file`)
      return tweets
    } catch (error) {
      console.error(`Error loading tweets from ${filePath}:`, error)
    }
  }

  // If the file doesn't exist, try to load from pages
  console.log(`File ${filename} not found, trying to load from pages...`)
  return loadAllPageTweets()
}

/**
 * Generate summary statistics about the tweets
 * @param {Array} tweets - Array of tweets
 */
function generateSummary(tweets) {
  console.log('Generating summary statistics...')

  // Count tweets by month
  const tweetsByMonth = {}

  tweets.forEach((tweet) => {
    const date = new Date(tweet.created_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    tweetsByMonth[key] = (tweetsByMonth[key] || 0) + 1
  })

  // Count tweets by user
  const tweetsByUser = {}

  tweets.forEach((tweet) => {
    tweetsByUser[tweet.account_id] = (tweetsByUser[tweet.account_id] || 0) + 1
  })

  const topUsers = Object.entries(tweetsByUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([account_id, count]) => ({ account_id, count }))

  // Calculate average engagement (retweets, favorites)
  let totalRetweets = 0
  let totalFavorites = 0
  let maxRetweets = 0
  let maxFavorites = 0
  let mostRetweetedTweet = null
  let mostFavoritedTweet = null

  tweets.forEach((tweet) => {
    totalRetweets += tweet.retweet_count || 0
    totalFavorites += tweet.favorite_count || 0

    if ((tweet.retweet_count || 0) > maxRetweets) {
      maxRetweets = tweet.retweet_count
      mostRetweetedTweet = tweet
    }

    if ((tweet.favorite_count || 0) > maxFavorites) {
      maxFavorites = tweet.favorite_count
      mostFavoritedTweet = tweet
    }
  })

  const avgRetweets = totalRetweets / tweets.length
  const avgFavorites = totalFavorites / tweets.length

  return {
    totalTweets: tweets.length,
    tweetsByMonth,
    topUsers,
    engagement: {
      totalRetweets,
      totalFavorites,
      avgRetweets,
      avgFavorites,
      mostRetweetedTweet,
      mostFavoritedTweet,
    },
    uniqueUsers: Object.keys(tweetsByUser).length,
  }
}

/**
 * Main function
 */
const main = async () => {
  try {
    // First check for page files and load all existing tweets
    let tweets = loadAllPageTweets()

    // If we already have tweets from previous runs, check if we need to fetch more
    const shouldFetchMore =
      process.argv.includes('--fetch') || tweets.length === 0

    if (shouldFetchMore) {
      console.log('Fetching more tweets...')

      // Check if we have a progress file to resume from
      const progress = loadProgress()

      // Fetch tweets (this will save each page and return combined tweets)
      const newTweets = await fetchTopLevelTweets(progress)

      // Load all pages again to ensure we have everything
      tweets = loadAllPageTweets()

      // Save a combined file for convenience
      saveTweetsToFile(tweets, 'combined_tweets.json', 'tweet_data')
    } else {
      console.log(
        `Using ${tweets.length} existing tweets. Use --fetch to get more.`,
      )
    }

    if (tweets.length > 0) {
      // Generate and display summary
      const summary = generateSummary(tweets)

      // Save summary to file
      saveTweetsToFile(summary, 'tweet_summary.json', 'tweet_data')

      // Display summary
      console.log('\nSUMMARY:')
      console.log(`Total Tweets: ${summary.totalTweets}`)
      console.log(`Unique Users: ${summary.uniqueUsers}`)

      console.log('\nEngagement:')
      console.log(`Total Retweets: ${summary.engagement.totalRetweets}`)
      console.log(`Total Favorites: ${summary.engagement.totalFavorites}`)
      console.log(
        `Average Retweets: ${summary.engagement.avgRetweets.toFixed(2)} per tweet`,
      )
      console.log(
        `Average Favorites: ${summary.engagement.avgFavorites.toFixed(2)} per tweet`,
      )

      if (summary.engagement.mostRetweetedTweet) {
        console.log('\nMost Retweeted:')
        console.log(`ID: ${summary.engagement.mostRetweetedTweet.tweet_id}`)
        console.log(
          `Retweets: ${summary.engagement.mostRetweetedTweet.retweet_count}`,
        )
        console.log(
          `Text: ${summary.engagement.mostRetweetedTweet.full_text.substring(0, 100)}...`,
        )
      }

      if (summary.engagement.mostFavoritedTweet) {
        console.log('\nMost Favorited:')
        console.log(`ID: ${summary.engagement.mostFavoritedTweet.tweet_id}`)
        console.log(
          `Favorites: ${summary.engagement.mostFavoritedTweet.favorite_count}`,
        )
        console.log(
          `Text: ${summary.engagement.mostFavoritedTweet.full_text.substring(0, 100)}...`,
        )
      }

      console.log('\nTweets by Month:')
      Object.entries(summary.tweetsByMonth)
        .sort()
        .forEach(([month, count]) => {
          console.log(`${month}: ${count}`)
        })

      console.log('\nTop 20 Users by Tweet Count:')
      summary.topUsers.forEach(({ account_id, count }, index) => {
        console.log(`${index + 1}. User ID ${account_id}: ${count} tweets`)
      })
    }
  } catch (error) {
    console.error('Error in main function:', error)
  }
}

main().catch(console.error)
