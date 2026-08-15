import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import winston from 'winston'
import type { Logform } from 'winston'
dotenv.config({ path: '.env' })

import postgres from 'postgres'

type Sql = postgres.Sql

import { createClient } from '@supabase/supabase-js'
import {
  fetchSyndicatedTweetForIngestion,
  recoverSyndicatedConversation,
  type SyndicatedTweetFetcher,
  type SyndicatedTweetForIngestion,
} from './twitter_syndication'

// Configuration
const configuredSyndicationMaxDepth = parseInt(
  process.env.SYNDICATION_CONVERSATION_MAX_DEPTH || '64',
  10,
)
const CONFIG = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
  BATCH_SIZE: parseInt(process.env.PG_BATCH_SIZE || '1000', 10), // Conservative for large archives and pooler links
  MEMORY_BATCH_SIZE: parseInt(process.env.MEMORY_BATCH_SIZE || '3000', 10), // Bounds per-chunk memory and write pressure
  DEV_ARCHIVE_PATH: process.env.DEV_ARCHIVE_PATH,
  POSTGRES_CONNECTION_STRING: process.env.POSTGRES_CONNECTION_STRING,
  MAX_MEMORY_MB: parseInt(process.env.MAX_MEMORY_MB || '1000', 10), // Memory limit
  PROCESS_RETWEETS: process.env.PROCESS_RETWEETS !== 'false', // Enable retweet processing by default
  DEBUG_PG_QUERIES: process.env.DEBUG_PG_QUERIES === 'true', // only log if it has been explicitly enabled
  SYNDICATION_CONVERSATION_RECOVERY_ENABLED:
    process.env.SYNDICATION_CONVERSATION_RECOVERY_ENABLED === 'true',
  SYNDICATION_CONVERSATION_MAX_DEPTH: Number.isFinite(
    configuredSyndicationMaxDepth,
  )
    ? Math.max(1, configuredSyndicationMaxDepth)
    : 64,
} as const

export async function createServerScriptClient() {
  const getSupabaseConfig = (includeServiceRole: boolean = false) => {
    const isDevelopment = process.env.NODE_ENV === 'development'
    const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'
  
    const getUrl = () =>
      isDevelopment && !useRemoteDevDb
        ? process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL!
        : process.env.NEXT_PUBLIC_SUPABASE_URL!
  
    const getAnonKey = () =>
      isDevelopment && !useRemoteDevDb
        ? process.env.NEXT_PUBLIC_LOCAL_ANON_KEY!
        : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
    const getServiceRole = () =>
      isDevelopment && !useRemoteDevDb
        ? process.env.NEXT_PUBLIC_LOCAL_SERVICE_ROLE!
        : process.env.SUPABASE_SERVICE_ROLE!
  
    const config = {
      url: getUrl(),
      anonKey: getAnonKey(),
      ...(includeServiceRole ? { serviceRole: getServiceRole() } : {}),
    }
  
    return config
  }
  const { url, serviceRole } = getSupabaseConfig(true)
  return createClient(url!, serviceRole!)
}

interface CopyInsertConfig<T> {
  sql: Sql
  tableName: string
  columns: string[]
  conflictTarget: string | string[] | null
  updateColumns?: string[]
  data: T[]
  mapFn: (item: T) => any[]
}

interface TableConfig {
  columns: string[]
  conflict: string | string[]
  updates?: string[]
}

const logsDir = path.resolve(process.cwd(), 'logs')
// Logger setup
function createLogger() {
  
  try { 
    fs.mkdirSync(logsDir, { recursive: true }) 
  } catch {}

  const logger = winston.createLogger({
    level: CONFIG.LOG_LEVEL,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf((info: Logform.TransformableInfo) => 
        `${info.timestamp} [${info.level}] ${info.message}`
      )
    ),
    transports: [
      new winston.transports.File({ 
        filename: path.join(logsDir, 'process_archive.log'), 
        maxsize: 10 * 1024 * 1024, 
        maxFiles: 50 
      }),
      new winston.transports.Console()
    ]
  })

  return logger
}

const logger = createLogger()

// Table configurations
const TABLE_CONFIGS: Record<string, TableConfig> = {
  all_account: {
    columns: ['account_id', 'created_via', 'username', 'created_at', 'account_display_name', 'num_tweets', 'num_following', 'num_followers', 'num_likes', 'is_tombstone'],
    conflict: 'account_id',
    updates: ['created_via', 'username', 'created_at', 'account_display_name', 'num_tweets', 'num_following', 'num_followers', 'num_likes', 'is_tombstone']
  },
  all_profile: {
    columns: ['account_id', 'avatar_media_url', 'header_media_url', 'bio', 'location', 'website', 'archive_upload_id'],
    conflict: 'account_id',
    updates: ['avatar_media_url', 'header_media_url', 'bio', 'location', 'website', 'archive_upload_id']
  },
  tweets: {
    columns: ['tweet_id', 'account_id', 'created_at', 'full_text', 'favorite_count', 'retweet_count', 'reply_to_tweet_id', 'reply_to_user_id', 'reply_to_username', 'archive_upload_id', 'is_tombstone'],
    conflict: 'tweet_id',
    updates: ['account_id', 'created_at', 'full_text', 'favorite_count', 'retweet_count', 'reply_to_tweet_id', 'reply_to_user_id', 'reply_to_username', 'archive_upload_id', 'is_tombstone']
  },
  conversations: {
    columns: ['tweet_id', 'conversation_id', 'producer_source', 'resolution_status', 'resolved_at', 'attempt_count', 'next_attempt_at', 'last_error'],
    conflict: 'tweet_id',
    updates: ['conversation_id', 'producer_source', 'resolution_status', 'resolved_at', 'attempt_count', 'next_attempt_at', 'last_error']
  },
  mentioned_users: {
    columns: ['user_id', 'name', 'screen_name'],
    conflict: 'user_id'
  },
  user_mentions: {
    columns: ['tweet_id', 'mentioned_user_id'],
    conflict: ['tweet_id', 'mentioned_user_id']
  },
  tweet_urls: {
    columns: ['tweet_id', 'url', 'expanded_url', 'display_url'],
    conflict: ['tweet_id', 'url'],
    updates: ['expanded_url', 'display_url']
  },
  tweet_media: {
    columns: ['tweet_id', 'media_id', 'media_url', 'media_type', 'width', 'height', 'archive_upload_id'],
    conflict: 'media_id',
    updates: ['media_url', 'width', 'height', 'archive_upload_id']
  },
  quote_tweets: {
    columns: ['tweet_id', 'quoted_tweet_id'],
    conflict: ['tweet_id', 'quoted_tweet_id']
  },
  retweets: {
    columns: ['tweet_id', 'retweeted_tweet_id'],
    conflict: ['tweet_id'],
  },
  likes: {
    columns: ['account_id', 'liked_tweet_id', 'archive_upload_id'],
    conflict: ['account_id', 'liked_tweet_id'],
    updates: ['archive_upload_id']
  },
  liked_tweets: {
    columns: ['tweet_id', 'full_text'],
    conflict: 'tweet_id'
  },
  following: {
    columns: ['account_id', 'following_account_id', 'archive_upload_id'],
    conflict: ['account_id', 'following_account_id'],
    updates: ['archive_upload_id']
  },
  followers: {
    columns: ['account_id', 'follower_account_id', 'archive_upload_id'],
    conflict: ['account_id', 'follower_account_id'],
    updates: ['archive_upload_id']
  }
}

