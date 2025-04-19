// this script identifies circle tweets from a list of potential circle tweets by querying the syndication api and seeing if it returns a tweet or not
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import * as dotenv from 'dotenv'
import { fetchTweet } from './twitter-syndication/twitter-syndication.mjs'

// Initialize paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Twitter authentication options
const options = {
  cookie: {
    auth_token: '9840d4de0e5a1f7e719fbcc600b1ac3cd89ed477',
    ct0: '94af45e2827b4b5135983ee45d7c762e59b9bcce5ea7994b787a849ab970de2f317a909e498f9adb1a1ba2de3eceab458a7bb5ae8ea345cbe6c360541e3fd8606494439fb1e72d1c1b2285f056983f79',
    kdt: '4tS8PSrt1j4WerEphUKR9qGQyTqUYu7QEgVmyU2d',
    guest_id: 'v1%3A174225237494887459',
  },
}

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') })

// Source and result directories
const pagesDir = path.resolve(__dirname, 'tweet_data/batches-potential-tweets')
const resultsDir = path.resolve(__dirname, 'tweet_data/circle_analysis')

// File paths for ID lists
const QUEUE_FILE = path.join(resultsDir, 'tweet_queue.json')
const PUBLIC_IDS_FILE = path.join(resultsDir, 'public_tweet_ids.json')
const CIRCLE_IDS_FILE = path.join(resultsDir, 'circle_tweet_ids.json')
const FAILED_IDS_FILE = path.join(resultsDir, 'failed_tweet_ids.json')
const MISMATCH_MAPPING_FILE = path.join(resultsDir, 'id_mismatch_mapping.json')

/**
 * Ensure the output directory exists
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Creating directory: ${dirPath}`)
    fs.mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}

/**
 * Initialize or load the queue of tweet IDs to process
 */
function initializeTweetQueue() {
  ensureDirectoryExists(resultsDir)

  // Check if queue file exists
  if (fs.existsSync(QUEUE_FILE)) {
    try {
      const queueData = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'))
      console.log(`Loaded ${queueData.length} tweets from existing queue`)
      return queueData
    } catch (error) {
      console.warn(`Error loading queue file: ${error.message}`)
      console.log('Will rebuild queue from batch files')
    }
  }

  // Queue doesn't exist, build it from batch files
  console.log('Building tweet queue from batch files...')
  const allTweets = loadTweetsFromBatches()
  const tweetIds = allTweets.map((tweet) => tweet.tweet_id)

  // Save the queue
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(tweetIds, null, 2))
  console.log(`Created new queue with ${tweetIds.length} tweet IDs`)

  return tweetIds
}

/**
 * Load tweets from all batch files
 */
