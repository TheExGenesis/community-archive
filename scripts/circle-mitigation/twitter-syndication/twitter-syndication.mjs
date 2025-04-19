/**
 * Twitter Syndication API Client
 *
 * A lightweight, functional implementation for accessing Twitter's syndication API
 * without external dependencies beyond node-fetch.
 */

// Import dependencies
import { default as fetch } from 'node-fetch'
import { pipe, curry } from 'ramda'

// Constants
const TIMELINE_URL =
  'https://syndication.twitter.com/srv/timeline-profile/screen-name/'
const TWEET_URL = 'https://cdn.syndication.twimg.com/tweet-result'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0'

/**
 * Types
 *
 * @typedef {Object} TwitterCookies
 * @property {string} auth_token - Authentication token
 * @property {string} ct0 - CSRF token
 * @property {string} kdt - Another required token
 * @property {string} [guest_id] - Optional guest ID
 *
 * @typedef {Object} FetchOptions
 * @property {string|TwitterCookies} [cookie] - Cookie string or object
 */

/**
 * Creates request headers with optional cookie
 *
 * @param {string} [cookie] - Optional cookie string
 * @returns {Object} Headers object
 */
const createHeaders = (cookie) => {
  const headers = {
    'User-Agent': USER_AGENT + ' Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://twitter.com',
    Referer: 'https://twitter.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    Connection: 'keep-alive',
  }

  if (cookie) {
    headers['Cookie'] = cookie
  }

  return headers
}

/**
 * Builds a cookie string from a TwitterCookies object
 *
 * @param {TwitterCookies} cookies - Twitter cookie object
 * @returns {string} Formatted cookie string
 */
const buildCookieString = (cookies) => {
  if (typeof cookies === 'string') return cookies

  const entries = Object.entries(cookies)
  let str = 'dnt=1; '

  for (const [k, v] of entries) {
    str += `${k}=${v}; `
  }

  return str.trimEnd()
}

/**
 * Sends a request to the specified URL with rate limit handling
 *
 * @param {string} url - URL to fetch
 * @param {string} [cookie] - Optional cookie string
 * @param {number} [retries=3] - Maximum number of retries for rate limiting
 * @param {number} [initialBackoff=1000] - Initial backoff time in ms
 * @returns {Promise<Response>} Fetch response
 */
const sendRequest = async (url, cookie, retries = 3, initialBackoff = 1000) => {
  try {
    const options = {
      headers: createHeaders(cookie),
      redirect: 'follow',
      follow: 5,
      timeout: 30000,
      cache: 'no-cache',
    }

    let currentTry = 0

    while (true) {
      currentTry++

      // Print the full URL we're fetching
      console.log(`Fetching: ${url}`)

      const response = await fetch(url, options)

      if (response.status === 429 && currentTry <= retries) {
        // Handle rate limiting with exponential backoff
        const backoffTime = initialBackoff * Math.pow(2, currentTry - 1)
        console.warn(
          `Rate limited (429). Backing off for ${backoffTime}ms before retry ${currentTry}/${retries}`,
        )
        await new Promise((resolve) => setTimeout(resolve, backoffTime))
        continue
      }

      // Log any error status codes but return the response to let the caller decide how to handle it
      if (!response.ok) {
        console.warn(`HTTP status ${response.status} for request: ${url.split('?')[0]}`)
      }

      // Success - log status code only for non-200 responses to reduce noise
      if (response.status !== 200) {
        console.log(`Response status: ${response.status}`)
      }

      return response
    }
  } catch (error) {
    console.error(`Fetch error: ${error.message}`)
    throw new Error(
      `Failed to fetch from ${url.split('?')[0]}: ${error.message}`,
    )
  }
}

/**
 * Extracts timeline data from HTML response
 *
 * @param {string} html - HTML string from timeline response
 * @returns {Object|null} Parsed timeline data or null if not found
 */
const extractTimelineData = (html) => {
  const scriptId = '__NEXT_DATA__'
  const regex = new RegExp(
    `<script id="${scriptId}" type="application\/json">([^>]*)<\/script>`,
  )

  try {
    const match = html.match(regex)
    if (match && match[1]) {
      return JSON.parse(match[1])
    }

    throw new Error(`No match found for '${scriptId}'`)
  } catch (error) {
    console.error('Could not extract timeline data:', error)
    return null
  }
}

/**
 * Generates a token from a tweet ID
 *
 * @param {string} id - Tweet ID
 * @returns {string} Generated token
 */
const tokenFromID = (id) => {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
}

/**
 * Checks if a string is numeric
 *
 * @param {string} str - String to check
 * @returns {boolean} True if numeric
 */
const isNumeric = (str) => Number.isFinite(+str)

/**
 * Fetches a user's timeline
 *
 * @param {string} username - Twitter username without @
 * @param {FetchOptions} options - Fetch options
 * @returns {Promise<Array>} Timeline entries
 */
