import 'server-only'

import { unstable_cache } from 'next/cache'
import {
  fetchAnalyticsGatewayJson,
  type AnalyticsGatewayFetcher,
} from '@/lib/clickhouseGateway'
import { devLog } from '@/lib/devLog'
import type { BangerTweet } from './types'
import {
  PROFILE_BANGERS_INITIAL_LIMIT,
  PROFILE_BANGERS_PAGE_LIMIT,
  PROFILE_BANGERS_PRELOAD_LIMIT,
  type ProfileBangerSort,
} from './profilePagination'

export {
  PROFILE_BANGERS_INITIAL_LIMIT,
  PROFILE_BANGERS_PAGE_LIMIT,
  PROFILE_BANGERS_PRELOAD_LIMIT,
}
export type { ProfileBangerSort } from './profilePagination'

const PAGE_SIZE = 100
const MIN_QUOTE_COUNT = 2
const PROFILE_BANGERS_REVALIDATE_SECONDS = 86_400
const ACCOUNT_ID_PATTERN = /^\d{1,20}$/
const TWEET_ID_PATTERN = /^\d{1,20}$/

interface TopQuoteRow {
  tweetId?: unknown
  quoteCount?: unknown
  quotingAccounts?: unknown
  accountId?: unknown
  username?: unknown
  displayName?: unknown
  avatarMediaUrl?: unknown
  createdAt?: unknown
  fullText?: unknown
  favoriteCount?: unknown
  retweetCount?: unknown
  media?: unknown
  quoteTweetId?: unknown
  quotedTweet?: unknown
}

interface QuotedTweetRow {
  tweetId?: unknown
  accountId?: unknown
  username?: unknown
  accountDisplayName?: unknown
  avatarMediaUrl?: unknown
  createdAt?: unknown
  fullText?: unknown
  favoriteCount?: unknown
  retweetCount?: unknown
  replyToUsername?: unknown
  media?: unknown
}

interface TopQuoteMediaRow {
  mediaUrl?: unknown
  mediaType?: unknown
  width?: unknown
  height?: unknown
}

interface TopQuotesResponse {
  data?: unknown
  pagination?: {
    limit?: unknown
    offset?: unknown
    nextOffset?: unknown
    totalAvailable?: unknown
    yearCounts?: unknown
  }
  query?: {
    targetAccountId?: unknown
    minQuoteCount?: unknown
    excludeSelf?: unknown
    targetCommunityUsersOnly?: unknown
    quoteCommunityUsersOnly?: unknown
    sort?: unknown
    year?: unknown
  }
}

export interface ProfileBangersPage extends ProfileBangers {
  nextOffset: number | null
}

export interface ProfileBangersPageState extends ProfileBangersPage {
  available: boolean
}

export interface ProfileBangersPageOptions {
  limit: number
  offset?: number
  year?: number
  sort?: ProfileBangerSort
}

export interface ProfileBangers {
  tweets: BangerTweet[]
  yearCounts: { year: number; count: number }[]
  total: number
}

export interface ProfileBangersState extends ProfileBangers {
  available: boolean
}

const safeCount = (value: unknown, label: string): number => {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`ClickHouse returned an invalid ${label}`)
  }
  return count
}

const safeTimestamp = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('ClickHouse returned an invalid banger timestamp')
  }
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    throw new Error('ClickHouse returned an invalid banger timestamp')
  }
  return date.toISOString()
}

const mapMedia = (value: unknown): BangerTweet['media'][number] => {
  const row = value as TopQuoteMediaRow
  if (
    typeof row.mediaUrl !== 'string' ||
    !row.mediaUrl.trim() ||
    typeof row.mediaType !== 'string' ||
    !row.mediaType.trim()
  ) {
    throw new Error('ClickHouse returned invalid banger media')
  }
  return {
    media_url: row.mediaUrl,
    media_type: row.mediaType,
    width: safeCount(row.width ?? 0, 'banger media width'),
    height: safeCount(row.height ?? 0, 'banger media height'),
  }
}

const mapQuotedTweet = (
  value: unknown,
): NonNullable<BangerTweet['quoted_tweet']> => {
  const row = value as QuotedTweetRow
  if (
    typeof row.tweetId !== 'string' ||
    !TWEET_ID_PATTERN.test(row.tweetId) ||
    typeof row.accountId !== 'string' ||
    !ACCOUNT_ID_PATTERN.test(row.accountId) ||
    typeof row.username !== 'string' ||
    !row.username ||
    typeof row.fullText !== 'string'
  ) {
    throw new Error('ClickHouse returned an invalid quoted banger tweet')
  }
  return {
    tweet_id: row.tweetId,
    account_id: row.accountId,
    created_at: safeTimestamp(row.createdAt),
    full_text: row.fullText,
    favorite_count: safeCount(
      row.favoriteCount,
      'quoted banger favorite count',
    ),
    retweet_count: safeCount(row.retweetCount, 'quoted banger repost count'),
    reply_to_username:
      typeof row.replyToUsername === 'string' && row.replyToUsername
        ? row.replyToUsername
        : null,
    username: row.username,
    account_display_name:
      typeof row.accountDisplayName === 'string' && row.accountDisplayName
        ? row.accountDisplayName
        : row.username,
    avatar_media_url:
      typeof row.avatarMediaUrl === 'string' && row.avatarMediaUrl.trim()
        ? row.avatarMediaUrl
        : null,
    media: Array.isArray(row.media) ? row.media.map(mapMedia) : [],
  }
}

