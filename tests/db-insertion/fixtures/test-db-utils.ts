import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'

/**
 * Test Database Utilities - Direct Insertion Version
 * 
 * These utilities help manage test data for the new direct insertion approach:
 * 1. Insert directly into main tables (no temp tables)
 * 2. Use unique test account IDs to identify test data
 * 3. Clean up directly from main tables
 * 4. Focus on end-to-end insertion results
 */

// Test account ID prefix to identify test data
const TEST_ACCOUNT_PREFIX = 'test_'

// Generate unique test account ID using timestamp and random number
export const generateTestAccountId = (): string => {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 10000)
  return `${TEST_ACCOUNT_PREFIX}${timestamp}_${random}`
}

// Create test-specific Supabase client
export const createTestClient = (): SupabaseClient<Database> => {
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  
  if (!isDevelopment) {
    throw new Error('Test client can only be created in development/test mode')
  }
  
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'
  
  const url = useRemoteDevDb 
    ? process.env.NEXT_PUBLIC_SUPABASE_URL!
    : process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL!
    
  const serviceRole = useRemoteDevDb
    ? process.env.SUPABASE_SERVICE_ROLE!
    : process.env.NEXT_PUBLIC_LOCAL_SERVICE_ROLE!
  
  if (!url || !serviceRole) {
    throw new Error('Missing required environment variables for test client')
  }
  
  return createClient<Database>(url, serviceRole)
}

// Track inserted test data for cleanup
export class TestDataTracker {
  private accountIds: Set<string> = new Set()
  private tweetIds: Set<string> = new Set()
  private likedTweetIds: Set<string> = new Set()
  
  addAccountId(id: string) {
    this.accountIds.add(id)
  }
  
  addTweetId(id: string) {
    this.tweetIds.add(id)
  }
  
  addLikedTweetId(id: string) {
    this.likedTweetIds.add(id)
  }
  
  getAccountIds(): string[] {
    return Array.from(this.accountIds)
  }
  
  getTweetIds(): string[] {
    return Array.from(this.tweetIds)
  }
  
  getLikedTweetIds(): string[] {
    return Array.from(this.likedTweetIds)
  }
  
  clear() {
    this.accountIds.clear()
    this.tweetIds.clear()
    this.likedTweetIds.clear()
  }
}

// Clean up test data from main tables
export const cleanupTestData = async (
  supabase: SupabaseClient<Database>,
  tracker: TestDataTracker
): Promise<void> => {
  const accountIds = tracker.getAccountIds()
  const tweetIds = tracker.getTweetIds()
  
  console.log(`🧹 Cleaning up test data for ${accountIds.length} accounts`)
  
  // Order matters due to foreign key constraints
  
  // 1. Delete user_mentions (references tweets and mentioned_users)
  if (tweetIds.length > 0) {
    await supabase
      .from('user_mentions')
      .delete()
      .in('tweet_id', tweetIds)
  }
  
  // 2. Delete tweet_media
  if (tweetIds.length > 0) {
    await supabase
      .from('tweet_media')
      .delete()
      .in('tweet_id', tweetIds)
  }
  
  // 3. Delete tweet_urls
  if (tweetIds.length > 0) {
    await supabase
      .from('tweet_urls')
      .delete()
      .in('tweet_id', tweetIds)
  }
  
  // 4. Delete likes (references accounts and tweets)
  if (accountIds.length > 0) {
    await supabase
      .from('likes')
      .delete()
      .in('account_id', accountIds)
  }
  
  // 5. Delete liked_tweets
  const likedTweetIds = tracker.getLikedTweetIds()
  if (likedTweetIds.length > 0) {
    await supabase
      .from('liked_tweets')
      .delete()
      .in('tweet_id', likedTweetIds)
  }
  
  // 6. Delete followers/following
  if (accountIds.length > 0) {
    await supabase
      .from('followers')
      .delete()
      .or(`account_id.in.(${accountIds.join(',')}),follower_account_id.in.(${accountIds.join(',')})`)
    
    await supabase
      .from('following')
      .delete()
      .or(`account_id.in.(${accountIds.join(',')}),following_account_id.in.(${accountIds.join(',')})`)
  }
  
  // 7. Delete tweets (must come after entities are deleted)
  if (tweetIds.length > 0) {
    // Delete in batches to avoid query size limits
    const batchSize = 1000
    for (let i = 0; i < tweetIds.length; i += batchSize) {
      const batch = tweetIds.slice(i, i + batchSize)
      await supabase
        .from('tweets')
        .delete()
        .in('tweet_id', batch)
    }
  }
  
  // 8. Delete mentioned_users that were only referenced by our test tweets
  if (accountIds.length > 0) {
    // Find mentioned users that no longer have any mentions
    const { data: orphanedUsers } = await supabase
      .from('mentioned_users')
      .select('user_id')
      .not('user_id', 'in', `(SELECT DISTINCT mentioned_user_id FROM user_mentions)`)
    
    if (orphanedUsers && orphanedUsers.length > 0) {
      await supabase
        .from('mentioned_users')
        .delete()
        .in('user_id', orphanedUsers.map(u => u.user_id))
    }
  }
  
  // 9. Delete profiles
  if (accountIds.length > 0) {
    await supabase
      .from('all_profile')
      .delete()
      .in('account_id', accountIds)
  }
  
  // 10. Delete archive_upload records
  if (accountIds.length > 0) {
    await supabase
      .from('archive_upload')
      .delete()
      .in('account_id', accountIds)
  }
  
  // 11. Delete accounts (last, due to foreign key constraints)
  if (accountIds.length > 0) {
    await supabase
      .from('all_account')
      .delete()
      .in('account_id', accountIds)
  }
  
  // 12. Clean up any orphaned test data based on prefix pattern
  // This is a safety net for any missed test data
  await supabase
    .from('all_account')
    .delete()
    .like('account_id', `${TEST_ACCOUNT_PREFIX}%`)
  
  console.log('✅ Test data cleanup complete')
}

