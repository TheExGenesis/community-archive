import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env' })
import { createDbScriptClient } from '../src/utils/supabase'
import { Database } from '../src/database-types'
import * as fs from 'fs'
import * as path from 'path'



type Tables = Database['public']['Tables']
type TableNames = keyof Tables

interface ValidationResult {
  table: string
  sourceCount: number
  dbCount: number
  missingItems: any[]
  isValid: boolean
}

interface ValidationSummary {
  fileRoot: string
  results: ValidationResult[]
  isValid: boolean
}

async function validateArchiveUpload(data: any, supabase: any): Promise<ValidationResult> {
  const accountId = data.account[0].account.accountId
  const { count } = await supabase
    .from('archive_upload')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)

  return {
    table: 'archive_upload',
    sourceCount: 1,
    dbCount: count || 0,
    missingItems: count === 0 ? [accountId] : [],
    isValid: count > 0
  }
}

async function validateTweets(data: any, supabase: any): Promise<ValidationResult> {
  const BATCH_SIZE = 200
  const tweetIds = data.tweets.map((t: any) => t.tweet.id)
  const dbTweetIds = new Set<string>()
  
  //console.log(`Processing ${tweetIds.length} tweets in batches of ${BATCH_SIZE}`)
  
  for (let i = 0; i < tweetIds.length; i += BATCH_SIZE) {
    const batchIds = tweetIds.slice(i, i + BATCH_SIZE)
    const { data: dbTweets, error } = await supabase
      .from('tweets')
      .select('tweet_id')
      .in('tweet_id', batchIds)

    if (error) {
      console.error('Error validating tweets batch:', error)
      throw error
    }

    dbTweets?.forEach((t: any) => dbTweetIds.add(t.tweet_id))
    
    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= tweetIds.length) {
      //console.log(`  Processed ${Math.min(i + BATCH_SIZE, tweetIds.length)}/${tweetIds.length} tweets`)
    }
  }

  const missingTweets = tweetIds.filter((id:any) => !dbTweetIds.has(id))

  return {
    table: 'tweets',
    sourceCount: tweetIds.length,
    dbCount: dbTweetIds.size,
    missingItems: missingTweets,
    isValid: missingTweets.length === 0
  }
}

async function validateLikes(data: any, supabase: any): Promise<ValidationResult> {
  const BATCH_SIZE = 200
  const likedTweetIds = data.like.map((l: any) => l.like.tweetId)
  const dbLikeIds = new Set<string>()
  
  console.log(`Processing ${likedTweetIds.length} likes in batches of ${BATCH_SIZE}`)
  
  for (let i = 0; i < likedTweetIds.length; i += BATCH_SIZE) {
    const batchIds = likedTweetIds.slice(i, i + BATCH_SIZE)
    const { data: dbLikes, error } = await supabase
      .from('likes')
      .select('liked_tweet_id')
      .in('liked_tweet_id', batchIds)

    if (error) {
      console.error('Error validating likes batch:', error)
      throw error
    }

    dbLikes?.forEach((l: any) => dbLikeIds.add(l.liked_tweet_id))
    
    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= likedTweetIds.length) {
      //console.log(`  Processed ${Math.min(i + BATCH_SIZE, likedTweetIds.length)}/${likedTweetIds.length} likes`)
    }
  }

  const missingLikes = likedTweetIds.filter((id:any) => !dbLikeIds.has(id))

  return {
    table: 'likes',
    sourceCount: likedTweetIds.length,
    dbCount: dbLikeIds.size,
    missingItems: missingLikes,
    isValid: missingLikes.length === 0
  }
}

async function validateProfile(data: any, supabase: any): Promise<ValidationResult> {
  const accountId = data.account[0].account.accountId
  const { data: dbProfile } = await supabase
    .from('profile')
    .select('*')
    .eq('account_id', accountId)
    .single()

  return {
    table: 'profile',
    sourceCount: 1,
    dbCount: dbProfile ? 1 : 0,
    missingItems: dbProfile ? [] : [accountId],
    isValid: !!dbProfile
  }
}

async function validateTweetMedia(data: any, supabase: any): Promise<ValidationResult> {
  const BATCH_SIZE = 100
  const mediaItems = data.tweets.flatMap((t: any) => 
    t.tweet.entities.media?.map((m: any) => m.media_url_https) || []
  )
  const dbMediaUrls = new Set<string>()

  for (let i = 0; i < mediaItems.length; i += BATCH_SIZE) {
    const batchUrls = mediaItems.slice(i, i + BATCH_SIZE)
    const { data: dbMedia } = await supabase
      .from('tweet_media')
      .select('media_url')
      .in('media_url', batchUrls)

    dbMedia?.forEach((m: any) => dbMediaUrls.add(m.media_url))
  }

  const missingMedia = mediaItems.filter((url:any) => !dbMediaUrls.has(url))

  return {
    table: 'tweet_media',
    sourceCount: mediaItems.length,
    dbCount: dbMediaUrls.size,
    missingItems: missingMedia,
    isValid: missingMedia.length === 0
  }
}