// Utility functions
function removeProblematicCharacters(value: string | null | undefined): string | null {
  if (!value || value === 'NULL') return null
  return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
}

export function authoritativeConversationFromArchiveTweet(tweet: any) {
  const tweetId = String(tweet?.id_str || tweet?.id || '')
  const conversationId = tweet?.conversation_id_str || tweet?.conversation_id
  if (!/^\d{1,20}$/.test(tweetId) || !/^\d{1,20}$/.test(String(conversationId || ''))) {
    return null
  }
  const now = new Date().toISOString()
  return {
    tweet_id: tweetId,
    conversation_id: String(conversationId),
    producer_source: 'archive_upload',
    resolution_status: 'authoritative',
    resolved_at: now,
    attempt_count: 0,
    next_attempt_at: now,
    last_error: null
  }
}

export interface ArchiveConversationResolution {
  conversation_id: string
  producer_source:
    | 'archive_upload_reply_chain'
    | 'archive_upload_syndication'
}

export interface ArchiveConversationRecovery {
  resolutions: Map<string, ArchiveConversationResolution>
  syndicatedTweets: Map<string, SyndicatedTweetForIngestion>
}

function archiveTweetId(tweetRecord: any): string | null {
  const id = String(tweetRecord?.tweet?.id_str || tweetRecord?.tweet?.id || '')
  return /^\d{1,20}$/.test(id) ? id : null
}

function archiveReplyToTweetId(tweetRecord: any): string | null {
  const id = String(tweetRecord?.tweet?.in_reply_to_status_id_str || '')
  return /^\d{1,20}$/.test(id) ? id : null
}

/**
 * Resolve missing archive conversation IDs without holding a DB transaction
 * open across network requests. Local archive links are followed first; only a
 * parent outside the archive is fetched through syndication.
 */
export async function recoverMissingArchiveConversations(
  tweetRecords: any[],
  fetchTweet: SyndicatedTweetFetcher = fetchSyndicatedTweetForIngestion,
  maxDepth = CONFIG.SYNDICATION_CONVERSATION_MAX_DEPTH,
): Promise<ArchiveConversationRecovery> {
  const resolutions = new Map<string, ArchiveConversationResolution>()
  const syndicatedTweets = new Map<string, SyndicatedTweetForIngestion>()
  const archiveById = new Map<string, any>()

  for (const record of tweetRecords) {
    const id = archiveTweetId(record)
    if (id) archiveById.set(id, record)
  }

  const fetchCache = new Map<
    string,
    Promise<SyndicatedTweetForIngestion | null>
  >()
  const cachedFetch: SyndicatedTweetFetcher = (id) => {
    const existing = fetchCache.get(id)
    if (existing) return existing
    const request = fetchTweet(id)
    fetchCache.set(id, request)
    return request
  }

  for (const record of tweetRecords) {
    const startId = archiveTweetId(record)
    if (!startId || authoritativeConversationFromArchiveTweet(record.tweet)) {
      continue
    }
    if (resolutions.has(startId)) continue

    const localPath: string[] = []
    const localVisited = new Set<string>()
    let currentId: string | null = startId
    let missingParentId: string | null = null
    let localRootId: string | null = null
    let inheritedResolution: ArchiveConversationResolution | null = null

    while (currentId && localPath.length < maxDepth) {
      if (localVisited.has(currentId)) break
      localVisited.add(currentId)
      const knownResolution = resolutions.get(currentId)
      if (knownResolution) {
        inheritedResolution = knownResolution
        break
      }
      localPath.push(currentId)

      const currentRecord = archiveById.get(currentId)
      if (!currentRecord) {
        missingParentId = currentId
        localPath.pop()
        break
      }

      const parentId = archiveReplyToTweetId(currentRecord)
      if (!parentId) {
        localRootId = currentId
        break
      }
      currentId = parentId
    }

    if (inheritedResolution) {
      for (const tweetId of localPath) {
        resolutions.set(tweetId, inheritedResolution)
      }
      continue
    }

    if (localRootId) {
      for (const tweetId of localPath) {
        if (!resolutions.has(tweetId)) {
          resolutions.set(tweetId, {
            conversation_id: localRootId,
            producer_source: 'archive_upload_reply_chain',
          })
        }
      }
      continue
    }

    if (!missingParentId || localPath.length >= maxDepth) continue
    const remainingDepth = maxDepth - localPath.length
    const recovery = await recoverSyndicatedConversation(
      missingParentId,
      cachedFetch,
      remainingDepth,
    )
    if (!recovery) continue

    for (const tweetId of localPath) {
      resolutions.set(tweetId, {
        conversation_id: recovery.rootTweetId,
        producer_source: 'archive_upload_syndication',
      })
    }
    for (const tweet of recovery.tweets) {
      syndicatedTweets.set(tweet.tweet_id, tweet)
      resolutions.set(tweet.tweet_id, {
        conversation_id: recovery.rootTweetId,
        producer_source: 'archive_upload_syndication',
      })
    }
  }

  return { resolutions, syndicatedTweets }
}