const mapBanger = (value: unknown, accountId: string): BangerTweet => {
  const row = value as TopQuoteRow
  if (
    typeof row.tweetId !== 'string' ||
    !TWEET_ID_PATTERN.test(row.tweetId) ||
    row.accountId !== accountId ||
    typeof row.username !== 'string' ||
    !row.username ||
    typeof row.fullText !== 'string'
  ) {
    throw new Error('ClickHouse returned an invalid profile banger')
  }
  const quoteCount = safeCount(row.quoteCount, 'banger quote count')
  if (quoteCount < MIN_QUOTE_COUNT) {
    throw new Error(
      'ClickHouse returned a banger below the requested threshold',
    )
  }
  if (
    !Object.prototype.hasOwnProperty.call(row, 'quoteTweetId') ||
    !Object.prototype.hasOwnProperty.call(row, 'quotedTweet')
  ) {
    throw new Error('ClickHouse returned an incomplete banger card package')
  }
  const quoteTweetId =
    row.quoteTweetId === null || row.quoteTweetId === undefined
      ? null
      : typeof row.quoteTweetId === 'string' &&
          TWEET_ID_PATTERN.test(row.quoteTweetId)
        ? row.quoteTweetId
        : (() => {
            throw new Error('ClickHouse returned an invalid quoted tweet ID')
          })()
  const quotedTweet =
    row.quotedTweet === null || row.quotedTweet === undefined
      ? null
      : mapQuotedTweet(row.quotedTweet)
  if (quotedTweet && quotedTweet.tweet_id !== quoteTweetId) {
    throw new Error('ClickHouse returned mismatched quoted tweet content')
  }
  return {
    tweet_id: row.tweetId,
    account_id: accountId,
    created_at: safeTimestamp(row.createdAt),
    full_text: row.fullText,
    favorite_count: safeCount(row.favoriteCount, 'banger favorite count'),
    retweet_count: safeCount(row.retweetCount, 'banger repost count'),
    reply_to_username: null,
    username: row.username,
    account_display_name:
      typeof row.displayName === 'string' && row.displayName
        ? row.displayName
        : row.username,
    avatar_media_url:
      typeof row.avatarMediaUrl === 'string' && row.avatarMediaUrl.trim()
        ? row.avatarMediaUrl
        : null,
    media: Array.isArray(row.media) ? row.media.map(mapMedia) : [],
    quote_count: quoteCount,
    quoting_accounts: safeCount(
      row.quotingAccounts,
      'banger quoting-account count',
    ),
    quote_tweet_id: quoteTweetId,
    quoted_tweet: quotedTweet,
  }
}

const parseYearCounts = (value: unknown): { year: number; count: number }[] => {
  if (!Array.isArray(value)) {
    throw new Error('ClickHouse returned invalid profile banger years')
  }
  return value.map((entry) => {
    const row = entry as { year?: unknown; count?: unknown }
    const year = Number(row.year)
    if (!Number.isInteger(year) || year < 2006 || year > 2200) {
      throw new Error('ClickHouse returned an invalid profile banger year')
    }
    return { year, count: safeCount(row.count, 'profile banger year count') }
  })
}

const gatewaySort = (sort: ProfileBangerSort): 'quotes' | 'likes' | 'recent' =>
  sort === 'newest' ? 'recent' : sort