async function validateTweetUrls(data: any, supabase: any): Promise<ValidationResult> {
  const BATCH_SIZE = 200
  const urlItems = data.tweets.flatMap((t: any) => 
    t.tweet.entities.urls?.map((u: any) => ({ tweet_id: t.tweet.id, url: u.url })) || []
  )
  const dbUrls = new Set<string>()

  for (let i = 0; i < urlItems.length; i += BATCH_SIZE) {
    const batchItems = urlItems.slice(i, i + BATCH_SIZE)
    const { data: dbUrlData } = await supabase
      .from('tweet_urls')
      .select('tweet_id, url')
      .in('tweet_id', batchItems.map((item:any) => item.tweet_id))

    dbUrlData?.forEach((u: any) => dbUrls.add(`${u.tweet_id}-${u.url}`))
  }

  const missingUrls = urlItems.filter((item:any) => !dbUrls.has(`${item.tweet_id}-${item.url}`))

  return {
    table: 'tweet_urls',
    sourceCount: urlItems.length,
    dbCount: dbUrls.size,
    missingItems: missingUrls,
    isValid: missingUrls.length === 0
  }
}

async function validateFollowers(data: any, supabase: any): Promise<ValidationResult> {
  const BATCH_SIZE = 200
  const accountId = data.account[0].account.accountId
  const followerIds = data.follower?.map((f: any) => f.follower.accountId) || []
  const dbFollowerIds = new Set<string>()

  for (let i = 0; i < followerIds.length; i += BATCH_SIZE) {
    const batchIds = followerIds.slice(i, i + BATCH_SIZE)
    const { data: dbFollowers } = await supabase
      .from('followers')
      .select('follower_account_id')
      .eq('account_id', accountId)
      .in('follower_account_id', batchIds)

    dbFollowers?.forEach((f: any) => dbFollowerIds.add(f.follower_account_id))
  }

  const missingFollowers = followerIds.filter((id:any) => !dbFollowerIds.has(id))

  return {
    table: 'followers',
    sourceCount: followerIds.length,
    dbCount: dbFollowerIds.size,
    missingItems: missingFollowers,
    isValid: missingFollowers.length === 0
  }
}

async function validateFollowing(data: any, supabase: any): Promise<ValidationResult> {
  const BATCH_SIZE = 200
  const accountId = data.account[0].account.accountId
  const followingIds = data.following?.map((f: any) => f.following.accountId) || []
  const dbFollowingIds = new Set<string>()

  for (let i = 0; i < followingIds.length; i += BATCH_SIZE) {
    const batchIds = followingIds.slice(i, i + BATCH_SIZE)
    const { data: dbFollowing } = await supabase
      .from('following')
      .select('following_account_id')
      .eq('account_id', accountId)
      .in('following_account_id', batchIds)

    dbFollowing?.forEach((f: any) => dbFollowingIds.add(f.following_account_id))
  }

  const missingFollowing = followingIds.filter((id:any) => !dbFollowingIds.has(id))

  return {
    table: 'following',
    sourceCount: followingIds.length,
    dbCount: dbFollowingIds.size,
    missingItems: missingFollowing,
    isValid: missingFollowing.length === 0
  }
}

async function validateUserMentions(data: any, supabase: any): Promise<ValidationResult> {
  const BATCH_SIZE = 200
  const mentions = data.tweets.flatMap((t: any) => 
    t.tweet.entities.user_mentions?.map((m: any) => ({
      tweet_id: t.tweet.id,
      user_id: m.id
    })) || []
  )
  const dbMentions = new Set<string>()

  for (let i = 0; i < mentions.length; i += BATCH_SIZE) {
    const batchMentions = mentions.slice(i, i + BATCH_SIZE)
    const { data: dbMentionData } = await supabase
      .from('user_mentions')
      .select('tweet_id, mentioned_user_id')
      .in('tweet_id', batchMentions.map((m:any) => m.tweet_id))

    dbMentionData?.forEach((m: any) => dbMentions.add(`${m.tweet_id}-${m.mentioned_user_id}`))
  }

  const missingMentions = mentions.filter((m:any) => !dbMentions.has(`${m.tweet_id}-${m.user_id}`))

  return {
    table: 'user_mentions',
    sourceCount: mentions.length,
    dbCount: dbMentions.size,
    missingItems: missingMentions,
    isValid: missingMentions.length === 0
  }
}