const fetchTimeline = async (username, options = {}) => {
  const url = `${TIMELINE_URL}${username}`
  const cookie = options.cookie
    ? typeof options.cookie === 'string'
      ? options.cookie
      : buildCookieString(options.cookie)
    : null

  try {
    const response = await sendRequest(url, cookie)
    const html = await response.text()
    const data = extractTimelineData(html)

    if (
      !data ||
      !data.props ||
      !data.props.pageProps ||
      !data.props.pageProps.timeline
    ) {
      throw new Error('Invalid timeline data structure')
    }

    return data.props.pageProps.timeline.entries || []
  } catch (error) {
    throw new Error(`Error fetching timeline for ${username}: ${error.message}`)
  }
}

/**
 * Fetches a tweet by ID
 *
 * @param {string|number} id - Tweet ID
 * @param {FetchOptions} options - Fetch options
 * @param {boolean} [options.allowIdMismatch=false] - Whether to allow ID mismatches
 * @returns {Promise<Object>} Tweet data
 */
const fetchTweet = async (id, options = {}) => {
  try {
    id = id.toString()

    if (id.length > 40) {
      throw new Error('Tweet ID too long! Must be less than 40 characters.')
    }

    if (!isNumeric(id)) {
      throw new Error('Tweet ID must be a number!')
    }

    const url = new URL(TWEET_URL)
    url.searchParams.set('id', id)
    url.searchParams.set('token', tokenFromID(id))
    url.searchParams.set('dnt', '1')

    const cookie = options.cookie
      ? typeof options.cookie === 'string'
        ? options.cookie
        : buildCookieString(options.cookie)
      : null

    const response = await sendRequest(url.toString(), cookie)
    
    // Handle non-200 responses
    if (response.status !== 200) {
      // Just log that we received an error page, don't dump the whole HTML
      console.warn(`Received error page with status ${response.status}`)
      throw new Error(`Tweet not found: ${id}`)
    }
    
    // Check if response is JSON or HTML
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('text/html')) {
      console.warn('Received HTML instead of JSON response')
      throw new Error(`Tweet not found: ${id}`)
    }
    
    const tweetData = await response.json().catch(err => {
      console.warn('Failed to parse response as JSON. Likely received HTML error page.')
      throw new Error(`Tweet not found: ${id}`)
    })
    
    // Verify the returned tweet has the requested ID
    if (tweetData.id_str !== id) {
      const mismatchMessage = `Requested tweet ID ${id} but received tweet ID ${tweetData.id_str}`
      console.warn(`Warning: ${mismatchMessage}`)
      
      // Allow user to bypass ID mismatch error with options.allowIdMismatch
      if (options.allowIdMismatch !== true) {
        throw new Error(`Tweet ID mismatch: ${mismatchMessage}`)
      } else {
        console.log('Allowing ID mismatch as per options.allowIdMismatch=true')
      }
    }
    
    return tweetData
  } catch (error) {
    throw new Error(`Error fetching tweet with ID ${id}: ${error.message}`)
  }
}

/**
 * Gets tweets from a user's timeline with filtering options
 *
 * @param {string} username - Twitter username without @
 * @param {FetchOptions} options - Fetch options
 * @param {Object} filters - Filter options
 * @param {boolean} [filters.includeRetweets=true] - Include retweets
 * @param {boolean} [filters.includeReplies=true] - Include replies
 * @returns {Promise<Array>} Filtered timeline tweets
 */
const getTimelineTweets = async (username, options = {}, filters = {}) => {
  const { includeRetweets = true, includeReplies = true } = filters

  try {
    const entries = await fetchTimeline(username, options)

    return entries
      .filter((entry) => entry.content && entry.content.tweet)
      .map((entry) => entry.content.tweet)
      .filter((tweet) => {
        // Filter retweets if needed
        if (!includeRetweets && tweet.retweeted_status) {
          return false
        }

        // Filter replies if needed
        if (!includeReplies && tweet.in_reply_to_name) {
          return false
        }

        return true
      })
  } catch (error) {
    throw new Error(
      `Error getting timeline tweets for ${username}: ${error.message}`,
    )
  }
}

/**
 * Gets the latest tweet from a user's timeline
 *
 * @param {string} username - Twitter username without @
 * @param {FetchOptions} options - Fetch options
 * @param {Object} filters - Filter options
 * @returns {Promise<Object|null>} Latest tweet or null if none found
 */
const getLatestTweet = async (username, options = {}, filters = {}) => {
  const tweets = await getTimelineTweets(username, options, filters)
  return tweets.length > 0 ? tweets[0] : null
}

// Export functions
export {
  fetchTimeline,
  fetchTweet,
  getTimelineTweets,
  getLatestTweet,
  buildCookieString,
}