function loadTweetsFromBatches() {
  ensureDirectoryExists(pagesDir)

  const pageFiles = fs
    .readdirSync(pagesDir)
    .filter((file) => file.endsWith('.json') && file.startsWith('tweets_page_'))

  if (pageFiles.length === 0) {
    console.error(`No tweet page files found in ${pagesDir}!`)
    process.exit(1)
  }

  let allTweets = []
  for (const file of pageFiles) {
    const filePath = path.join(pagesDir, file)
    try {
      const tweets = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      allTweets = [...allTweets, ...tweets]
    } catch (error) {
      console.error(`Error loading tweets from ${file}:`, error)
    }
  }

  console.log(
    `Loaded ${allTweets.length} tweets from ${pageFiles.length} batch files`,
  )
  return allTweets
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Attempt to fetch a tweet with smart retry logic
 */
async function fetchTweetWithRetry(tweetId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchTweet(tweetId, options)

      // Verify tweet ID matches what we requested (if id_str is available)
      if (result && result.id_str && result.id_str !== tweetId) {
        // No need to retry ID mismatches - return immediately
        console.warn(
          `Warning: Requested tweet ID ${tweetId} but received tweet ID ${result.id_str}`,
        )
        return {
          success: false,
          error: new Error('Tweet ID mismatch'),
          code: 'MISMATCH',
        }
      }

      return { success: true, data: result }
    } catch (error) {
      // Extract HTTP status code if possible
      let statusCode = null
      if (error.message) {
        // Try to extract status code from error message
        const statusMatch =
          error.message.match(/status (\d+)/i) ||
          error.message.match(/HTTP (\d+)/i) ||
          error.message.match(/(\d+) for request/)

        if (statusMatch) {
          statusCode = parseInt(statusMatch[1], 10)
        } else if (error.message.toLowerCase().includes('404')) {
          statusCode = 404
        } else if (error.message.toLowerCase().includes('429')) {
          statusCode = 429
        }
      }

      // Check for known errors that don't need retries
      const hasIdMismatch =
        error.message && error.message.includes('Tweet ID mismatch')
      const isTweetNotFound =
        error.message &&
        (error.message.includes('Tweet not found') || statusCode === 404)

      // Don't retry known error types
      if (hasIdMismatch) {
        return { success: false, error, code: 'MISMATCH' }
      }

      if (isTweetNotFound) {
        return { success: false, error, code: 404 }
      }

      // Rate limiting - wait longer but still retry
      if (statusCode === 429) {
        const waitTime = 5000 * attempt
        console.warn(
          `Rate limited on tweet ${tweetId}. Waiting ${waitTime / 1000}s...`,
        )
        await sleep(waitTime)
        continue
      }

      // Network or other transient errors - only retry if not last attempt
      if (attempt < maxRetries) {
        const isNetworkError =
          error.message &&
          (error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('ENOTFOUND') ||
            error.message.includes('socket') ||
            error.message.includes('network') ||
            error.message.includes('timeout'))

        // Only log if it's a network error worth retrying
        if (isNetworkError) {
          console.log(
            `Network error (${error.message}), retrying (${attempt}/${maxRetries})...`,
          )
        }

        await sleep(1000 * attempt)
        continue
      }

      return { success: false, error, code: statusCode || 'UNKNOWN' }
    }
  }
}

/**
 * Load ID sets from files
 */
function loadIdSets() {
  let publicIds = new Set()
  let circleIds = new Set()
  let failedIds = new Set()
  let mismatchMap = new Map()

  if (fs.existsSync(PUBLIC_IDS_FILE)) {
    try {
      publicIds = new Set(JSON.parse(fs.readFileSync(PUBLIC_IDS_FILE, 'utf8')))
      console.log(`Loaded ${publicIds.size} confirmed public tweet IDs`)
    } catch (error) {
      console.warn(`Error loading public tweet IDs: ${error.message}`)
    }
  }

  if (fs.existsSync(CIRCLE_IDS_FILE)) {
    try {
      circleIds = new Set(JSON.parse(fs.readFileSync(CIRCLE_IDS_FILE, 'utf8')))
      console.log(`Loaded ${circleIds.size} confirmed circle tweet IDs`)
    } catch (error) {
      console.warn(`Error loading circle tweet IDs: ${error.message}`)
    }
  }

  if (fs.existsSync(FAILED_IDS_FILE)) {
    try {
      failedIds = new Set(JSON.parse(fs.readFileSync(FAILED_IDS_FILE, 'utf8')))
      console.log(`Loaded ${failedIds.size} failed tweet IDs (to retry later)`)
    } catch (error) {
      console.warn(`Error loading failed tweet IDs: ${error.message}`)
    }
  }

  if (fs.existsSync(MISMATCH_MAPPING_FILE)) {
    try {
      const mappingData = JSON.parse(
        fs.readFileSync(MISMATCH_MAPPING_FILE, 'utf8'),
      )
      // Convert array of pairs to Map
      mismatchMap = new Map(mappingData)
      console.log(`Loaded ${mismatchMap.size} ID mismatch mappings`)
    } catch (error) {
      console.warn(`Error loading ID mismatch mappings: ${error.message}`)
    }
  }

  return { publicIds, circleIds, failedIds, mismatchMap }
}

/**
 * Save ID sets to files
 */