// Verify test data was inserted correctly
export const verifyInsertion = async (
  supabase: SupabaseClient<Database>,
  expectedData: {
    accountId: string
    tweetCount?: number
    likeCount?: number
    followerCount?: number
    followingCount?: number
    mentionedUsersCount?: number
    mediaCount?: number
    urlCount?: number
  }
): Promise<{
  success: boolean
  errors: string[]
  details: Record<string, any>
}> => {
  const errors: string[] = []
  const details: Record<string, any> = {}
  
  // Verify account exists
  const { data: account, error: accountError } = await supabase
    .from('all_account')
    .select('*')
    .eq('account_id', expectedData.accountId)
    .single()
  
  if (accountError || !account) {
    errors.push(`Account not found: ${expectedData.accountId}`)
    return { success: false, errors, details }
  }
  
  details.account = account
  
  // Verify profile exists
  const { data: profile } = await supabase
    .from('all_profile')
    .select('*')
    .eq('account_id', expectedData.accountId)
    .single()
  
  details.profile = profile
  
  // Verify tweet count if specified
  if (expectedData.tweetCount !== undefined) {
    const { count: tweetCount } = await supabase
      .from('tweets')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', expectedData.accountId)
    
    details.tweetCount = tweetCount
    
    if (tweetCount !== expectedData.tweetCount) {
      errors.push(`Tweet count mismatch: expected ${expectedData.tweetCount}, got ${tweetCount}`)
    }
  }
  
  // Verify like count if specified
  if (expectedData.likeCount !== undefined) {
    const { count: likeCount } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', expectedData.accountId)
    
    details.likeCount = likeCount
    
    if (likeCount !== expectedData.likeCount) {
      errors.push(`Like count mismatch: expected ${expectedData.likeCount}, got ${likeCount}`)
    }
  }
  
  // Verify follower count if specified
  if (expectedData.followerCount !== undefined) {
    const { count: followerCount } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', expectedData.accountId)
    
    details.followerCount = followerCount
    
    if (followerCount !== expectedData.followerCount) {
      errors.push(`Follower count mismatch: expected ${expectedData.followerCount}, got ${followerCount}`)
    }
  }
  
  // Verify following count if specified
  if (expectedData.followingCount !== undefined) {
    const { count: followingCount } = await supabase
      .from('following')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', expectedData.accountId)
    
    details.followingCount = followingCount
    
    if (followingCount !== expectedData.followingCount) {
      errors.push(`Following count mismatch: expected ${expectedData.followingCount}, got ${followingCount}`)
    }
  }
  
  // Verify mentioned users count if specified
  if (expectedData.mentionedUsersCount !== undefined) {
    const { data: tweets } = await supabase
      .from('tweets')
      .select('tweet_id')
      .eq('account_id', expectedData.accountId)
    
    if (tweets && tweets.length > 0) {
      const tweetIds = tweets.map(t => t.tweet_id)
      const { count: mentionCount } = await supabase
        .from('user_mentions')
        .select('*', { count: 'exact', head: true })
        .in('tweet_id', tweetIds)
      
      details.mentionedUsersCount = mentionCount
      
      if (mentionCount !== expectedData.mentionedUsersCount) {
        errors.push(`Mentioned users count mismatch: expected ${expectedData.mentionedUsersCount}, got ${mentionCount}`)
      }
    }
  }
  
  // Verify media count if specified
  if (expectedData.mediaCount !== undefined) {
    const { data: tweets } = await supabase
      .from('tweets')
      .select('tweet_id')
      .eq('account_id', expectedData.accountId)
    
    if (tweets && tweets.length > 0) {
      const tweetIds = tweets.map(t => t.tweet_id)
      const { count: mediaCount } = await supabase
        .from('tweet_media')
        .select('*', { count: 'exact', head: true })
        .in('tweet_id', tweetIds)
      
      details.mediaCount = mediaCount
      
      if (mediaCount !== expectedData.mediaCount) {
        errors.push(`Media count mismatch: expected ${expectedData.mediaCount}, got ${mediaCount}`)
      }
    }
  }
  
  // Verify URL count if specified
  if (expectedData.urlCount !== undefined) {
    const { data: tweets } = await supabase
      .from('tweets')
      .select('tweet_id')
      .eq('account_id', expectedData.accountId)
    
    if (tweets && tweets.length > 0) {
      const tweetIds = tweets.map(t => t.tweet_id)
      const { count: urlCount } = await supabase
        .from('tweet_urls')
        .select('*', { count: 'exact', head: true })
        .in('tweet_id', tweetIds)
      
      details.urlCount = urlCount
      
      if (urlCount !== expectedData.urlCount) {
        errors.push(`URL count mismatch: expected ${expectedData.urlCount}, got ${urlCount}`)
      }
    }
  }
  
  return {
    success: errors.length === 0,
    errors,
    details
  }
}

