import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'

/**
 * Test Database Utilities
 * 
 * These utilities help manage test data in the dev database safely:
 * 1. Use unique test account IDs to avoid conflicts
 * 2. Track all inserted data for cleanup
 * 3. Leverage temp tables for isolation
 * 4. Clean up reliably even on test failure
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
  private archiveUploadIds: Set<number> = new Set()
  private tweetIds: Set<string> = new Set()
  
  addAccountId(id: string) {
    this.accountIds.add(id)
  }
  
  addArchiveUploadId(id: number) {
    this.archiveUploadIds.add(id)
  }
  
  addTweetId(id: string) {
    this.tweetIds.add(id)
  }
  
  getAccountIds(): string[] {
    return Array.from(this.accountIds)
  }
  
  getArchiveUploadIds(): number[] {
    return Array.from(this.archiveUploadIds)
  }
  
  getTweetIds(): string[] {
    return Array.from(this.tweetIds)
  }
  
  clear() {
    this.accountIds.clear()
    this.archiveUploadIds.clear()
    this.tweetIds.clear()
  }
}

// Clean up test data from the database
export const cleanupTestData = async (
  supabase: SupabaseClient<Database>,
  tracker: TestDataTracker
): Promise<void> => {
  const accountIds = tracker.getAccountIds()
  const archiveUploadIds = tracker.getArchiveUploadIds()
  
  console.log(`🧹 Cleaning up test data for ${accountIds.length} accounts`)
  
  // Drop temp tables for each account
  for (const accountId of accountIds) {
    try {
      await supabase.rpc('drop_temp_tables', { p_suffix: accountId })
    } catch (error) {
      console.warn(`Failed to drop temp tables for ${accountId}:`, error)
    }
  }
  
  // Delete archive uploads (cascades to related data)
  if (archiveUploadIds.length > 0) {
    const { error: uploadError } = await supabase
      .from('archive_upload')
      .delete()
      .in('id', archiveUploadIds)
    
    if (uploadError) {
      console.warn('Failed to delete archive uploads:', uploadError)
    }
  }
  
  // Delete tweets directly (as fallback)
  const tweetIds = tracker.getTweetIds()
  if (tweetIds.length > 0) {
    // Delete in batches to avoid query size limits
    const batchSize = 1000
    for (let i = 0; i < tweetIds.length; i += batchSize) {
      const batch = tweetIds.slice(i, i + batchSize)
      const { error } = await supabase
        .from('tweets')
        .delete()
        .in('tweet_id', batch)
      
      if (error) {
        console.warn(`Failed to delete tweet batch ${i / batchSize}:`, error)
      }
    }
  }
  
  // Delete likes
  if (accountIds.length > 0) {
    const { error: likesError } = await supabase
      .from('likes')
      .delete()
      .in('account_id', accountIds)
    
    if (likesError) {
      console.warn('Failed to delete likes:', likesError)
    }
  }
  
  // Delete followers/following
  if (accountIds.length > 0) {
    await supabase
      .from('followers')
      .delete()
      .in('account_id', accountIds)
    
    await supabase
      .from('following')
      .delete()
      .in('account_id', accountIds)
  }
  
  // Delete profiles
  if (accountIds.length > 0) {
    await supabase
      .from('all_profile')
      .delete()
      .in('account_id', accountIds)
  }
  
  // Delete accounts (last, due to foreign key constraints)
  if (accountIds.length > 0) {
    const { error: accountError } = await supabase
      .from('all_account')
      .delete()
      .in('account_id', accountIds)
    
    if (accountError) {
      console.warn('Failed to delete accounts:', accountError)
    }
  }
  
  // Clean up any test data based on username pattern
  // This is a fallback to catch any orphaned test data
  const { error: cleanupError } = await supabase
    .from('all_account')
    .delete()
    .like('account_id', `${TEST_ACCOUNT_PREFIX}%`)
  
  if (cleanupError) {
    console.warn('Failed to clean up orphaned test accounts:', cleanupError)
  }
  
  console.log('✅ Test data cleanup complete')
}

// Verify test data was inserted correctly
export const verifyInsertion = async (
  supabase: SupabaseClient<Database>,
  expectedData: {
    accountId: string
    tweetCount: number
    likeCount: number
    followerCount: number
    followingCount: number
  }
): Promise<{
  success: boolean
  errors: string[]
}> => {
  const errors: string[] = []
  
  // Verify account exists
  const { data: account, error: accountError } = await supabase
    .from('all_account')
    .select('*')
    .eq('account_id', expectedData.accountId)
    .single()
  
  if (accountError || !account) {
    errors.push(`Account not found: ${expectedData.accountId}`)
    return { success: false, errors }
  }
  
  // Verify tweet count
  const { count: tweetCount, error: tweetError } = await supabase
    .from('tweets')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', expectedData.accountId)
  
  if (tweetError) {
    errors.push(`Failed to count tweets: ${tweetError.message}`)
  } else if (tweetCount !== expectedData.tweetCount) {
    errors.push(`Tweet count mismatch: expected ${expectedData.tweetCount}, got ${tweetCount}`)
  }
  
  // Verify like count
  const { count: likeCount, error: likeError } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', expectedData.accountId)
  
  if (likeError) {
    errors.push(`Failed to count likes: ${likeError.message}`)
  } else if (likeCount !== expectedData.likeCount) {
    errors.push(`Like count mismatch: expected ${expectedData.likeCount}, got ${likeCount}`)
  }
  
  // Verify follower count
  const { count: followerCount, error: followerError } = await supabase
    .from('followers')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', expectedData.accountId)
  
  if (followerError) {
    errors.push(`Failed to count followers: ${followerError.message}`)
  } else if (followerCount !== expectedData.followerCount) {
    errors.push(`Follower count mismatch: expected ${expectedData.followerCount}, got ${followerCount}`)
  }
  
  // Verify following count
  const { count: followingCount, error: followingError } = await supabase
    .from('following')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', expectedData.accountId)
  
  if (followingError) {
    errors.push(`Failed to count following: ${followingError.message}`)
  } else if (followingCount !== expectedData.followingCount) {
    errors.push(`Following count mismatch: expected ${expectedData.followingCount}, got ${followingCount}`)
  }
  
  return {
    success: errors.length === 0,
    errors
  }
}

// Wait for archive to be committed (for async processing tests)
export const waitForCommit = async (
  supabase: SupabaseClient<Database>,
  archiveUploadId: number,
  maxWaitMs: number = 30000
): Promise<boolean> => {
  const startTime = Date.now()
  
  while (Date.now() - startTime < maxWaitMs) {
    const { data, error } = await supabase
      .from('archive_upload')
      .select('upload_phase')
      .eq('id', archiveUploadId)
      .single()
    
    if (error) {
      console.error('Error checking upload phase:', error)
      return false
    }
    
    if (data?.upload_phase === 'committed') {
      return true
    }
    
    if (data?.upload_phase === 'failed') {
      console.error('Archive upload failed')
      return false
    }
    
    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.error('Timeout waiting for commit')
  return false
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
  const { data: oldAccounts, error: accountError } = await supabase
    .from('all_account')
    .select('account_id, created_at')
    .like('account_id', `${TEST_ACCOUNT_PREFIX}%`)
    .lt('created_at', cutoffTime.toISOString())
  
  if (accountError) {
    console.error('Failed to find old test accounts:', accountError)
    return
  }
  
  if (!oldAccounts || oldAccounts.length === 0) {
    console.log('No old test data found')
    return
  }
  
  console.log(`Found ${oldAccounts.length} old test accounts to clean up`)
  
  // Create tracker and clean up
  const tracker = new TestDataTracker()
  for (const account of oldAccounts) {
    tracker.addAccountId(account.account_id)
  }
  
  await cleanupTestData(supabase, tracker)
}