function saveIdSets(publicIds, circleIds, failedIds, mismatchMap) {
  fs.writeFileSync(PUBLIC_IDS_FILE, JSON.stringify([...publicIds], null, 2))

  fs.writeFileSync(CIRCLE_IDS_FILE, JSON.stringify([...circleIds], null, 2))

  fs.writeFileSync(FAILED_IDS_FILE, JSON.stringify([...failedIds], null, 2))

  // Save mismatch mapping if provided
  if (mismatchMap) {
    fs.writeFileSync(
      MISMATCH_MAPPING_FILE,
      JSON.stringify([...mismatchMap], null, 2),
    )
  }

  console.log(
    `Saved ${publicIds.size} public, ${circleIds.size} circle, and ${failedIds.size} failed tweet IDs${mismatchMap ? ` (${mismatchMap.size} ID mappings)` : ''}`,
  )
}

/**
 * Update the queue file
 */
function updateQueue(remainingIds) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(remainingIds, null, 2))
  console.log(`Updated queue with ${remainingIds.length} remaining tweets`)
}

/**
 * Main function to analyze tweets
 */
async function main() {
  console.log('Starting Circle Tweet Analyzer')

  // Create output directory
  ensureDirectoryExists(resultsDir)

  // Load ID sets
  const { publicIds, circleIds, failedIds, mismatchMap } = loadIdSets()

  // Initialize/load tweet queue
  let tweetQueue = initializeTweetQueue()

  // Create a set of already processed IDs
  const processedIds = new Set([...publicIds, ...circleIds])

  // Filter out already processed tweets from queue
  tweetQueue = tweetQueue.filter((id) => {
    // Skip IDs already categorized as public or circle
    if (processedIds.has(id)) {
      return false
    }

    // Skip IDs that are in the failed list (to retry later)
    if (failedIds.has(id)) {
      return false
    }

    // Also filter out IDs that are already processed via mismatch mapping
    if (mismatchMap.has(id)) {
      const mappedId = mismatchMap.get(id)
      if (publicIds.has(mappedId) || circleIds.has(mappedId)) {
        return false
      }
    }

    return true
  })

  console.log(`Queue has ${tweetQueue.length} unprocessed tweets`)

  // Get limit from command line if provided
  const limitArg = process.argv.find(
    (arg) => !arg.startsWith('-') && !isNaN(parseInt(arg)),
  )
  const limit = limitArg ? parseInt(limitArg) : tweetQueue.length

  // Track stats
  const stats = {
    startTime: Date.now(),
    processed: 0,
    publicCount: 0,
    circleCount: 0,
    notFoundCount: 0,
    errorCount: 0,
    rateLimitCount: 0,
    mismatchCount: 0,
  }

  console.log(`Will process up to ${limit} tweets from the queue`)

  // Process tweets
  let consecutive404Count = 0
  const max404Threshold = 10
  let requestDelay = 500 // ms between requests

  // Handler for Ctrl+C to save progress before exit
  const handleExit = () => {
    console.log('\nSaving progress before exit...')
    saveIdSets(publicIds, circleIds, failedIds, mismatchMap)
    updateQueue(tweetQueue)
    console.log('Progress saved. Exiting.')
    process.exit(0)
  }

  // Handle termination signals
  process.on('SIGINT', handleExit)
  process.on('SIGTERM', handleExit)

  try {
    // Select tweets to process in this run
    const tweetsToProcess = tweetQueue.slice(0, limit)

    for (let i = 0; i < tweetsToProcess.length; i++) {
      const tweetId = tweetsToProcess[i]
      stats.processed++

      // Remove this tweet from the queue
      tweetQueue = tweetQueue.filter((id) => id !== tweetId)

      // Log progress
      if (
        stats.processed % 10 === 0 ||
        stats.processed === tweetsToProcess.length
      ) {
        const progressPct = Math.floor(
          (stats.processed / tweetsToProcess.length) * 100,
        )
        console.log(
          `Progress: ${progressPct}% (${stats.processed}/${tweetsToProcess.length})`,
        )

        // Save progress every 50 tweets
        if (stats.processed % 50 === 0) {
          saveIdSets(publicIds, circleIds, failedIds)
          updateQueue(tweetQueue)
        }
      }

      // Fetch the tweet
      const result = await fetchTweetWithRetry(tweetId)

      if (result.success) {
        // Reset 404 counter on success
        consecutive404Count = 0

        // Check if this is a TweetTombstone with Circle tweet message
        const isCircleTweet =
          result.data?.__typename === 'TweetTombstone' &&
          result.data?.tombstone?.text?.text?.includes(
            'This Post is unavailable',
          )

        if (isCircleTweet) {
          // Confirmed Circle tweet
          circleIds.add(tweetId)
          stats.circleCount++
          console.log(`🔒 Tweet ${tweetId} is a CONFIRMED Circle tweet`)
        } else {
          // Public tweet
          publicIds.add(tweetId)
          stats.publicCount++

          // Only log occasionally to reduce noise
          if (stats.processed % 20 === 0) {
            console.log(`✓ Tweet ${tweetId} is public`)
          }
        }
      } else if (result.code === 404) {
        // 404 error - mark as failed for now
        failedIds.add(tweetId)
        stats.notFoundCount++
        consecutive404Count++

        // If too many consecutive 404s, pause or exit
        if (consecutive404Count >= max404Threshold) {
          console.warn(
            `Warning: ${consecutive404Count} consecutive 404 errors. API may be unstable.`,
          )
          console.log('Taking a 30 second break before continuing...')
          await sleep(30000)
          consecutive404Count = 0
        }
      } else if (result.code === 429) {
        // Rate limiting errors
        stats.rateLimitCount++
        failedIds.add(tweetId)

        // Increase delay between requests
        requestDelay = Math.min(10000, requestDelay * 1.5)
        console.warn(`Rate limited. Increasing delay to ${requestDelay}ms`)

        // Take a longer break on multiple rate limits
        if (stats.rateLimitCount % 3 === 0) {
          const breakTime = 60000 // 1 minute
          console.warn(
            `Taking a ${breakTime / 1000}s break due to rate limiting`,
          )
          await sleep(breakTime)
        }
      } else if (
        result.code === 'MISMATCH' ||
        (result.error &&
          result.error.message &&
          result.error.message.includes('Tweet ID mismatch'))
      ) {
        // Tweet ID mismatch errors - try again with allowIdMismatch
        stats.mismatchCount++

        // Extract the mismatched ID from the error message
        let mismatchedId = null
        if (result.error && result.error.message) {
          const match = result.error.message.match(/received tweet ID (\d+)/)
          if (match && match[1]) {
            mismatchedId = match[1]
          }
        }

        console.log(
          `ID mismatch for tweet ${tweetId}${mismatchedId ? ` (got ${mismatchedId})` : ''} - trying again with allowIdMismatch`,
        )

        // Try again with allowIdMismatch=true
        try {
          const mismatchResult = await fetchTweet(tweetId, {
            ...options,
            allowIdMismatch: true,
          })

          // Successfully got a tweet, but with a different ID
          const receivedId = mismatchResult.id_str

          // Add to the mismatch mapping
          mismatchMap.set(tweetId, receivedId)

          // Check if it's a circle tweet
          const isCircleTweet =
            mismatchResult.__typename === 'TweetTombstone' &&
            mismatchResult.tombstone?.text?.text?.includes(
              'This Post is unavailable',
            )

          if (isCircleTweet) {
            // It's a circle tweet
            circleIds.add(receivedId)
            stats.circleCount++
            console.log(
              `🔒 Mismatched tweet ${tweetId} → ${receivedId} is a CIRCLE tweet`,
            )
          } else {
            // It's a public tweet
            publicIds.add(receivedId)
            stats.publicCount++
            console.log(
              `✓ Mismatched tweet ${tweetId} → ${receivedId} is public`,
            )
          }
        } catch (error) {
          // Failed even with allowIdMismatch, so mark as failed
          failedIds.add(tweetId)
          console.log(
            `Failed to fetch mismatched tweet ${tweetId}: ${error.message}`,
          )
        }
      } else if (
        result.error &&
        result.error.message &&
        result.error.message.includes('Tweet not found')
      ) {
        // Better 404 detection for cases where extraction fails
        stats.notFoundCount++
        failedIds.add(tweetId)
        consecutive404Count++

        // If too many consecutive 404s, pause or exit
        if (consecutive404Count >= max404Threshold) {
          console.warn(
            `Warning: ${consecutive404Count} consecutive 404 errors. API may be unstable.`,
          )
          console.log('Taking a 30 second break before continuing...')
          await sleep(30000)
          consecutive404Count = 0
        }
      } else {
        // Other API errors
        stats.errorCount++
        failedIds.add(tweetId)
        console.log(
          `Error fetching tweet ${tweetId}: ${result.error?.message || 'Unknown error'}`,
        )
      }

      // Delay between requests
      await sleep(requestDelay)
    }

    // Save final results
    saveIdSets(publicIds, circleIds, failedIds, mismatchMap)
    updateQueue(tweetQueue)

    // Calculate elapsed time
    const elapsedSec = (Date.now() - stats.startTime) / 1000

    // Print summary
    console.log(`
Analysis complete in ${(elapsedSec / 60).toFixed(2)} minutes
Processed: ${stats.processed} tweets
Public tweets: ${stats.publicCount}
Circle tweets: ${stats.circleCount}
404 errors (will retry later): ${stats.notFoundCount}
ID mismatches (handled): ${stats.mismatchCount}
Other errors (will retry later): ${stats.errorCount}
Rate limit encounters: ${stats.rateLimitCount}
Remaining in queue: ${tweetQueue.length}
Failed tweets (to retry after queue): ${failedIds.size}
ID mismatch mappings: ${mismatchMap.size}
    `)
  } catch (error) {
    console.error(`Error during processing: ${error.message}`)
    saveIdSets(publicIds, circleIds, failedIds, mismatchMap)
    updateQueue(tweetQueue)
  }
}