export function filterBlockedSyndicatedTweets(
  tweets: SyndicatedTweetForIngestion[],
  blockedAccountIds: ReadonlySet<string>,
): SyndicatedTweetForIngestion[] {
  return tweets.filter((tweet) => !blockedAccountIds.has(tweet.account_id))
}

function getMemoryUsageMB(): number {
  const usage = process.memoryUsage()
  return Math.round(usage.heapUsed / 1024 / 1024)
}

function checkMemoryLimit(): void {
  const currentMemory = getMemoryUsageMB()
  if (currentMemory > CONFIG.MAX_MEMORY_MB) {
    logger.warn(`Memory usage ${currentMemory}MB exceeds limit ${CONFIG.MAX_MEMORY_MB}MB`)
    // Force garbage collection if available
    
    if (global.gc) {
      global.gc()
      logger.info(`After GC: ${getMemoryUsageMB()}MB`)
    }
    else {
      logger.warn('Garbage collection not available')
    }
  }
}

// High-performance COPY-based insert function
async function bulkInsertWithCopy<T>({
  sql,
  tableName,
  columns,
  conflictTarget,
  updateColumns,
  data,
  mapFn,
}: CopyInsertConfig<T>): Promise<void> {
  if (!data?.length) return

  const startTime = Date.now()

  logger.debug(`BATCH inserting ${data.length} rows into ${tableName}`)
  // Use optimized batch insert with larger batches
  await optimizedBatchInsert({ sql, tableName, columns, conflictTarget, updateColumns, data, mapFn })
  
  const duration = Date.now() - startTime
  logger.debug(`✅ Optimized batch inserted ${data.length} rows into ${tableName} in ${duration}ms (${Math.round(data.length / (duration / 1000))} rows/sec)`)
}

// Optimized batch insert with larger batches
async function optimizedBatchInsert<T>({
  sql,
  tableName,
  columns,
  conflictTarget,
  updateColumns,
  data,
  mapFn,
}: CopyInsertConfig<T>): Promise<void> {
  const conflictColumns = conflictTarget 
    ? Array.isArray(conflictTarget) ? conflictTarget : [conflictTarget]
    : null

  // Calculate safe batch size based on PostgreSQL parameter limit (65534)
  // Each row uses columns.length parameters, so max rows = 65534 / columns.length
  const maxRowsForParams = Math.floor(65000 / columns.length) // Leave some buffer
  const batchSize = Math.min(CONFIG.BATCH_SIZE, maxRowsForParams, 5000) // Cap at reasonable size
  
  logger.debug(`Using batch size ${batchSize} for ${tableName} (${columns.length} columns)`)
  
  const reusableValues = new Array(batchSize)
  let totalInserted = 0

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize)
    
    for (let j = 0; j < batch.length; j++) {
      reusableValues[j] = mapFn(batch[j])
    }
    const values = batch.length === batchSize 
      ? reusableValues 
      : reusableValues.slice(0, batch.length)

    if (conflictColumns) {
      if (updateColumns?.length) {
        const updateSet = updateColumns.reduce((acc, col) => {
          acc[col] = sql`EXCLUDED.${sql(col)}`
          return acc
        }, {} as Record<string, any>)

        await sql`
          INSERT INTO ${sql(tableName)} (${sql(columns)})
          VALUES ${sql(values)}
          ON CONFLICT (${sql(conflictColumns)}) DO UPDATE SET ${sql(updateSet)}
        `
      } else {
        await sql`
          INSERT INTO ${sql(tableName)} (${sql(columns)})
          VALUES ${sql(values)}
          ON CONFLICT (${sql(conflictColumns)}) DO NOTHING
        `
      }
    } else {
      await sql`
        INSERT INTO ${sql(tableName)} (${sql(columns)})
        VALUES ${sql(values)}
      `
    }
    
    totalInserted += batch.length
    
    // Check memory after each batch
    if (totalInserted % (batchSize * 5) === 0) {
      checkMemoryLimit()
    }
  }
}

// Memory-efficient JSON processor with optimized batch inserts
// We could potentially optimize it more by streaming the data in chunks instead of processing the JSON in one go.
export class ArchiveUploadProcessor {
  private sql: Sql
  private archiveUploadId: number
  private processedTweets = 0
  private totalTweets = 0
  private conversationRecovery: ArchiveConversationRecovery = {
    resolutions: new Map(),
    syndicatedTweets: new Map(),
  }

  constructor(sql: Sql, archiveUploadId: number) {
    this.sql = sql
    this.archiveUploadId = archiveUploadId
  }

  async processArchive(archive: any): Promise<void> {

    archive = patchArchive(archive);


    if (CONFIG.SYNDICATION_CONVERSATION_RECOVERY_ENABLED) {
      this.conversationRecovery = await recoverMissingArchiveConversations(
        archive.tweets || [],
      )
      logger.info(
        `Resolved ${this.conversationRecovery.resolutions.size} missing conversation IDs and recovered ${this.conversationRecovery.syndicatedTweets.size} syndicated tweet(s)`,
      )
    }

    logger.info(`Processing large archive with optimized batch inserts (${getMemoryUsageMB()}MB memory used)`)
    
    // Process everything in a single transaction
    await this.sql.begin(async (trx: Sql) => {
      await this.assertArchiveOwnerMayBeStored(trx, archive)

      // Process small data first (account, profile, etc.)
      await this.processUserData(trx, archive)

      // The network walk completed before the transaction. Consent is checked
      // here, at the authoritative write boundary, immediately before eligible
      // recovered rows are persisted.
      await this.processRecoveredSyndicatedTweets(trx, archive.tweets || [])
      
      // Process tweets in streaming chunks to avoid memory issues
      const tweets = archive.tweets || []
      this.totalTweets = tweets.length
      logger.debug(`Processing ${this.totalTweets} tweets in chunks of ${CONFIG.MEMORY_BATCH_SIZE}`)

      // Process tweets in memory-efficient batches
      for (let i = 0; i < tweets.length; i += CONFIG.MEMORY_BATCH_SIZE) {
        const chunk = tweets.slice(i, i + CONFIG.MEMORY_BATCH_SIZE)
        await this.processTweetChunk(trx, chunk, archive.account?.[0]?.account)
        
        this.processedTweets += chunk.length
        logger.info(`Processed ${this.processedTweets}/${this.totalTweets} tweets (${getMemoryUsageMB()}MB memory)`)
        
        // Force garbage collection periodically
        if (this.processedTweets % (CONFIG.MEMORY_BATCH_SIZE * 2) === 0 && global.gc) {
          global.gc()
        }
        
        checkMemoryLimit()
      }

      // Process remaining data that depends on all tweets being processed
      await this.processRemainingData(trx, archive)
    })
  }