// Helper to clean up old test data (run periodically)
export const cleanupOldTestData = async (
  supabase: SupabaseClient<Database>,
  olderThanHours: number = 24
): Promise<void> => {
  const cutoffTime = new Date()
  cutoffTime.setHours(cutoffTime.getHours() - olderThanHours)
  
  console.log(`🧹 Cleaning up test data older than ${olderThanHours} hours`)
  
  // Find old test accounts
  const { data: oldAccounts } = await supabase
    .from('all_account')
    .select('account_id')
    .like('account_id', `${TEST_ACCOUNT_PREFIX}%`)
    .lt('created_at', cutoffTime.toISOString())
  
  if (!oldAccounts || oldAccounts.length === 0) {
    console.log('No old test data found')
    return
  }
  
  console.log(`Found ${oldAccounts.length} old test accounts to clean up`)
  
  // Create tracker and clean up
  const tracker = new TestDataTracker()
  for (const account of oldAccounts) {
    tracker.addAccountId(account.account_id)
    
    // Also get tweet IDs for comprehensive cleanup
    const { data: tweets } = await supabase
      .from('tweets')
      .select('tweet_id')
      .eq('account_id', account.account_id)
    
    if (tweets) {
      tweets.forEach(t => tracker.addTweetId(t.tweet_id))
    }
  }
  
  await cleanupTestData(supabase, tracker)
}

// Helper to verify specific entity extraction
export const verifyEntityExtraction = async (
  supabase: SupabaseClient<Database>,
  tweetId: string
): Promise<{
  mentions: any[]
  media: any[]
  urls: any[]
}> => {
  const { data: mentions } = await supabase
    .from('user_mentions')
    .select('*, mentioned_users!inner(*)')
    .eq('tweet_id', tweetId)
  
  const { data: media } = await supabase
    .from('tweet_media')
    .select('*')
    .eq('tweet_id', tweetId)
  
  const { data: urls } = await supabase
    .from('tweet_urls')
    .select('*')
    .eq('tweet_id', tweetId)
  
  return {
    mentions: mentions || [],
    media: media || [],
    urls: urls || []
  }
}

// Helper to verify note tweet patching
export const verifyNoteTweetPatching = async (
  supabase: SupabaseClient<Database>,
  tweetId: string,
  expectedFullText: string
): Promise<boolean> => {
  const { data: tweet } = await supabase
    .from('tweets')
    .select('full_text')
    .eq('tweet_id', tweetId)
    .single()
  
  return tweet?.full_text === expectedFullText
}