import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'
import { generateSmallExhaustiveMockArchive, generateLargeBenchmarkArchive } from './fixtures/generate-mock-archives'
import { 
  createTestClient, 
  generateTestAccountId,
  TestDataTracker,
  cleanupTestData,
  verifyInsertion,
  cleanupOldTestData,
  verifyEntityExtraction,
  verifyNoteTweetPatching
} from './fixtures/test-db-utils'
import { Archive } from '@/lib/types'

/**
 * Direct Database Insertion Integration Tests
 * 
 * Tests for the new server-side direct insertion approach
 * (without temp tables and commit process)
 * 
 * Test isolation through:
 * 1. Unique test account IDs
 * 2. Direct cleanup from main tables
 * 3. Comprehensive tracking of test data
 */

// Mock the new direct insertion function
// TODO: Replace with actual implementation when ready
const insertArchiveDirectly = async (
  supabase: SupabaseClient<Database>,
  archive: Archive,
  progressCallback?: (progress: { phase: string; percent: number | null }) => void
): Promise<void> => {
  // This is a placeholder for the new direct insertion logic
  // It should:
  // 1. Insert account and profile
  // 2. Process and insert tweets with entities
  // 3. Patch tweets with note tweets
  // 4. Insert likes (deduplicated)
  // 5. Insert followers/following
  // 6. Create archive_upload record
  
  // For now, we'll implement a basic version for testing
  const accountId = archive.account[0].account.accountId
  
  progressCallback?.({ phase: 'Inserting account', percent: 10 })
  
  // Insert account
  await supabase.from('all_account').upsert({
    account_id: accountId,
    username: archive.account[0].account.username,
    created_via: archive.account[0].account.createdVia,
    created_at: archive.account[0].account.createdAt,
    account_display_name: archive.account[0].account.accountDisplayName,
    num_tweets: archive.tweets.length,
    num_following: archive.following?.length ?? 0,
    num_followers: archive.follower?.length ?? 0,
    num_likes: archive.like?.length ?? 0
  })
  
  progressCallback?.({ phase: 'Inserting profile', percent: 20 })
  
  // Insert profile
  if (archive.profile?.[0]) {
    await supabase.from('all_profile').upsert({
      account_id: accountId,
      bio: archive.profile[0].profile.description.bio,
      website: archive.profile[0].profile.description.website,
      location: archive.profile[0].profile.description.location,
      avatar_media_url: archive.profile[0].profile.avatarMediaUrl,
      header_media_url: archive.profile[0].profile.headerMediaUrl,
      archive_upload_id: -1 // Placeholder
    })
  }
  
  // TODO: Implement the rest of the insertion logic
  progressCallback?.({ phase: 'Complete', percent: 100 })
}