const boundedPageInteger = (
  value: number,
  label: string,
  minimum: number,
  maximum: number,
) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid profile banger ${label}`)
  }
  return value
}

export async function fetchProfileBangersPage(
  accountId: string,
  options: ProfileBangersPageOptions,
  fetcher: AnalyticsGatewayFetcher = fetchAnalyticsGatewayJson,
): Promise<ProfileBangersPage> {
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error('Profile bangers require a numeric account ID')
  }

  const limit = boundedPageInteger(options.limit, 'limit', 1, PAGE_SIZE)
  const offset = boundedPageInteger(options.offset ?? 0, 'offset', 0, 1_000_000)
  const sort = options.sort ?? 'quotes'
  if (sort !== 'quotes' && sort !== 'likes' && sort !== 'newest') {
    throw new Error('Invalid profile banger sort')
  }
  if (
    options.year !== undefined &&
    (!Number.isInteger(options.year) ||
      options.year < 2006 ||
      options.year > new Date().getUTCFullYear() + 1)
  ) {
    throw new Error('Invalid profile banger year')
  }

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sort: gatewaySort(sort),
    target_account_id: accountId,
    min_quote_count: String(MIN_QUOTE_COUNT),
    exclude_self: 'true',
    target_ca_users_only: 'false',
    quote_ca_users_only: 'true',
  })
  if (options.year !== undefined) params.set('year', String(options.year))

  const response = await fetcher<TopQuotesResponse>(['top-quotes'], params, {
    timeoutMs: 30_000,
  })

  if (!Array.isArray(response.data) || !response.pagination) {
    throw new Error('ClickHouse returned invalid profile banger pagination')
  }
  if (
    response.query?.targetAccountId !== accountId ||
    Number(response.query?.minQuoteCount) !== MIN_QUOTE_COUNT ||
    response.query?.excludeSelf !== true ||
    response.query?.targetCommunityUsersOnly !== false ||
    response.query?.quoteCommunityUsersOnly !== true ||
    response.query?.sort !== gatewaySort(sort) ||
    response.query?.year !== options.year ||
    Number(response.pagination.limit) !== limit ||
    Number(response.pagination.offset) !== offset
  ) {
    throw new Error('ClickHouse returned a mismatched profile banger scope')
  }

  const tweets = response.data.map((value) => mapBanger(value, accountId))
  if (new Set(tweets.map((tweet) => tweet.tweet_id)).size !== tweets.length) {
    throw new Error('ClickHouse repeated a profile banger')
  }
  const yearCounts = parseYearCounts(response.pagination.yearCounts)
  const total = safeCount(
    response.pagination.totalAvailable,
    'profile banger total',
  )
  const rawNextOffset = response.pagination.nextOffset
  const nextOffset =
    rawNextOffset === null
      ? null
      : safeCount(rawNextOffset, 'profile banger next offset')
  if (nextOffset !== null && nextOffset <= offset) {
    throw new Error('ClickHouse returned an invalid banger page cursor')
  }
  if (tweets.length > limit || offset + tweets.length > total) {
    throw new Error('ClickHouse returned an invalid profile banger page')
  }

  return { tweets, yearCounts, total, nextOffset }
}

export async function fetchProfileBangers(
  accountId: string,
  fetcher: AnalyticsGatewayFetcher = fetchAnalyticsGatewayJson,
): Promise<ProfileBangers> {
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error('Profile bangers require a numeric account ID')
  }

  const tweets: BangerTweet[] = []
  const seenTweetIds = new Set<string>()
  const seenOffsets = new Set<number>()
  let offset = 0
  let yearCounts: { year: number; count: number }[] | null = null
  let total: number | null = null

  while (true) {
    if (seenOffsets.has(offset)) {
      throw new Error('ClickHouse returned a repeated banger page cursor')
    }
    seenOffsets.add(offset)

    const page = await fetchProfileBangersPage(
      accountId,
      { limit: PAGE_SIZE, offset },
      fetcher,
    )

    if (yearCounts === null) {
      yearCounts = page.yearCounts
      total = page.total
    }

    for (const tweet of page.tweets) {
      if (seenTweetIds.has(tweet.tweet_id)) {
        throw new Error('ClickHouse repeated a profile banger')
      }
      seenTweetIds.add(tweet.tweet_id)
      tweets.push(tweet)
    }

    const nextOffset = page.nextOffset
    if (nextOffset === null) break
    offset = nextOffset
  }

  if (total !== tweets.length) {
    throw new Error('ClickHouse profile banger pages did not match their total')
  }

  return { tweets, yearCounts: yearCounts ?? [], total: total ?? 0 }
}

const getCachedProfileBangers = unstable_cache(
  fetchProfileBangers,
  ['meta-twitter-profile-bangers-v3'],
  { revalidate: PROFILE_BANGERS_REVALIDATE_SECONDS },
)

const getCachedProfileBangersPage = unstable_cache(
  async (
    accountId: string,
    limit: number,
    offset: number,
    year: number | undefined,
    sort: ProfileBangerSort,
  ) => fetchProfileBangersPage(accountId, { limit, offset, year, sort }),
  ['meta-twitter-profile-bangers-page-v2'],
  { revalidate: PROFILE_BANGERS_REVALIDATE_SECONDS },
)

export async function getProfileBangersPage(
  accountId: string,
  options: ProfileBangersPageOptions,
): Promise<ProfileBangersPageState> {
  try {
    const result = await getCachedProfileBangersPage(
      accountId,
      options.limit,
      options.offset ?? 0,
      options.year,
      options.sort ?? 'quotes',
    )
    return { ...result, available: true }
  } catch (error) {
    devLog('metaTwitter getProfileBangersPage error', {
      accountId,
      options,
      error,
    })
    return {
      tweets: [],
      yearCounts: [],
      total: 0,
      nextOffset: null,
      available: false,
    }
  }
}

export async function getProfileBangers(
  accountId: string,
): Promise<ProfileBangersState> {
  try {
    const result = await getCachedProfileBangers(accountId)
    return { ...result, available: true }
  } catch (error) {
    devLog('metaTwitter getProfileBangers error', { accountId, error })
    return { tweets: [], yearCounts: [], total: 0, available: false }
  }
}