  private async assertArchiveOwnerMayBeStored(
    trx: Sql,
    archive: any,
  ): Promise<void> {
    const account = archive.account?.[0]?.account
    const accountId = account?.accountId
    const username = account?.username

    if (!accountId || !username) {
      throw new Error('Archive owner identity is missing')
    }

    const [policy] = await trx`
      SELECT
        EXISTS (
          SELECT 1
          FROM tes.blocked_scraping_users AS blocked
          WHERE blocked.account_id = ${accountId}
        )
        OR EXISTS (
          SELECT 1
          FROM public.optin AS consent
          WHERE consent.explicit_optout IS TRUE
            AND (
              consent.twitter_user_id = ${accountId}
              OR LOWER(consent.username) = LOWER(${username})
            )
        ) AS blocked
    `

    if (policy?.blocked === true) {
      throw new Error(
        `Archive owner ${accountId} is explicitly opted out; refusing all archive writes`,
      )
    }
  }

  private async processUserData(trx: Sql, archive: any): Promise<void> {
    const accountObj = archive.account?.[0]?.account;
    const profileObj = archive.profile?.[0]?.profile

    // Process account
    if (accountObj) {
      const account = [{
        account_id: accountObj.accountId,
        created_via: accountObj.createdVia || 'twitter_archive',
        username: accountObj.username,
        created_at: accountObj.createdAt,
        account_display_name: accountObj.accountDisplayName,
        num_tweets: archive.tweets?.length || 0,
        num_following: archive.following?.length || 0,
        num_followers: archive.follower?.length || 0,
        num_likes: archive.like?.length || 0,
        is_tombstone: false
      }]

      await bulkInsertWithCopy({
        sql: trx,
        tableName: 'all_account',
        columns: TABLE_CONFIGS.all_account.columns,
        conflictTarget: TABLE_CONFIGS.all_account.conflict,
        updateColumns: TABLE_CONFIGS.all_account.updates,
        data: account,
        mapFn: (acc: any) => [acc.account_id, acc.created_via, acc.username, acc.created_at, acc.account_display_name, acc.num_tweets, acc.num_following, acc.num_followers, acc.num_likes, acc.is_tombstone]
      })
    }

    // Process profile
    if (profileObj && accountObj) {
      const profile = [{
        account_id: accountObj.accountId,
        avatar_media_url: removeProblematicCharacters(profileObj.avatarMediaUrl),
        header_media_url: removeProblematicCharacters(profileObj.headerMediaUrl),
        bio: profileObj.description?.bio || null,
        location: profileObj.description?.location || null,
        website: profileObj.description?.website || null,
        archive_upload_id: this.archiveUploadId
      }]

      await bulkInsertWithCopy({
        sql: trx,
        tableName: 'all_profile',
        columns: TABLE_CONFIGS.all_profile.columns,
        conflictTarget: TABLE_CONFIGS.all_profile.conflict,
        updateColumns: TABLE_CONFIGS.all_profile.updates,
        data: profile,
        mapFn: (p: any) => [p.account_id, p.avatar_media_url, p.header_media_url, p.bio, p.location, p.website, p.archive_upload_id]
      })
    }
  }

