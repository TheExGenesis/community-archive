/**
 * Twitter Syndication API Client
 *
 * A lightweight, functional implementation for accessing Twitter's syndication API
 * without external dependencies beyond node-fetch.
 */

import fetch, { Response as FetchResponse } from 'node-fetch'
import { pipe } from 'fp-ts/function'
import * as O from 'fp-ts/Option'
import * as E from 'fp-ts/Either'
import * as A from 'fp-ts/Array'
import * as R from 'fp-ts/Record'

// Constants
const TIMELINE_URL =
  'https://syndication.twitter.com/srv/timeline-profile/screen-name/'
const TWEET_URL = 'https://cdn.syndication.twimg.com/tweet-result'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0'

// Types
export interface TwitterCookies {
  auth_token: string
  ct0: string
  kdt: string
  guest_id?: string
}

export interface FetchOptions {
  cookie?: string | TwitterCookies
}

export interface FilterOptions {
  includeRetweets?: boolean
  includeReplies?: boolean
}

export interface TimelineUser {
  id_str: string
  name: string
  screen_name: string
  profile_image_url_https: string
  verified: boolean
  is_blue_verified: boolean
  [key: string]: any
}

export interface TweetEntities {
  hashtags?: Array<{ text: string }>
  urls?: Array<{
    url: string
    expanded_url: string
    display_url: string
  }>
  user_mentions?: Array<{
    id_str: string
    name: string
    screen_name: string
  }>
  media?: Array<{
    media_url_https: string
    type: string
    url: string
    [key: string]: any
  }>
  [key: string]: any
}

export interface TimelineTweet {
  id_str: string
  id: number
  text: string
  full_text?: string
  created_at: string
  user: TimelineUser
  in_reply_to_name?: string
  retweeted_status?: TimelineTweet
  entities?: TweetEntities
  extended_entities?: TweetEntities
  retweet_count: number
  favorite_count: number
  reply_count: number
  [key: string]: any
}

export interface TimelineEntry {
  type: string
  entry_id: string
  content: {
    tweet: TimelineTweet
  }
}

export interface TimelineResponse {
  page: string
  query: {
    screenName: string
  }
  props: {
    pageProps: {
      lang: string
      timeline: {
        entries: TimelineEntry[]
      }
    }
  }
}

export interface TweetResponse {
  id_str: string
  created_at: string
  isEdited: boolean
  text: string
  conversation_count?: number
  entities?: TweetEntities
  user: {
    id_str: string
    name: string
    screen_name: string
    profile_image_url_https: string
    verified: boolean
    is_blue_verified: boolean
  }
  [key: string]: any
}

// Helper functions
/**
 * Creates request headers with optional cookie
 */
const createHeaders = (cookie?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
  }

  if (cookie) {
    headers['Cookie'] = cookie
  }

  return headers
}

/**
 * Builds a cookie string from a TwitterCookies object
 */
export const buildCookieString = (cookies: TwitterCookies | string): string => {
  if (typeof cookies === 'string') return cookies

  const entries = Object.entries(cookies)
  let str = 'dnt=1; '

  for (const [k, v] of entries) {
    str += `${k}=${v}; `
  }

  return str.trimEnd()
}

/**
 * Sends a request to the specified URL
 */
const sendRequest = async (
  url: string,
  cookie?: string,
): Promise<FetchResponse> => {
  try {
    const response = await fetch(url, {
      headers: createHeaders(cookie),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    return response
  } catch (error) {
    throw new Error(
      `Failed to fetch from ${url}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Extracts timeline data from HTML response
 */
const extractTimelineData = (html: string): O.Option<TimelineResponse> => {
  const scriptId = '__NEXT_DATA__'
  const regex = new RegExp(
    `<script id="${scriptId}" type="application\/json">([^>]*)<\/script>`,
  )

  try {
    const match = html.match(regex)
    if (match && match[1]) {
      return O.some(JSON.parse(match[1]) as TimelineResponse)
    }

    return O.none
  } catch (error) {
    console.error('Could not extract timeline data:', error)
    return O.none
  }
}

/**
 * Generates a token from a tweet ID
 */
const tokenFromID = (id: string): string => {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
}

/**
 * Checks if a string is numeric
 */
const isNumeric = (str: string): boolean => Number.isFinite(+str)

/**
 * Fetches a user's timeline
 */
export const fetchTimeline = async (
  username: string,
  options: FetchOptions = {},
): Promise<TimelineEntry[]> => {
  const url = `${TIMELINE_URL}${username}`
  const cookie = options.cookie
    ? typeof options.cookie === 'string'
      ? options.cookie
      : buildCookieString(options.cookie)
    : undefined

  try {
    const response = await sendRequest(url, cookie)
    const html = await response.text()

    const timelineData = extractTimelineData(html)

    if (O.isNone(timelineData)) {
      throw new Error('Invalid timeline data structure')
    }

    return timelineData.value.props.pageProps.timeline.entries
  } catch (error) {
    throw new Error(
      `Error fetching timeline for ${username}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Fetches a tweet by ID
 */
export const fetchTweet = async (
  id: string | number,
): Promise<TweetResponse> => {
  try {
    const idStr = id.toString()

    if (idStr.length > 40) {
      throw new Error('Tweet ID too long! Must be less than 40 characters.')
    }

    if (!isNumeric(idStr)) {
      throw new Error('Tweet ID must be a number!')
    }

    const url = new URL(TWEET_URL)
    url.searchParams.set('id', idStr)
    url.searchParams.set('token', tokenFromID(idStr))
    url.searchParams.set('dnt', '1')

    const response = await sendRequest(url.toString())
    return (await response.json()) as TweetResponse
  } catch (error) {
    throw new Error(
      `Error fetching tweet with ID ${id}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Gets tweets from a user's timeline with filtering options
 */
export const getTimelineTweets = async (
  username: string,
  options: FetchOptions = {},
  filters: FilterOptions = {},
): Promise<TimelineTweet[]> => {
  const { includeRetweets = true, includeReplies = true } = filters

  try {
    const entries = await fetchTimeline(username, options)

    const tweets = entries
      .filter((entry) => entry.content && entry.content.tweet)
      .map((entry) => entry.content.tweet)

    return tweets.filter((tweet) => {
      if (!includeRetweets && tweet.retweeted_status) {
        return false
      }

      if (!includeReplies && tweet.in_reply_to_name) {
        return false
      }

      return true
    })
  } catch (error) {
    throw new Error(
      `Error getting timeline tweets for ${username}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Gets the latest tweet from a user's timeline
 */
export const getLatestTweet = async (
  username: string,
  options: FetchOptions = {},
  filters: FilterOptions = {},
): Promise<O.Option<TimelineTweet>> => {
  const tweets = await getTimelineTweets(username, options, filters)
  return tweets.length > 0 ? O.some(tweets[0]) : O.none
}