/**
 * Debug function to analyze mismatched tweet IDs
 */
async function debugMismatchedIds() {
  console.log('=== Tweet ID Mismatch Debugger ===')

  // Test cases - IDs that have shown mismatches
  const testCases = [
    { requestId: '1730375414940328402', receivedId: '1730361305159323792' },
    { requestId: '1730374896646259016', receivedId: '1728919289430962485' },
    { requestId: '1730373811961249850', receivedId: '1730370716967608469' },
  ]

  console.log('Analyzing mismatched tweet IDs patterns...')
  console.log('\nNumeric Analysis:')
  for (const test of testCases) {
    const reqId = BigInt(test.requestId)
    const recId = BigInt(test.receivedId)
    const diff = reqId - recId
    const diffPercent = Number((diff * 100n) / reqId) / 100

    console.log(`\nRequested: ${test.requestId}`)
    console.log(`Received:  ${test.receivedId}`)
    console.log(`Difference: ${diff.toString()}`)
    console.log(`Diff % of original: ${diffPercent}%`)

    // Calculate time difference (Twitter IDs are snowflake IDs with timestamp)
    // Twitter Epoch is 1288834974657 (Nov 04 2010)
    const twitterEpoch = 1288834974657n
    const msFromEpochReq = (reqId >> 22n) + twitterEpoch
    const msFromEpochRec = (recId >> 22n) + twitterEpoch
    const reqDate = new Date(Number(msFromEpochReq))
    const recDate = new Date(Number(msFromEpochRec))
    const timeDiffMs = Number(msFromEpochReq - msFromEpochRec)
    const timeDiffSec = Math.abs(timeDiffMs) / 1000
    const timeDiffMin = Math.abs(timeDiffSec) / 60

    console.log(`Req timestamp: ${reqDate.toISOString()}`)
    console.log(`Rec timestamp: ${recDate.toISOString()}`)
    console.log(`Time difference: ${timeDiffMin.toFixed(2)} minutes`)
  }

  // Test API calls directly
  console.log('\n\nTesting direct API calls...')
  for (const test of testCases) {
    console.log(`\nTesting direct request for ID: ${test.requestId}`)
    // First try without allowing mismatch
    const result = await fetchTweetWithRetry(test.requestId)

    if (result.success) {
      console.log(`✓ Successful response with ID: ${result.data.id_str}`)
      if (result.data.id_str !== test.requestId) {
        console.log(
          `⚠️ ID mismatch: Requested ${test.requestId} but received ${result.data.id_str}`,
        )
      }
    } else {
      console.log(`✗ Error response: ${result.error?.message}`)
    }

    // Now try with allowIdMismatch option
    console.log(`\nTesting with allowIdMismatch=true for ID: ${test.requestId}`)
    try {
      const mismatchResult = await fetchTweet(test.requestId, {
        ...options,
        allowIdMismatch: true,
      })

      console.log(`✓ Received tweet with ID: ${mismatchResult.id_str}`)
      console.log(
        `Tweet text: "${mismatchResult.text?.substring(0, 100)}${mismatchResult.text?.length > 100 ? '...' : ''}"`,
      )
      console.log(
        `Tweet author: @${mismatchResult.user?.screen_name || 'unknown'}`,
      )
      console.log(
        `Posted at: ${new Date(mismatchResult.created_at).toISOString()}`,
      )

      // Check if this is a reply or part of a thread
      if (mismatchResult.in_reply_to_status_id_str) {
        console.log(
          `This is a reply to tweet: ${mismatchResult.in_reply_to_status_id_str}`,
        )
      }

      // Check quoted status
      if (mismatchResult.quoted_status_id_str) {
        console.log(`This quotes tweet: ${mismatchResult.quoted_status_id_str}`)
      }

      // Check conversation ID if available
      if (mismatchResult.conversation_id_str) {
        console.log(`Conversation ID: ${mismatchResult.conversation_id_str}`)
      }
    } catch (error) {
      console.log(`✗ Error even with allowIdMismatch: ${error.message}`)
    }
  }

  console.log('\n=== Debug Complete ===')
}