  private async processRecoveredSyndicatedTweets(
    trx: Sql,
    archiveTweetRecords: any[],
  ): Promise<void> {
    if (this.conversationRecovery.syndicatedTweets.size === 0) return

    const archiveTweetIds = new Set(
      archiveTweetRecords
        .map(archiveTweetId)
        .filter((id): id is string => id !== null),
    )
    const candidates = Array.from(
      this.conversationRecovery.syndicatedTweets.values(),
    ).filter((tweet) => !archiveTweetIds.has(tweet.tweet_id))
    if (candidates.length === 0) return

    const accountIds = candidates.map((tweet) => tweet.account_id)
    const usernames = candidates.map((tweet) => tweet.username.toLowerCase())
    const blockedRows = await trx`
      WITH candidates AS (
        SELECT *
        FROM unnest(
          ${accountIds}::text[],
          ${usernames}::text[]
        ) AS candidate(account_id, username)
      )
      SELECT DISTINCT candidate.account_id
      FROM candidates AS candidate
      WHERE EXISTS (
        SELECT 1
        FROM tes.blocked_scraping_users AS blocked
        WHERE blocked.account_id = candidate.account_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.optin AS consent
        WHERE consent.explicit_optout IS TRUE
          AND (
            NULLIF(BTRIM(consent.twitter_user_id), '') = candidate.account_id
            OR LOWER(consent.username) = candidate.username
          )
      )
    `
    const blockedAccountIds = new Set<string>(
      blockedRows.map((row) => String(row.account_id)),
    )
    const tweets = filterBlockedSyndicatedTweets(
      candidates,
      blockedAccountIds,
    )

    if (blockedAccountIds.size > 0) {
      logger.warn(
        `Skipped ${candidates.length - tweets.length} syndicated tweet(s) whose authors are explicitly opted out`,
      )
    }
    if (tweets.length === 0) return

    const accounts = tweets.map((tweet) => ({
      account_id: tweet.account_id,
      created_via: 'twitter_syndication',
      username: tweet.username,
      created_at: tweet.account_created_at || tweet.created_at,
      account_display_name: tweet.account_display_name,
      num_tweets: 0,
      num_following: 0,
      num_followers: 0,
      num_likes: 0,
    }))
    const profiles = tweets
      .filter(
        (tweet) =>
          tweet.avatar_media_url ||
          tweet.header_media_url ||
          tweet.bio ||
          tweet.location ||
          tweet.website,
      )
      .map((tweet) => ({
        account_id: tweet.account_id,
        avatar_media_url: tweet.avatar_media_url,
        header_media_url: tweet.header_media_url,
        bio: tweet.bio,
        location: tweet.location,
        website: tweet.website,
        archive_upload_id: null,
      }))
    const tweetRows = tweets.map((tweet) => ({
      tweet_id: tweet.tweet_id,
      account_id: tweet.account_id,
      created_at: tweet.created_at,
      full_text: removeProblematicCharacters(tweet.full_text) || '',
      favorite_count: tweet.favorite_count,
      retweet_count: tweet.retweet_count,
      reply_to_tweet_id: tweet.reply_to_tweet_id,
      reply_to_user_id: tweet.reply_to_user_id,
      reply_to_username: tweet.reply_to_username,
      archive_upload_id: null,
    }))
    const now = new Date().toISOString()
    const conversations = tweets.map((tweet) => {
      const resolution = this.conversationRecovery.resolutions.get(
        tweet.tweet_id,
      )!
      return {
        tweet_id: tweet.tweet_id,
        conversation_id: resolution.conversation_id,
        producer_source: 'archive_upload_syndication',
        resolution_status: 'authoritative',
        resolved_at: now,
        attempt_count: 0,
        next_attempt_at: now,
        last_error: null,
      }
    })
    const media = tweets.flatMap((tweet) =>
      tweet.media.map((item) => ({
        tweet_id: tweet.tweet_id,
        media_id: item.media_id,
        media_url: item.media_url,
        media_type: item.media_type,
        width: item.width,
        height: item.height,
        archive_upload_id: null,
      })),
    )
    const urls = tweets.flatMap((tweet) =>
      tweet.urls.map((item) => ({ tweet_id: tweet.tweet_id, ...item })),
    )
    const mentionedUsers = new Map<string, any>()
    const userMentions: any[] = []
    for (const tweet of tweets) {
      for (const mention of tweet.mentions) {
        mentionedUsers.set(mention.user_id, mention)
        userMentions.push({
          tweet_id: tweet.tweet_id,
          mentioned_user_id: mention.user_id,
        })
      }
    }

    // Sparse syndication rows establish missing FKs but never overwrite richer
    // account/profile data from an archive or authenticated API source.
    await bulkInsertWithCopy({
      sql: trx,
      tableName: 'all_account',
      columns: TABLE_CONFIGS.all_account.columns,
      conflictTarget: TABLE_CONFIGS.all_account.conflict,
      data: this.dedupeByConflict(accounts, 'account_id'),
      mapFn: (account: any) => [
        account.account_id,
        account.created_via,
        account.username,
        account.created_at,
        account.account_display_name,
        account.num_tweets,
        account.num_following,
        account.num_followers,
        account.num_likes,
      ],
    })
    await bulkInsertWithCopy({
      sql: trx,
      tableName: 'all_profile',
      columns: TABLE_CONFIGS.all_profile.columns,
      conflictTarget: TABLE_CONFIGS.all_profile.conflict,
      data: this.dedupeByConflict(profiles, 'account_id'),
      mapFn: (profile: any) => [
        profile.account_id,
        profile.avatar_media_url,
        profile.header_media_url,
        profile.bio,
        profile.location,
        profile.website,
        profile.archive_upload_id,
      ],
    })
    await bulkInsertWithCopy({
      sql: trx,
      tableName: 'tweets',
      columns: TABLE_CONFIGS.tweets.columns,
      conflictTarget: TABLE_CONFIGS.tweets.conflict,
      updateColumns: ['favorite_count'],
      data: this.dedupeByConflict(tweetRows, 'tweet_id'),
      mapFn: (tweet: any) => [
        tweet.tweet_id,
        tweet.account_id,
        tweet.created_at,
        tweet.full_text,
        tweet.favorite_count,
        tweet.retweet_count,
        tweet.reply_to_tweet_id,
        tweet.reply_to_user_id,
        tweet.reply_to_username,
        tweet.archive_upload_id,
      ],
    })
    await this.insertIfNotEmpty(trx, 'conversations', conversations, (row) => [
      row.tweet_id,
      row.conversation_id,
      row.producer_source,
      row.resolution_status,
      row.resolved_at,
      row.attempt_count,
      row.next_attempt_at,
      row.last_error,
    ])
    await bulkInsertWithCopy({
      sql: trx,
      tableName: 'tweet_media',
      columns: TABLE_CONFIGS.tweet_media.columns,
      conflictTarget: TABLE_CONFIGS.tweet_media.conflict,
      updateColumns: ['media_url', 'width', 'height'],
      data: this.dedupeByConflict(media, 'media_id'),
      mapFn: (item: any) => [
        item.tweet_id,
        item.media_id,
        item.media_url,
        item.media_type,
        item.width,
        item.height,
        item.archive_upload_id,
      ],
    })
    await this.insertIfNotEmpty(
      trx,
      'mentioned_users',
      Array.from(mentionedUsers.values()),
      (mention) => [mention.user_id, mention.name, mention.screen_name],
    )
    await this.insertIfNotEmpty(trx, 'tweet_urls', urls, (url) => [
      url.tweet_id,
      url.url,
      url.expanded_url,
      url.display_url,
    ])
    await this.insertIfNotEmpty(trx, 'user_mentions', userMentions, (mention) => [
      mention.tweet_id,
      mention.mentioned_user_id,
    ])
  }