async function validateImport(targetPath: string): Promise<ValidationSummary[]> {
  console.log('🔄 Initializing Supabase client...')
  const supabase = await createDbScriptClient()
  console.log('✅ Supabase client initialized')

  console.log('📂 Getting folders from path:', targetPath)
  const filesRoot = getFoldersInPath(targetPath)
  console.log(`📊 Found ${filesRoot.length} folders to process`)
  
  const summaries: ValidationSummary[] = []

  for (let i = 0; i < filesRoot.length; i++) {
    const fileRoot = filesRoot[i]
    console.log(`\n🔍 Processing folder ${i + 1}/${filesRoot.length}: ${fileRoot}`)
    
    const data = await getDataFromFile(fileRoot)
    if (!data) {
      console.log('⚠️  Skipping folder - no valid data found')
      continue
    }

    console.log('✅ Data loaded, running validations...')
    const results = await Promise.all([
      validateArchiveUpload(data, supabase).then(result => {
        console.log(`  ${result.isValid ? '✅' : '❌'} Archive upload validation complete: ${result.isValid ? 'Valid' : 'Invalid'}`)
        return result
      }),
      validateProfile(data, supabase).then(result => {
        console.log(`  ${result.isValid ? '✅' : '❌'} Profile validation complete: ${result.isValid ? 'Valid' : 'Invalid'}`)
        return result
      }),
      validateTweets(data, supabase).then(result => {
        console.log(`  ${result.isValid ? '✅' : '❌'} Tweets validation complete: ${result.isValid ? 'Valid' : 'Invalid'} (${result.dbCount}/${result.sourceCount})`)
        return result
      }),
      validateLikes(data, supabase).then(result => {
        console.log(`  ${result.isValid ? '✅' : '❌'} Likes validation complete: ${result.isValid ? 'Valid' : 'Invalid'} (${result.dbCount}/${result.sourceCount})`)
        return result
      }),
      validateTweetMedia(data, supabase).then(result => {
        console.log(`  ${result.isValid ? '✅' : '❌'} Tweet media validation complete: ${result.isValid ? 'Valid' : 'Invalid'} (${result.dbCount}/${result.sourceCount})`)
        return result
      }),
      validateTweetUrls(data, supabase).then(result => {
        console.log(`  ${result.isValid ? '✅' : '❌'} Tweet URLs validation complete: ${result.isValid ? 'Valid' : 'Invalid'} (${result.dbCount}/${result.sourceCount})`)
        return result
      }),
      validateFollowers(data, supabase).then(result => {
        console.log(`  ${result.isValid ? '✅' : '❌'} Followers validation complete: ${result.isValid ? 'Valid' : 'Invalid'} (${result.dbCount}/${result.sourceCount})`)
        return result
      }),
      validateFollowing(data, supabase).then(result => {
        console.log(`  ${result.isValid ? '✅' : '❌'} Following validation complete: ${result.isValid ? 'Valid' : 'Invalid'} (${result.dbCount}/${result.sourceCount})`)
        return result
      }),
      validateUserMentions(data, supabase).then(result => {
        console.log(`  ${result.isValid ? '✅' : '❌'} User mentions validation complete: ${result.isValid ? 'Valid' : 'Invalid'} (${result.dbCount}/${result.sourceCount})`)
        return result
      }),
    ])

    const summary: ValidationSummary = {
      fileRoot,
      results,
      isValid: results.every(r => r.isValid)
    }

    summaries.push(summary)
    console.log(`${summary.isValid ? '✅' : '❌'} Folder processing complete: ${summary.isValid ? 'All valid' : 'Has invalid items'}`)
  }

  console.log('\n📝 Validation complete for all folders')
  return summaries
}

function getFoldersInPath(directoryPath: string): string[] {
  try {
    const items = fs.readdirSync(directoryPath)
    return items
      .filter(item => fs.statSync(path.join(directoryPath, item)).isDirectory())
      .map(folder => path.join(directoryPath, folder))
  } catch (error) {
    console.error(`Error reading directory: ${error}`)
    return []
  }
}

async function getDataFromFile(filePath: string): Promise<any> {
  try {
    const fileContent = await fs.promises.readFile(
      `${filePath}/archive.json`,
      'utf-8'
    )
    return JSON.parse(fileContent)
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error)
    return null
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting validation process...')
  
  const args = process.argv.slice(2)
  const targetPath = args.find(arg => arg.startsWith('--path='))?.split('=')[1]

  if (!targetPath) {
    console.error('❌ Error: No path provided. Please specify a path using --path=<path>.')
    process.exit(1)
  }

  const summaries = await validateImport(targetPath)
  
  // Generate report with added summary statistics
  let totalValid = 0
  let totalInvalid = 0
  
  summaries.forEach(summary => {
    console.log(`\n📊 Validation results for ${summary.fileRoot}:`)
    console.log('📍 Overall status:', summary.isValid ? '✅ Valid' : '❌ Invalid')
    
    summary.results.forEach(result => {
      console.log(`\n🔍 ${result.table}:`)
      console.log(`  📈 Source count: ${result.sourceCount}`)
      console.log(`  📉 Database count: ${result.dbCount}`)
      console.log(`  ${result.isValid ? '✅' : '❌'} Status: ${result.isValid ? 'Valid' : 'Invalid'}`)
      if (result.missingItems.length > 0) {
        console.log(`  ⚠️  Missing items: ${result.missingItems.length}`)
        console.log(`  🔍 Sample missing items: ${result.missingItems.slice(0, 3).join(', ')}`)
      }
    })

    summary.isValid ? totalValid++ : totalInvalid++
  })

  // Print final summary
  console.log('\n📊 Final Summary:')
  console.log(`✅ Valid archives: ${totalValid}`)
  console.log(`❌ Invalid archives: ${totalInvalid}`)
  console.log(`📈 Total processed: ${totalValid + totalInvalid}`)
}

main().catch(console.error) 