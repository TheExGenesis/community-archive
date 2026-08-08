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
  type NormalizedRemainingRows,
  type NormalizedTweetRows,
  type NormalizedUserRows,
  normalizeRemainingRows,
  normalizeTweetRows,
  normalizeUserRows,
  removeProblematicCharacters,
} from './archive_normalizer'

// Configuration
const CONFIG = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
  BATCH_SIZE: parseInt(process.env.PG_BATCH_SIZE || '5000', 10), // Optimized for parameter limits
  MEMORY_BATCH_SIZE: parseInt(process.env.MEMORY_BATCH_SIZE || '15000', 10), // Optimized for memory
  DEV_ARCHIVE_PATH: process.env.DEV_ARCHIVE_PATH,
  POSTGRES_CONNECTION_STRING: process.env.POSTGRES_CONNECTION_STRING,
  MAX_MEMORY_MB: parseInt(process.env.MAX_MEMORY_MB || '1000', 10), // Memory limit
  PROCESS_RETWEETS: process.env.PROCESS_RETWEETS !== 'false', // Enable retweet processing by default
  DEBUG_PG_QUERIES: process.env.DEBUG_PG_QUERIES === 'true' // only log if it has been explicitly enabled
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
    columns: ['account_id', 'created_via', 'username', 'created_at', 'account_display_name', 'num_tweets', 'num_following', 'num_followers', 'num_likes'],
    conflict: 'account_id',
    updates: ['username', 'account_display_name', 'num_tweets', 'num_following', 'num_followers', 'num_likes']
  },
  all_profile: {
    columns: ['account_id', 'avatar_media_url', 'header_media_url', 'bio', 'location', 'website', 'archive_upload_id'],
    conflict: 'account_id',
    updates: ['avatar_media_url', 'header_media_url', 'bio', 'location', 'website', 'archive_upload_id']
  },
  tweets: {
    columns: ['tweet_id', 'account_id', 'created_at', 'full_text', 'favorite_count', 'retweet_count', 'reply_to_tweet_id', 'reply_to_user_id', 'reply_to_username', 'archive_upload_id'],
    conflict: 'tweet_id',
    updates: ['favorite_count', 'retweet_count', 'archive_upload_id']
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

export interface ArchiveSink {
  writeUserRows(rows: NormalizedUserRows): Promise<void>
  writeTweetRows(rows: NormalizedTweetRows): Promise<void>
  writeRemainingRows(rows: NormalizedRemainingRows): Promise<void>
}

export class PostgresArchiveSink implements ArchiveSink {
  constructor(private readonly sql: Sql) {}

  async writeUserRows(rows: NormalizedUserRows): Promise<void> {
    await this.insertIfNotEmpty('all_account', rows.accounts, (account) => [
      account.account_id, account.created_via, account.username,
      account.created_at, account.account_display_name, account.num_tweets,
      account.num_following, account.num_followers, account.num_likes
    ])
    await this.insertIfNotEmpty('all_profile', rows.profiles, (profile) => [
      profile.account_id, profile.avatar_media_url, profile.header_media_url,
      profile.bio, profile.location, profile.website, profile.archive_upload_id
    ])
  }

  async writeTweetRows(rows: NormalizedTweetRows): Promise<void> {
    await this.insertIfNotEmpty('tweets', rows.tweets, (tweet) => [
      tweet.tweet_id, tweet.account_id, tweet.created_at, tweet.full_text,
      tweet.favorite_count, tweet.retweet_count, tweet.reply_to_tweet_id,
      tweet.reply_to_user_id, tweet.reply_to_username, tweet.archive_upload_id
    ])
    await this.insertIfNotEmpty('mentioned_users', rows.mentionedUsers, (mention) =>
      [mention.user_id, mention.name, mention.screen_name])
    await this.insertIfNotEmpty('user_mentions', rows.userMentions, (mention) =>
      [mention.tweet_id, mention.mentioned_user_id])
    await this.insertIfNotEmpty('tweet_urls', rows.tweetUrls, (url) =>
      [url.tweet_id, url.url, url.expanded_url, url.display_url])
    await this.insertIfNotEmpty('tweet_media', rows.tweetMedia, (media) =>
      [media.tweet_id, media.media_id, media.media_url, media.media_type,
        media.width, media.height, media.archive_upload_id])
    await this.insertIfNotEmpty('quote_tweets', rows.quoteTweets, (quote) =>
      [quote.tweet_id, quote.quoted_tweet_id])
    await this.insertIfNotEmpty('retweets', rows.retweets, (retweet) =>
      [retweet.tweet_id, retweet.retweeted_tweet_id])
  }

  async writeRemainingRows(rows: NormalizedRemainingRows): Promise<void> {
    await this.insertIfNotEmpty('liked_tweets', rows.likedTweets, (tweet) =>
      [tweet.tweet_id, tweet.full_text])
    await this.insertIfNotEmpty('likes', rows.likes, (like) =>
      [like.account_id, like.liked_tweet_id, like.archive_upload_id])
    await this.insertIfNotEmpty('following', rows.following, (follow) =>
      [follow.account_id, follow.following_account_id, follow.archive_upload_id])
    await this.insertIfNotEmpty('followers', rows.followers, (follower) =>
      [follower.account_id, follower.follower_account_id, follower.archive_upload_id])
  }

  private async insertIfNotEmpty<T>(
    tableName: string,
    data: T[],
    mapFn: (item: T) => any[]
  ): Promise<void> {
    try {
      if (data.length > 0) {
        const config = TABLE_CONFIGS[tableName]
        await bulkInsertWithCopy({
          sql: this.sql,
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
      // This sink runs inside the existing archive transaction. Rethrow so the
      // transaction rolls back and main() marks the upload failed.
      throw error
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

  constructor(sql: Sql, archiveUploadId: number) {
    this.sql = sql
    this.archiveUploadId = archiveUploadId
  }

  async processArchive(archive: any): Promise<void> {

    archive = patchArchive(archive);


    logger.info(`Processing large archive with optimized batch inserts (${getMemoryUsageMB()}MB memory used)`)
    
    // Process everything in a single transaction
    await this.sql.begin(async (trx: Sql) => {
      const sink: ArchiveSink = new PostgresArchiveSink(trx)

      // Process small data first (account, profile, etc.)
      await sink.writeUserRows(normalizeUserRows(archive, this.archiveUploadId))
      
      // Process tweets in streaming chunks to avoid memory issues
      const tweets = archive.tweets || []
      this.totalTweets = tweets.length
      logger.debug(`Processing ${this.totalTweets} tweets in chunks of ${CONFIG.MEMORY_BATCH_SIZE}`)

      // Process tweets in memory-efficient batches
      for (let i = 0; i < tweets.length; i += CONFIG.MEMORY_BATCH_SIZE) {
        const chunk = tweets.slice(i, i + CONFIG.MEMORY_BATCH_SIZE)
        const rows = normalizeTweetRows(
          chunk,
          archive.account?.[0]?.account,
          this.archiveUploadId
        )
        await sink.writeTweetRows(rows)
        
        this.processedTweets += chunk.length
        logger.info(`Processed ${this.processedTweets}/${this.totalTweets} tweets (${getMemoryUsageMB()}MB memory)`)
        
        // Force garbage collection periodically
        if (this.processedTweets % (CONFIG.MEMORY_BATCH_SIZE * 2) === 0 && global.gc) {
          global.gc()
        }
        
        checkMemoryLimit()
      }

      // Process remaining data that depends on all tweets being processed
      await sink.writeRemainingRows(
        normalizeRemainingRows(archive, this.archiveUploadId)
      )
    })
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