/**
 * Test specific tweets
 */
async function testSpecificTweets() {
  // Create output directory
  ensureDirectoryExists(resultsDir)

  // Load ID sets
  const { publicIds, circleIds, failedIds, mismatchMap } = loadIdSets()

  console.log('Testing specific tweets with known ID mismatches')

  const testIds = [
    '1730375414940328402',
    '1730374896646259016',
    '1730373811961249850',
  ]

  const stats = {
    mismatchCount: 0,
    publicCount: 0,
    circleCount: 0,
  }

  for (const tweetId of testIds) {
    console.log(`\nTesting tweet ID: ${tweetId}`)

    // Try to fetch with allowIdMismatch=true
    try {
      const result = await fetchTweet(tweetId, {
        ...options,
        allowIdMismatch: true,
      })

      // Successfully got a tweet, but with a different ID
      const receivedId = result.id_str

      // Add to the mismatch mapping
      mismatchMap.set(tweetId, receivedId)
      stats.mismatchCount++

      // Check if it's a circle tweet
      const isCircleTweet =
        result.__typename === 'TweetTombstone' &&
        result.tombstone?.text?.text?.includes('This Post is unavailable')

      if (isCircleTweet) {
        // It's a circle tweet
        circleIds.add(receivedId)
        stats.circleCount++
        console.log(
          `🔒 Mismatched tweet ${tweetId} → ${receivedId} is a CIRCLE tweet`,
        )
      } else {
        // It's a public tweet
        publicIds.add(receivedId)
        stats.publicCount++
        console.log(
          `✓ Mismatched tweet ${tweetId} → ${receivedId} is public (${result.user?.screen_name || 'unknown'}: "${result.text?.substring(0, 30)}...")`,
        )
      }
    } catch (error) {
      console.log(
        `Failed to fetch mismatched tweet ${tweetId}: ${error.message}`,
      )
    }
  }

  // Save the results
  saveIdSets(publicIds, circleIds, failedIds, mismatchMap)

  console.log(`
Test complete:
- Processed: ${testIds.length} tweets
- ID mismatches: ${stats.mismatchCount}
- Public tweets: ${stats.publicCount}
- Circle tweets: ${stats.circleCount}
- Total ID mappings: ${mismatchMap.size}
  `)
}

// Run the appropriate function based on command line args
if (process.argv.includes('--debug-mismatch')) {
  debugMismatchedIds().catch((error) => {
    console.error('Debug error:', error)
    process.exit(1)
  })
} else if (process.argv.includes('--test-specific')) {
  testSpecificTweets().catch((error) => {
    console.error('Test error:', error)
    process.exit(1)
  })
} else {
  // Run the main script
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