  private async processTweetChunk(trx: Sql, tweetChunk: any[], accountObj: any): Promise<void> {
    if (!accountObj) return

    const tweets: any[] = []
    const userMentions: any[] = []
    const mentionedUsersMap = new Map<string, any>()
    const urls: any[] = []
    const media: any[] = []
    const quotes: any[] = []
    const retweets: any[] = []
    const conversations: any[] = []

    // Process each tweet in the chunk
    for (const tweetData of tweetChunk) {
      const tweet = tweetData.tweet
      const tweetId = tweet.id_str || tweet.id
      const recoveredResolution = this.conversationRecovery.resolutions.get(
        String(tweetId),
      )
      const authoritativeConversation =
        authoritativeConversationFromArchiveTweet(tweet) ??
        (recoveredResolution
          ? {
              tweet_id: String(tweetId),
              conversation_id: recoveredResolution.conversation_id,
              producer_source: recoveredResolution.producer_source,
              resolution_status: 'authoritative',
              resolved_at: new Date().toISOString(),
              attempt_count: 0,
              next_attempt_at: new Date().toISOString(),
              last_error: null,
            }
          : null)
      if (authoritativeConversation) conversations.push(authoritativeConversation)

      // Process tweet
      tweets.push({
        tweet_id: tweetId,
        account_id: accountObj.accountId,
        created_at: tweet.created_at,
        full_text: removeProblematicCharacters(tweet.full_text) || '',
        favorite_count: tweet.favorite_count || 0,
        retweet_count: tweet.retweet_count || 0,
        reply_to_tweet_id: removeProblematicCharacters(tweet.in_reply_to_status_id_str),
        reply_to_user_id: removeProblematicCharacters(tweet.in_reply_to_user_id_str),
        reply_to_username: removeProblematicCharacters(tweet.in_reply_to_screen_name),
        archive_upload_id: this.archiveUploadId,
        is_tombstone: false
      })

      // Process mentions
      for (const mention of tweet.entities?.user_mentions || []) {
        const userId = mention.id_str
        
        if (!mentionedUsersMap.has(userId)) {
          mentionedUsersMap.set(userId, {
            user_id: userId,
            name: removeProblematicCharacters(mention.name) || '',
            screen_name: removeProblematicCharacters(mention.screen_name) || ''
          })
        }
        
        userMentions.push({ tweet_id: tweetId, mentioned_user_id: userId })
      }

      // Process URLs and quotes
      for (const url of tweet.entities?.urls || []) {
        urls.push({
          tweet_id: tweetId,
          url: url.url,
          expanded_url: url.expanded_url || '',
          display_url: url.display_url || ''
        })

        const isQuoteTweet = (url.expanded_url?.includes('twitter.com/') || 
                            url.expanded_url?.includes('x.com/')) && 
                           url.expanded_url?.includes('/status/')
        
        if (isQuoteTweet) {
          const quotedTweetId = url.expanded_url?.split('/status/')[1]
          if (quotedTweetId) {
            quotes.push({ tweet_id: tweetId, quoted_tweet_id: quotedTweetId })
          }
        }
      }

      // Process media
      for (const mediaItem of tweet.entities?.media || []) {
        media.push({
          tweet_id: tweetId,
          media_id: mediaItem.id_str,
          media_url: mediaItem.media_url_https || mediaItem.media_url,
          media_type: mediaItem.type,
          width: mediaItem.sizes?.large?.w || 0,
          height: mediaItem.sizes?.large?.h || 0,
          archive_upload_id: this.archiveUploadId
        })
      }

      // Process retweets
      const retweetMatch = tweet.full_text?.match(/^RT @\w+: /)
      if (retweetMatch) {
        retweets.push({ tweet_id: tweetId, retweeted_tweet_id: null })
      }
    }

    // Insert tweets first
    await this.insertIfNotEmpty(trx, 'tweets', tweets, (t: any) => 
      [t.tweet_id, t.account_id, t.created_at, t.full_text, t.favorite_count, t.retweet_count, t.reply_to_tweet_id, t.reply_to_user_id, t.reply_to_username, t.archive_upload_id, t.is_tombstone])

    await this.insertIfNotEmpty(trx, 'conversations', conversations, (c: any) =>
      [c.tweet_id, c.conversation_id, c.producer_source, c.resolution_status, c.resolved_at, c.attempt_count, c.next_attempt_at, c.last_error])

    await this.insertIfNotEmpty(trx, 'mentioned_users', Array.from(mentionedUsersMap.values()), (m: any) => [m.user_id, m.name, m.screen_name]);
    

    // Insert chunk data in parallel using COPY
    const promisesToWork=[    
      () => this.insertIfNotEmpty(trx, 'user_mentions', userMentions, (um: any) => 
        [um.tweet_id, um.mentioned_user_id]),
      
      () => this.insertIfNotEmpty(trx, 'tweet_urls', this.dedupeByConflict(urls, TABLE_CONFIGS.tweet_urls.conflict), (u: any) => 
        [u.tweet_id, u.url, u.expanded_url, u.display_url]),
      
      () => this.insertIfNotEmpty(trx, 'tweet_media', this.dedupeByConflict(media, TABLE_CONFIGS.tweet_media.conflict), (m: any) => 
        [m.tweet_id, m.media_id, m.media_url, m.media_type, m.width, m.height, m.archive_upload_id]),
      
      () => this.insertIfNotEmpty(trx, 'quote_tweets', quotes, (qt: any) => 
        [qt.tweet_id, qt.quoted_tweet_id]),
      
      () => this.insertIfNotEmpty(trx, 'retweets', retweets, (rt: any) => 
        [rt.tweet_id, rt.retweeted_tweet_id])
    ];

    for(const promiseCreator of promisesToWork){
      await promiseCreator();
    }

    // Clear references to help GC
    tweets.length = 0
    userMentions.length = 0
    urls.length = 0
    media.length = 0
    quotes.length = 0
    retweets.length = 0
    conversations.length = 0
  }