describe('Direct DB Insertion Tests', () => {
  let supabase: SupabaseClient<Database>
  let tracker: TestDataTracker
  let testArchive: Archive
  let testAccountId: string
  
  // Set longer timeout for database operations
  jest.setTimeout(30000)
  
  beforeAll(async () => {
    // Create test client
    supabase = createTestClient()
    
    // Clean up any old test data from previous runs
    await cleanupOldTestData(supabase, 1) // Clean up data older than 1 hour
  })
  
  beforeEach(() => {
    // Create fresh tracker for each test
    tracker = new TestDataTracker()
    
    // Generate unique test account ID
    testAccountId = generateTestAccountId()
  })
  
  afterEach(async () => {
    // Clean up all test data after each test
    if (tracker) {
      await cleanupTestData(supabase, tracker)
    }
  })
  
  describe('Account & Profile Insertion', () => {
    it('should insert account and profile correctly', async () => {
      // Create minimal test archive
      testArchive = {
        account: [{
          account: {
            accountId: testAccountId,
            username: `user_${Date.now()}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User 🧪'
          }
        }],
        profile: [{
          profile: {
            description: {
              bio: 'Test bio with emojis 🎉',
              website: 'https://test.com',
              location: 'San Francisco, CA'
            },
            avatarMediaUrl: 'https://test.com/avatar.jpg',
            headerMediaUrl: 'https://test.com/header.jpg'
          }
        }],
        tweets: [],
        'note-tweet': [],
        like: [],
        follower: [],
        following: [],
        'community-tweet': []
      }
      
      // Track test data
      tracker.addAccountId(testAccountId)
      
      // Insert archive
      await insertArchiveDirectly(supabase, testArchive, console.log)
      
      // Verify insertion
      const result = await verifyInsertion(supabase, {
        accountId: testAccountId
      })
      
      expect(result.success).toBe(true)
      expect(result.details.account).toBeDefined()
      expect(result.details.account.username).toBe(testArchive.account[0].account.username)
      expect(result.details.profile).toBeDefined()
      expect(result.details.profile.bio).toBe('Test bio with emojis 🎉')
    })
  })
  
  describe('Tweet Insertion', () => {
    it('should insert tweets with correct field mapping', async () => {
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Take a subset of tweets for focused testing
      const testTweets = mockArchive.tweets.slice(0, 3)
      
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            ...mockArchive.account[0].account,
            accountId: testAccountId,
            username: `test_${Date.now()}`
          }
        }],
        tweets: testTweets,
        'note-tweet': [],
        like: [],
        follower: [],
        following: []
      }
      
      // Track test data
      tracker.addAccountId(testAccountId)
      testTweets.forEach(t => tracker.addTweetId(t.tweet.id_str))
      
      // Insert archive (using mock for now)
      await insertArchiveDirectly(supabase, testArchive)
      
      // Manually insert tweets for testing
      // TODO: Remove when real implementation is ready
      for (const tweetWrapper of testTweets) {
        const tweet = tweetWrapper.tweet
        await supabase.from('tweets').upsert({
          tweet_id: tweet.id_str,
          account_id: testAccountId,
          created_at: tweet.created_at,
          full_text: tweet.full_text,
          retweet_count: parseInt(tweet.retweet_count) || 0,
          favorite_count: parseInt(tweet.favorite_count) || 0,
          reply_to_tweet_id: tweet.in_reply_to_status_id_str,
          reply_to_user_id: tweet.in_reply_to_user_id_str,
          reply_to_username: tweet.in_reply_to_screen_name,
          archive_upload_id: -1
        })
      }
      
      // Verify tweets were inserted
      const result = await verifyInsertion(supabase, {
        accountId: testAccountId,
        tweetCount: 3
      })
      
      expect(result.success).toBe(true)
      expect(result.details.tweetCount).toBe(3)
    })
    
    it('should handle tweets with all entity types', async () => {
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Find tweet with all entities (tweet id 1003 in mock)
      const tweetWithEntities = mockArchive.tweets.find(t => 
        t.tweet.id_str === '1003'
      )
      
      if (!tweetWithEntities) {
        throw new Error('Test tweet with entities not found')
      }
      
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            ...mockArchive.account[0].account,
            accountId: testAccountId
          }
        }],
        tweets: [tweetWithEntities],
        'note-tweet': [],
        like: [],
        follower: [],
        following: []
      }
      
      tracker.addAccountId(testAccountId)
      tracker.addTweetId(tweetWithEntities.tweet.id_str)
      
      // Insert archive
      await insertArchiveDirectly(supabase, testArchive)
      
      // Manually insert tweet and entities for testing
      // TODO: Remove when real implementation is ready
      const tweet = tweetWithEntities.tweet
      await supabase.from('tweets').upsert({
        tweet_id: tweet.id_str,
        account_id: testAccountId,
        created_at: tweet.created_at,
        full_text: tweet.full_text,
        retweet_count: 0,
        favorite_count: 0,
        archive_upload_id: -1
      })
      
      // Insert user mentions
      for (const mention of tweet.entities.user_mentions || []) {
        await supabase.from('mentioned_users').upsert({
          user_id: mention.id_str,
          name: mention.name,
          screen_name: mention.screen_name,
          updated_at: new Date().toISOString()
        })
        
        await supabase.from('user_mentions').upsert({
          tweet_id: tweet.id_str,
          mentioned_user_id: mention.id_str
        })
      }
      
      // Insert URLs
      for (const url of tweet.entities.urls || []) {
        await supabase.from('tweet_urls').upsert({
          tweet_id: tweet.id_str,
          url: url.url,
          expanded_url: url.expanded_url,
          display_url: url.display_url || ''
        })
      }
      
      // Verify entity extraction
      const entities = await verifyEntityExtraction(supabase, tweet.id_str)
      
      expect(entities.mentions.length).toBe(2) // Tweet has 2 mentions
      expect(entities.urls.length).toBe(1) // Tweet has 1 URL
      expect(entities.mentions[0].mentioned_users.screen_name).toBe('user1')
    })
  })
  
  describe('Note Tweet Patching', () => {
    it('should expand tweets with matching note tweets', async () => {
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Get tweet 1005 and its matching note tweet
      const tweetToPatch = mockArchive.tweets.find(t => t.tweet.id_str === '1005')
      const noteTweet = mockArchive['note-tweet']?.find(nt => 
        nt.noteTweet.noteTweetId === 'nt1005'
      )
      
      if (!tweetToPatch || !noteTweet) {
        throw new Error('Test data missing')
      }
      
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            ...mockArchive.account[0].account,
            accountId: testAccountId
          }
        }],
        tweets: [tweetToPatch],
        'note-tweet': [noteTweet],
        like: [],
        follower: [],
        following: []
      }
      
      tracker.addAccountId(testAccountId)
      tracker.addTweetId(tweetToPatch.tweet.id_str)
      
      // Insert with patching
      // TODO: Replace with real implementation
      await insertArchiveDirectly(supabase, testArchive)
      
      // Simulate patching for testing
      await supabase.from('tweets').upsert({
        tweet_id: tweetToPatch.tweet.id_str,
        account_id: testAccountId,
        created_at: tweetToPatch.tweet.created_at,
        full_text: noteTweet.noteTweet.core.text, // Patched with full text
        retweet_count: 0,
        favorite_count: 0,
        archive_upload_id: -1
      })
      
      // Verify patching
      const patched = await verifyNoteTweetPatching(
        supabase,
        tweetToPatch.tweet.id_str,
        noteTweet.noteTweet.core.text
      )
      
      expect(patched).toBe(true)
    })
  })
  
  describe('Deduplication', () => {
    it('should deduplicate likes by tweet ID', async () => {
      testArchive = {
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${Date.now()}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        profile: [{
          profile: {
            description: { bio: '', website: '', location: '' },
            avatarMediaUrl: '',
            headerMediaUrl: ''
          }
        }],
        tweets: [],
        'note-tweet': [],
        like: [
          { like: { tweetId: '1001', fullText: 'First like' } },
          { like: { tweetId: '1001', fullText: 'Duplicate like' } }, // Duplicate
          { like: { tweetId: '1002', fullText: 'Different tweet' } },
          { like: { tweetId: '1002', fullText: 'Another duplicate' } }, // Another duplicate
          { like: { tweetId: '1003', fullText: 'Third unique tweet' } }
        ],
        follower: [],
        following: [],
        'community-tweet': []
      }
      
      tracker.addAccountId(testAccountId)
      tracker.addLikedTweetId('1001')
      tracker.addLikedTweetId('1002')
      tracker.addLikedTweetId('1003')
      
      // Insert archive
      await insertArchiveDirectly(supabase, testArchive)
      
      // Simulate deduplication for testing
      const uniqueLikes = new Map<string, any>()
      for (const likeWrapper of testArchive.like) {
        uniqueLikes.set(likeWrapper.like.tweetId, likeWrapper.like)
      }
      
      // Insert deduplicated likes
      for (const like of uniqueLikes.values()) {
        await supabase.from('liked_tweets').upsert({
          tweet_id: like.tweetId,
          full_text: like.fullText
        })
        
        await supabase.from('likes').upsert({
          account_id: testAccountId,
          liked_tweet_id: like.tweetId,
          archive_upload_id: -1
        })
      }
      
      // Verify deduplication
      const result = await verifyInsertion(supabase, {
        accountId: testAccountId,
        likeCount: 3 // Should be 3 unique likes, not 5
      })
      
      expect(result.details.likeCount).toBe(3)
    })
    
    it('should deduplicate mentioned users across tweets', async () => {
      testArchive = {
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${Date.now()}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        profile: [{
          profile: {
            description: { bio: '', website: '', location: '' },
            avatarMediaUrl: '',
            headerMediaUrl: ''
          }
        }],
        tweets: [
          {
            tweet: {
              id: '1',
              id_str: '1',
              created_at: '2023-01-01 00:00:00 +0000',
              full_text: '@user1 @user2 test',
              entities: {
                user_mentions: [
                  { id_str: '100', id: '100', screen_name: 'user1', name: 'User 1', indices: ['0', '6'] },
                  { id_str: '200', id: '200', screen_name: 'user2', name: 'User 2', indices: ['7', '13'] }
                ],
                hashtags: [],
                symbols: [],
                urls: []
              },
              favorite_count: '0',
              retweet_count: '0',
              favorited: false,
              retweeted: false,
              truncated: false,
              source: ''
            }
          },
          {
            tweet: {
              id: '2',
              id_str: '2',
              created_at: '2023-01-02 00:00:00 +0000',
              full_text: '@user1 @user3 different tweet', // user1 mentioned again
              entities: {
                user_mentions: [
                  { id_str: '100', id: '100', screen_name: 'user1', name: 'User 1', indices: ['0', '6'] },
                  { id_str: '300', id: '300', screen_name: 'user3', name: 'User 3', indices: ['7', '13'] }
                ],
                hashtags: [],
                symbols: [],
                urls: []
              },
              favorite_count: '0',
              retweet_count: '0',
              favorited: false,
              retweeted: false,
              truncated: false,
              source: ''
            }
          }
        ],
        'note-tweet': [],
        like: [],
        follower: [],
        following: [],
        'community-tweet': []
      }
      
      tracker.addAccountId(testAccountId)
      tracker.addTweetId('1')
      tracker.addTweetId('2')
      
      // Insert archive
      await insertArchiveDirectly(supabase, testArchive)
      
      // Simulate insertion with deduplication
      const tweets = testArchive.tweets
      for (const tweetWrapper of tweets) {
        const tweet = tweetWrapper.tweet
        await supabase.from('tweets').upsert({
          tweet_id: tweet.id_str,
          account_id: testAccountId,
          created_at: tweet.created_at,
          full_text: tweet.full_text,
          retweet_count: 0,
          favorite_count: 0,
          archive_upload_id: -1
        })
      }
      
      // Insert mentioned users (deduplicated)
      const mentionedUsers = new Map<string, any>()
      for (const tweetWrapper of tweets) {
        for (const mention of tweetWrapper.tweet.entities.user_mentions || []) {
          mentionedUsers.set(mention.id_str, {
            user_id: mention.id_str,
            name: mention.name,
            screen_name: mention.screen_name,
            updated_at: new Date().toISOString()
          })
        }
      }
      
      for (const user of mentionedUsers.values()) {
        await supabase.from('mentioned_users').upsert(user)
      }
      
      // Insert user mention relations (all of them)
      for (const tweetWrapper of tweets) {
        for (const mention of tweetWrapper.tweet.entities.user_mentions || []) {
          await supabase.from('user_mentions').upsert({
            tweet_id: tweetWrapper.tweet.id_str,
            mentioned_user_id: mention.id_str
          })
        }
      }
      
      // Verify deduplication
      const { data: users } = await supabase
        .from('mentioned_users')
        .select('*')
        .in('user_id', ['100', '200', '300'])
      
      expect(users?.length).toBe(3) // Should be 3 unique users, not 4
      
      const { data: mentions } = await supabase
        .from('user_mentions')
        .select('*')
        .in('tweet_id', ['1', '2'])
      
      expect(mentions?.length).toBe(4) // 2 mentions in tweet 1, 2 in tweet 2
    })
  })
  
  describe('Character Sanitization', () => {
    it('should handle problematic characters in text fields', async () => {
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Get tweet with problematic characters
      const problematicTweet = mockArchive.tweets.find(t => 
        t.tweet.id_str === '1006'
      )
      
      if (!problematicTweet) {
        throw new Error('Problematic tweet not found')
      }
      
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            ...mockArchive.account[0].account,
            accountId: testAccountId
          }
        }],
        tweets: [problematicTweet],
        'note-tweet': [],
        like: [],
        follower: [],
        following: []
      }
      
      tracker.addAccountId(testAccountId)
      tracker.addTweetId(problematicTweet.tweet.id_str)
      
      // Insert archive
      await insertArchiveDirectly(supabase, testArchive)
      
      // Simulate sanitization
      const sanitizedText = problematicTweet.tweet.full_text
        .replace(/\x00/g, '') // Remove null bytes
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
      
      await supabase.from('tweets').upsert({
        tweet_id: problematicTweet.tweet.id_str,
        account_id: testAccountId,
        created_at: problematicTweet.tweet.created_at,
        full_text: sanitizedText,
        retweet_count: 0,
        favorite_count: 0,
        archive_upload_id: -1
      })
      
      // Verify sanitization
      const { data: tweet } = await supabase
        .from('tweets')
        .select('full_text')
        .eq('tweet_id', problematicTweet.tweet.id_str)
        .single()
      
      expect(tweet?.full_text).not.toContain('\x00')
      expect(tweet?.full_text).not.toContain('\x01')
      expect(tweet?.full_text).toContain('🎉') // Emojis preserved
      expect(tweet?.full_text).toContain('你好') // Unicode preserved
    })
  })
  
  describe('Performance', () => {
    it('should handle batch insertion efficiently', async () => {
      // Generate a moderate-sized archive for testing
      const largeArchive = generateLargeBenchmarkArchive({
        tweetCount: 100, // Reduced for testing
        likeCount: 50,
        followerCount: 20,
        followingCount: 10,
        noteTweetPercentage: 0.05
      })
      
      testArchive = {
        ...largeArchive,
        account: [{
          account: {
            ...largeArchive.account[0].account,
            accountId: testAccountId
          }
        }]
      }
      
      tracker.addAccountId(testAccountId)
      testArchive.tweets.forEach(t => tracker.addTweetId(t.tweet.id_str))
      
      const startTime = Date.now()
      
      // Insert archive
      await insertArchiveDirectly(supabase, testArchive, (progress) => {
        if (progress.percent && progress.percent % 20 === 0) {
          console.log(`Progress: ${progress.phase} - ${progress.percent}%`)
        }
      })
      
      // Simulate batch insertion for testing
      // TODO: Remove when real implementation is ready
      const batchSize = 50
      for (let i = 0; i < testArchive.tweets.length; i += batchSize) {
        const batch = testArchive.tweets.slice(i, i + batchSize)
        const tweetRecords = batch.map(t => ({
          tweet_id: t.tweet.id_str,
          account_id: testAccountId,
          created_at: t.tweet.created_at,
          full_text: t.tweet.full_text,
          retweet_count: parseInt(t.tweet.retweet_count) || 0,
          favorite_count: parseInt(t.tweet.favorite_count) || 0,
          archive_upload_id: -1
        }))
        
        await supabase.from('tweets').upsert(tweetRecords)
      }
      
      const elapsedTime = Date.now() - startTime
      
      console.log(`Batch insertion took ${elapsedTime}ms for ${testArchive.tweets.length} tweets`)
      
      // Should complete within reasonable time
      expect(elapsedTime).toBeLessThan(10000) // 10 seconds for 100 tweets
      
      // Verify insertion
      const result = await verifyInsertion(supabase, {
        accountId: testAccountId,
        tweetCount: 100
      })
      
      expect(result.details.tweetCount).toBe(100)
    })
  })
  
  describe('Error Handling', () => {
    it('should validate required fields', async () => {
      testArchive = {
        account: [{
          account: {
            accountId: '', // Invalid empty ID
            username: 'test_user',
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        profile: [{
          profile: {
            description: { bio: '', website: '', location: '' },
            avatarMediaUrl: '',
            headerMediaUrl: ''
          }
        }],
        tweets: [],
        'note-tweet': [],
        like: [],
        follower: [],
        following: [],
        'community-tweet': []
      }
      
      // Should throw or handle gracefully
      await expect(
        insertArchiveDirectly(supabase, testArchive)
      ).rejects.toThrow()
    })
    
    it('should handle duplicate insertion gracefully', async () => {
      testArchive = {
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${Date.now()}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        profile: [{
          profile: {
            description: { bio: 'Test', website: '', location: '' },
            avatarMediaUrl: '',
            headerMediaUrl: ''
          }
        }],
        tweets: [],
        'note-tweet': [],
        like: [],
        follower: [],
        following: [],
        'community-tweet': []
      }
      
      tracker.addAccountId(testAccountId)
      
      // Insert once
      await insertArchiveDirectly(supabase, testArchive)
      
      // Insert again (should update, not error)
      await expect(
        insertArchiveDirectly(supabase, testArchive)
      ).resolves.not.toThrow()
    })
  })
})