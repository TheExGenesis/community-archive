# Twitter Syndication API Client

A lightweight, functional implementation for accessing Twitter's syndication API without external dependencies beyond node-fetch and fp-ts.

## Overview

This client provides a simple way to access Twitter's syndication API, which allows you to fetch public tweets and timelines without requiring authentication (though authentication is supported for better rate limits).

The implementation is inspired by the `twittxr` library but has been rewritten from scratch with a focus on simplicity, functional programming principles, and TypeScript support.

## Features

- Fetch user timelines
- Fetch individual tweets by ID
- Filter tweets (exclude retweets, replies)
- Get the latest tweet from a user
- TypeScript support with comprehensive type definitions
- Functional programming approach using fp-ts
- No heavy dependencies

## Installation

This client is included directly in the scripts directory and doesn't require separate installation. It depends on:

- `node-fetch` for making HTTP requests
- `fp-ts` for functional programming utilities

## Usage

### JavaScript Example

```javascript
import {
  fetchTimeline,
  fetchTweet,
  getTimelineTweets,
  getLatestTweet,
} from './twitter-syndication.js'

// Fetch a user's timeline
const timelineEntries = await fetchTimeline('twitter')
console.log(`Found ${timelineEntries.length} timeline entries`)

// Fetch a specific tweet
const tweet = await fetchTweet('1500000000000000000')
console.log(`Tweet text: ${tweet.text}`)

// Get filtered timeline tweets (excluding retweets)
const tweets = await getTimelineTweets(
  'twitter',
  {},
  { includeRetweets: false },
)
console.log(`Found ${tweets.length} original tweets`)

// Get latest tweet
const latestTweet = await getLatestTweet('twitter')
if (latestTweet._tag === 'Some') {
  console.log(`Latest tweet: ${latestTweet.value.text}`)
}
```

### TypeScript Example

```typescript
import {
  fetchTimeline,
  fetchTweet,
  getTimelineTweets,
  getLatestTweet,
  TimelineTweet,
  TweetResponse,
} from './twitter-syndication'
import * as O from 'fp-ts/Option'
import { pipe } from 'fp-ts/function'

// Fetch a user's timeline
const timelineEntries = await fetchTimeline('twitter')
console.log(`Found ${timelineEntries.length} timeline entries`)

// Fetch a specific tweet
const tweet: TweetResponse = await fetchTweet('1500000000000000000')
console.log(`Tweet text: ${tweet.text}`)

// Get filtered timeline tweets (excluding retweets)
const tweets: TimelineTweet[] = await getTimelineTweets(
  'twitter',
  {},
  { includeRetweets: false },
)
console.log(`Found ${tweets.length} original tweets`)

// Get latest tweet (using fp-ts Option)
const latestTweetOption = await getLatestTweet('twitter')
pipe(
  latestTweetOption,
  O.fold(
    () => console.log('No tweets found'),
    (latestTweet: TimelineTweet) => {
      console.log(`Latest tweet: ${latestTweet.text}`)
    },
  ),
)
```

### Authentication

For better rate limits, you can provide Twitter cookies:

```typescript
const options = {
  cookie: {
    auth_token: 'YOUR_AUTH_TOKEN',
    ct0: 'YOUR_CT0_TOKEN',
    kdt: 'YOUR_KDT_TOKEN',
  },
}

const tweets = await getTimelineTweets('twitter', options)
```

## API Reference

### `fetchTimeline(username: string, options?: FetchOptions): Promise<TimelineEntry[]>`

Fetches a user's timeline entries.

- `username`: Twitter username without @
- `options`: Optional fetch options (cookie for authentication)

### `fetchTweet(id: string | number): Promise<TweetResponse>`

Fetches a specific tweet by ID.

- `id`: Tweet ID (numeric string or number)

### `getTimelineTweets(username: string, options?: FetchOptions, filters?: FilterOptions): Promise<TimelineTweet[]>`

Gets tweets from a user's timeline with filtering options.

- `username`: Twitter username without @
- `options`: Optional fetch options
- `filters`: Optional filters (includeRetweets, includeReplies)

### `getLatestTweet(username: string, options?: FetchOptions, filters?: FilterOptions): Promise<Option<TimelineTweet>>`

Gets the latest tweet from a user's timeline.

- `username`: Twitter username without @
- `options`: Optional fetch options
- `filters`: Optional filters
- Returns an fp-ts Option type

### `buildCookieString(cookies: TwitterCookies | string): string`

Builds a cookie string from a TwitterCookies object.

- `cookies`: Twitter cookies object or string

## Types

The client provides comprehensive TypeScript types for all API responses:

- `TwitterCookies`: Authentication cookies
- `FetchOptions`: Options for fetch requests
- `FilterOptions`: Options for filtering tweets
- `TimelineUser`: User data in timeline responses
- `TweetEntities`: Tweet entities (hashtags, URLs, mentions, media)
- `TimelineTweet`: Tweet data in timeline responses
- `TimelineEntry`: Entry in timeline responses
- `TimelineResponse`: Full timeline response
- `TweetResponse`: Response from tweet fetch

## License

This client is part of the community-archive project and is subject to its license terms.

## Credits

Inspired by the `twittxr` library but rewritten from scratch with a focus on simplicity and functional programming.