  private async processRemainingData(trx: Sql, archive: any): Promise<void> {
    const accountObj = archive.account?.[0]?.account
    if (!accountObj) return


    // Process likes, following, followers (these are typically smaller)
    const operations = [
      {
        table: 'liked_tweets',
        data: (archive.like || []).map((like: any) => ({
          tweet_id: like.like.tweetId,
          full_text: like.like.fullText || ''
        })),
        mapFn: (lt: any) => [lt.tweet_id, lt.full_text]
      },
      {
        table: 'likes',
        data: (archive.like || []).map((like: any) => ({
          account_id: accountObj.accountId,
          liked_tweet_id: like.like.tweetId,
          archive_upload_id: this.archiveUploadId
        })),
        mapFn: (l: any) => [l.account_id, l.liked_tweet_id, l.archive_upload_id]
      },
      {
        table: 'following',
        data: (archive.following || []).map((follow: any) => ({
          account_id: accountObj.accountId,
          following_account_id: follow.following.accountId,
          archive_upload_id: this.archiveUploadId
        })),
        mapFn: (f: any) => [f.account_id, f.following_account_id, f.archive_upload_id]
      },
      {
        table: 'followers',
        data: (archive.follower || []).map((follower: any) => ({
          account_id: accountObj.accountId,
          follower_account_id: follower.follower.accountId,
          archive_upload_id: this.archiveUploadId
        })),
        mapFn: (f: any) => [f.account_id, f.follower_account_id, f.archive_upload_id]
      }
    ]

    for (const operation of operations) {
      await this.insertIfNotEmpty(trx, operation.table, operation.data, operation.mapFn)
    }
  }

  private async insertIfNotEmpty(trx: Sql, tableName: string, data: any[], mapFn: (item: any) => any[]): Promise<void> {
    try{
      if (data.length > 0) {
        const config = TABLE_CONFIGS[tableName]
        await bulkInsertWithCopy({
          sql: trx,
          tableName,
          columns: config.columns,
          conflictTarget: config.conflict,
          updateColumns: config.updates,
          data,
          mapFn
        })
      }
    } catch (error) {
      const errorData = {
        tableName,
        error: error instanceof Error ? error.message : String(error),
        records: data.length
      }
      logger.error(`Error in insertIfNotEmpty ${JSON.stringify(errorData)}`)
      // Rethrow: these inserts run inside a single transaction (sql.begin). A failed
      // statement aborts the whole transaction, so swallowing the error here let the
      // archive be marked 'completed' while every row was rolled back (silent data
      // loss). Propagating it lets main()'s catch mark the upload 'failed' instead.
      throw error
    }
  }

  private dedupeByConflict<T extends Record<string, any>>(
    items: T[], 
    conflict: string | string[] | null
  ): T[] {
    if (!items?.length || !conflict) return items

    const keys = Array.isArray(conflict) ? conflict : [conflict]
    const makeKey = (item: T) => keys.map(k => `${item[k] ?? ''}`).join('||')
    const uniqueItems = new Map<string, T>()

    for (const item of items) {
      const key = makeKey(item)
      if (!uniqueItems.has(key)) {
        uniqueItems.set(key, item)
      }
    }

    return Array.from(uniqueItems.values())
  }
}

// Twitter handle rules: 1-15 chars, alphanumerics and underscore only.
// Used as a chokepoint validator before any path/URL construction to prevent
// path traversal (e.g. `../foo`) or other injection via the archive_upload.username
// column. Applied to both the dev filesystem branch and the Supabase Storage
// branch (defense in depth — do not rely on Storage's rejection of `..`).
const TWITTER_USERNAME_REGEX = /^[A-Za-z0-9_]{1,15}$/

function assertValidUsername(username: string): void {
  if (typeof username !== 'string' || !TWITTER_USERNAME_REGEX.test(username)) {
    throw new Error(
      `Invalid username for archive path construction: ${JSON.stringify(username)} (must match ${TWITTER_USERNAME_REGEX})`
    )
  }
}

async function loadArchiveData(username: string): Promise<any> {
  assertValidUsername(username)
  if (CONFIG.DEV_ARCHIVE_PATH) {
    const archivePath = path.join(CONFIG.DEV_ARCHIVE_PATH, `${username}/archive.json`)
    logger.debug(`Reading archive from filesystem: ${archivePath}`)

    // For very large files, consider streaming JSON parsing
    const fileSize = fs.statSync(archivePath).size
    const fileSizeMB = fileSize / (1024 * 1024)

    logger.info(`Archive file size: ${fileSizeMB.toFixed(1)}MB`)

    const archiveData = fs.readFileSync(archivePath, 'utf8')
    return JSON.parse(archiveData)
  }

  logger.debug(`Downloading archive ${username}/archive.json from Supabase`)
  const supabase = await createServerScriptClient()
  const { data, error } = await supabase.storage
    .from('archives')
    .download(`${username.toLowerCase()}/archive.json`)
  
  if (error) {
    throw new Error(`Failed to download archive for ${username}: ${error.message}`)
  }
  
  const text = await data.text()
  logger.info(`Downloaded archive of ${username} with size: ${(text.length / (1024 * 1024)).toFixed(1)}MB`)
  
  return JSON.parse(text)
}


function patchArchive(archive: any): any {
  try{
    // `tweets` and `like` are optional files in third-party / scripted uploads;
    // default to [] so a missing section doesn't throw and fail the whole archive.
    const tweets = archive.tweets ?? []
    const hasNoteTweets = archive['note-tweet']?.length > 0 || false;
    for(const tweetRecord of tweets) {
      const tweet = tweetRecord.tweet

      tweet.full_text = removeProblematicCharacters(tweet.full_text ?? '')
      if(!hasNoteTweets){
        continue
      }
      let noteTweets = archive['note-tweet'];
      const matchingNoteTweet = noteTweets.find((noteTweetObj:any) => {
        const noteTweet = noteTweetObj.noteTweet
        return (
          (tweet.full_text ?? '').includes(noteTweet.core.text.substring(0, 200)) &&
          Math.abs(
            new Date(tweet.created_at).getTime() -
              new Date(noteTweet.createdAt).getTime(),
          ) < 1000
        )
      })

      if (matchingNoteTweet) {
        tweet.full_text = removeProblematicCharacters(matchingNoteTweet.noteTweet.core.text)
      }
    }
    for (const likeRecord of archive.like ?? []) {
      const like = likeRecord.like;
      like.fullText = removeProblematicCharacters(like.fullText||'')
    }
    return archive

  } catch (error) {
    logger.error(`Error patching archive: ${error}`)
  throw error
  }
}

// Main processing function
async function processSingleArchive(sql: Sql, username: string, archiveUploadId: number): Promise<void> {
  logger.debug(`Loading archive for optimized processing (current memory: ${getMemoryUsageMB()}MB)`)
  
  const archive = await loadArchiveData(username)
  
  // Determine processing strategy based on size
  const tweetsCount = archive.tweets?.length || 0
  const estimatedSizeMB = getMemoryUsageMB()
  
  logger.info(`Archive contains ${tweetsCount} tweets (memory usage: ${estimatedSizeMB}MB)`)
  logger.debug(`Using optimized batch inserts with batch size: ${CONFIG.BATCH_SIZE}`)
  
  const processor = new ArchiveUploadProcessor(sql, archiveUploadId)
  await processor.processArchive(archive)
  
  logger.info(`Optimized processing completed (memory usage: ${getMemoryUsageMB()}MB)`)
}

// Main function
async function main() {
  if (!CONFIG.POSTGRES_CONNECTION_STRING) {
    logger.error('POSTGRES_CONNECTION_STRING is required')
    process.exit(1)
  }
  

  // Enable garbage collection if available
  if (typeof global.gc === 'function') {
    logger.info('Garbage collection available')
  } else {
    logger.warn('Garbage collection not available. Run with --expose-gc for better memory management')
  }

 
  const sql = postgres(CONFIG.POSTGRES_CONNECTION_STRING, { 
    max: 5, 
    idle_timeout: 20, 
    prepare: false, 
    transform: { undefined: null },
    debug: (connection, query, parameters) => {
      if(CONFIG.DEBUG_PG_QUERIES) {
        console.log('SQL Query:', query)
        console.log('Parameters:', parameters)
      }
    }
  })

  try {
    logger.debug(`Starting optimized batch processing with ${getMemoryUsageMB()}MB memory usage`)

    logger.info('Fetching archive_upload records ready for processing...')

    const ready = await sql`
      SELECT au.id, au.account_id, au.username, au.archive_at
      FROM public.archive_upload au
      WHERE upload_phase IN ('ready_for_commit')
      ORDER BY archive_at ASC
    `

    if (!ready.length) {
      logger.info('No records to process.')
      return
    }

    const startTime = new Date()
    logger.info(`Found ${ready.length} record(s) to process.`)
    logger.debug(`Start time: ${startTime.toISOString()}`)
    let archives_processed = 0

    for (const row of ready) {
      const { id: archiveUploadId, account_id, username } = row
      logger.info(`Processing account ${account_id} with optimized batches (archive_upload_id=${archiveUploadId})`)

      try {
        // Mark as committing
        const updateResult = await sql`
          UPDATE public.archive_upload
          SET upload_phase = 'committing'
          WHERE id = ${archiveUploadId} AND upload_phase IN ('ready_for_commit')
          RETURNING id
        `

        if (!updateResult.length) {
          logger.error(`Failed to mark as committing for id=${archiveUploadId}`)
          continue
        }

        // Process archive with optimized batch inserts
        await processSingleArchive(sql, username, archiveUploadId)

        // Mark as completed
        const completeResult = await sql`
          UPDATE public.archive_upload
          SET upload_phase = 'completed'
          WHERE id = ${archiveUploadId}
          RETURNING id
        `
        archives_processed++

        if (!completeResult.length) {
          throw new Error('Failed to mark as completed')
        }

        logger.info(`✅ Successfully completed account ${account_id} with optimized batches (archive_upload_id=${archiveUploadId})`)

        // Force GC between accounts
        if (global.gc) {
          global.gc()
          logger.info(`Memory after GC: ${getMemoryUsageMB()}MB`)
        }

      } catch (error: any) {
        logger.error(`❌ Failed processing account ${account_id} (archive_upload_id=${archiveUploadId}): ${error.message}`)
        
        try {
          await sql`
            UPDATE public.archive_upload
            SET upload_phase = 'failed'
            WHERE id = ${archiveUploadId}
          `
        } catch (statusError) {
          logger.error(`Failed to update status to failed for id=${archiveUploadId}: ${statusError}`)
        }
      }
    }

    const endTime = new Date()
    const duration = (endTime.getTime() - startTime.getTime()) / 1000
    logger.debug(`Completed optimized batch processing at: ${endTime.toISOString()}`)
    logger.info(`Total processing time: ${duration}s`)
    logger.info(`Final memory usage: ${getMemoryUsageMB()}MB`)


    if(CONFIG.PROCESS_RETWEETS && archives_processed > 0) {

      let startTimeRetweet = new Date()
      logger.debug(`Starting retweet processing at: ${startTimeRetweet.toISOString()}`)
      const retweets = await sql`
        WITH rt_matches AS (
          SELECT 
              r.tweet_id,
              t_original.tweet_id as original_tweet_id,
              ROW_NUMBER() OVER (PARTITION BY r.tweet_id ORDER BY t_original.created_at) as rn
          FROM public.retweets r
          JOIN public.tweets t_rt ON r.tweet_id = t_rt.tweet_id
          JOIN public.tweets t_original ON 
              TRIM(REGEXP_REPLACE(t_rt.full_text, '^RT @[^:]+:\s*', '', 'i')) = t_original.full_text
          WHERE r.retweeted_tweet_id IS NULL
          AND t_rt.full_text ~* '^RT @'
      )
      UPDATE public.retweets 
      SET retweeted_tweet_id = rt_matches.original_tweet_id
      FROM rt_matches
      WHERE retweets.tweet_id = rt_matches.tweet_id
      AND rt_matches.rn = 1;
      `
      let endTimeRetweet = new Date()
      let durationRetweet = (endTimeRetweet.getTime() - startTimeRetweet.getTime()) / 1000
      logger.debug(`Retweet processing completed at: ${endTimeRetweet.toISOString()}`)
      logger.info(`Total retweet processing time: ${durationRetweet}s`)
    }

  } finally {
    await sql.end()
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    logger.error(`Fatal error: ${error}`)
    process.exit(1)
  })
}
