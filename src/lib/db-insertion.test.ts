import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'
import { insertArchiveInTempTables } from '@/lib/db_insert'
import { generateSmallExhaustiveMockArchive, generateLargeBenchmarkArchive } from '@/lib/test-fixtures/generate-mock-archives'
import { 
  createTestClient, 
  generateTestAccountId,
  TestDataTracker,
  cleanupTestData,
  verifyInsertion,
  waitForCommit,
  cleanupOldTestData
} from '@/lib/test-fixtures/test-db-utils'
import { Archive } from '@/lib/types'

/**
 * Database Insertion Integration Tests
 * 
 * These tests run against the real dev database to ensure
 * the complete insertion pipeline works correctly.
 * 
 * Test isolation is achieved through:
 * 1. Unique test account IDs
 * 2. Temp table isolation
 * 3. Comprehensive cleanup
 */

describe('DB Insertion Tests', () => {
  let supabase: SupabaseClient<Database>
  let tracker: TestDataTracker
  let testArchive: Archive
  let testAccountId: string
  
  // Set longer timeout for database operations
  jest.setTimeout(60000)
  
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
    // This ensures cleanup happens even if test fails
    if (tracker) {
      await cleanupTestData(supabase, tracker)
    }
  })
  
  afterAll(async () => {
    // Final cleanup and close connection
    await supabase.auth.signOut()
  })
  
  describe('Basic Insertion', () => {
    it('should insert a minimal archive correctly', async () => {
      // Create minimal test archive
      testArchive = {
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_user_${testAccountId}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        profile: [{
          profile: {
            description: {
              bio: 'Test bio',
              website: 'https://test.com',
              location: 'Test City'
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
      await insertArchiveInTempTables(
        supabase,
        testArchive,
        (progress) => {
          console.log(`Progress: ${progress.phase} - ${progress.percent}%`)
        }
      )
      
      // Verify account was created
      const { data: account } = await supabase
        .from('all_account')
        .select('*')
        .eq('account_id', testAccountId)
        .single()
      
      expect(account).toBeDefined()
      expect(account?.username).toBe(`test_user_${testAccountId}`)
    })
    
    it('should insert all tweets from small exhaustive archive', async () => {
      // Generate comprehensive test archive
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Replace account ID with test ID
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            ...mockArchive.account[0].account,
            accountId: testAccountId,
            username: `test_${testAccountId}`
          }
        }]
      }
      
      // Update tweet account references
      testArchive.tweets = mockArchive.tweets.map(t => ({
        tweet: {
          ...t.tweet,
          user_id: testAccountId
        }
      }))
      
      // Track test data
      tracker.addAccountId(testAccountId)
      testArchive.tweets.forEach(t => tracker.addTweetId(t.tweet.id_str))
      
      // Insert archive
      await insertArchiveInTempTables(
        supabase,
        testArchive,
        () => {} // Silent progress
      )
      
      // Get archive upload ID
      const { data: archiveUpload } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .single()
      
      if (archiveUpload) {
        tracker.addArchiveUploadId(archiveUpload.id)
        
        // Commit the temp data
        await supabase.rpc('commit_temp_data', { p_suffix: testAccountId })
        
        // Wait for commit
        const committed = await waitForCommit(supabase, archiveUpload.id)
        expect(committed).toBe(true)
      }
      
      // Verify all data was inserted correctly
      const result = await verifyInsertion(supabase, {
        accountId: testAccountId,
        tweetCount: testArchive.tweets.length,
        likeCount: testArchive.like.filter((l, i, arr) => 
          arr.findIndex(x => x.like.tweetId === l.like.tweetId) === i
        ).length, // Account for deduplication
        followerCount: testArchive.follower.length,
        followingCount: testArchive.following.length
      })
      
      expect(result.success).toBe(true)
      if (!result.success) {
        console.error('Verification errors:', result.errors)
      }
    })
  })
  
  describe('Entity Processing', () => {
    it('should extract and insert user mentions correctly', async () => {
      testArchive = {
        ...generateSmallExhaustiveMockArchive(),
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${testAccountId}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }]
      }
      
      // Find tweet with mentions
      const tweetWithMentions = testArchive.tweets.find(t => 
        t.tweet.entities?.user_mentions?.length > 0
      )
      
      if (!tweetWithMentions) {
        throw new Error('No tweet with mentions found in test data')
      }
      
      // Keep only the tweet with mentions for focused testing
      testArchive.tweets = [tweetWithMentions]
      testArchive.tweets[0].tweet.user_id = testAccountId
      
      tracker.addAccountId(testAccountId)
      tracker.addTweetId(tweetWithMentions.tweet.id_str)
      
      // Insert archive
      await insertArchiveInTempTables(supabase, testArchive, () => {})
      
      // Check temp tables for mentions
      const { data: mentions } = await supabase
        .schema('temp')
        .from(`user_mentions_${testAccountId}`)
        .select('*')
      
      expect(mentions).toBeDefined()
      expect(mentions?.length).toBe(tweetWithMentions.tweet.entities.user_mentions.length)
      
      // Verify mentioned users were extracted
      const { data: mentionedUsers } = await supabase
        .schema('temp')
        .from(`mentioned_users_${testAccountId}`)
        .select('*')
      
      expect(mentionedUsers).toBeDefined()
      expect(mentionedUsers?.length).toBeGreaterThan(0)
    })
    
    it('should extract and insert tweet media correctly', async () => {
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Find tweet with media
      const tweetWithMedia = mockArchive.tweets.find(t => 
        t.tweet.entities?.media?.length > 0
      )
      
      if (!tweetWithMedia) {
        throw new Error('No tweet with media found in test data')
      }
      
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${testAccountId}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        tweets: [{
          tweet: {
            ...tweetWithMedia.tweet,
            user_id: testAccountId
          }
        }],
        like: [],
        follower: [],
        following: []
      }
      
      tracker.addAccountId(testAccountId)
      tracker.addTweetId(tweetWithMedia.tweet.id_str)
      
      // Insert archive
      await insertArchiveInTempTables(supabase, testArchive, () => {})
      
      // Check temp tables for media
      const { data: media } = await supabase
        .schema('temp')
        .from(`tweet_media_${testAccountId}`)
        .select('*')
      
      expect(media).toBeDefined()
      expect(media?.length).toBe(tweetWithMedia.tweet.entities.media.length)
      
      // Verify media properties
      if (media && media.length > 0) {
        const firstMedia = media[0]
        const expectedMedia = tweetWithMedia.tweet.entities.media[0]
        
        expect(firstMedia.media_url).toBe(expectedMedia.media_url_https)
        expect(firstMedia.media_type).toBe(expectedMedia.type)
        expect(firstMedia.width).toBe(expectedMedia.sizes.large.w)
        expect(firstMedia.height).toBe(expectedMedia.sizes.large.h)
      }
    })
    
    it('should extract and insert URLs correctly', async () => {
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Find tweet with URLs
      const tweetWithUrls = mockArchive.tweets.find(t => 
        t.tweet.entities?.urls?.length > 0 && 
        !t.tweet.entities?.media?.length // Avoid media URLs
      )
      
      if (!tweetWithUrls) {
        throw new Error('No tweet with URLs found in test data')
      }
      
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${testAccountId}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        tweets: [{
          tweet: {
            ...tweetWithUrls.tweet,
            user_id: testAccountId
          }
        }],
        like: [],
        follower: [],
        following: []
      }
      
      tracker.addAccountId(testAccountId)
      tracker.addTweetId(tweetWithUrls.tweet.id_str)
      
      // Insert archive
      await insertArchiveInTempTables(supabase, testArchive, () => {})
      
      // Check temp tables for URLs
      const { data: urls } = await supabase
        .schema('temp')
        .from(`tweet_urls_${testAccountId}`)
        .select('*')
      
      expect(urls).toBeDefined()
      expect(urls?.length).toBe(tweetWithUrls.tweet.entities.urls.length)
      
      // Verify URL properties
      if (urls && urls.length > 0) {
        const firstUrl = urls[0]
        const expectedUrl = tweetWithUrls.tweet.entities.urls[0]
        
        expect(firstUrl.url).toBe(expectedUrl.url)
        expect(firstUrl.expanded_url).toBe(expectedUrl.expanded_url)
        expect(firstUrl.display_url).toBe(expectedUrl.display_url || '')
      }
    })
  })
  
  describe('Note Tweet Processing', () => {
    it('should patch regular tweets with matching note tweets', async () => {
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Find tweet that has a matching note tweet (id 1005 in our mock)
      const tweetToPatch = mockArchive.tweets.find(t => t.tweet.id_str === '1005')
      const matchingNoteTweet = mockArchive['note-tweet']?.find(nt => 
        nt.noteTweet.noteTweetId === 'nt1005'
      )
      
      if (!tweetToPatch || !matchingNoteTweet) {
        throw new Error('Test data missing tweet/note-tweet pair')
      }
      
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${testAccountId}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        tweets: [{
          tweet: {
            ...tweetToPatch.tweet,
            user_id: testAccountId
          }
        }],
        'note-tweet': [matchingNoteTweet],
        like: [],
        follower: [],
        following: []
      }
      
      tracker.addAccountId(testAccountId)
      tracker.addTweetId(tweetToPatch.tweet.id_str)
      
      // Insert archive
      await insertArchiveInTempTables(supabase, testArchive, () => {})
      
      // Check that tweet was patched with full text
      const { data: tweets } = await supabase
        .schema('temp')
        .from(`tweets_${testAccountId}`)
        .select('full_text')
        .eq('tweet_id', '1005')
        .single()
      
      expect(tweets).toBeDefined()
      expect(tweets?.full_text).toBe(matchingNoteTweet.noteTweet.core.text)
      expect(tweets?.full_text.length).toBeGreaterThan(280) // Should be expanded
    })
    
    it('should handle orphan note tweets gracefully', async () => {
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Get only orphan note tweets
      const orphanNoteTweets = mockArchive['note-tweet']?.filter(nt => 
        nt.noteTweet.noteTweetId.startsWith('nt999')
      )
      
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${testAccountId}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        tweets: [], // No tweets to match
        'note-tweet': orphanNoteTweets,
        like: [],
        follower: [],
        following: []
      }
      
      tracker.addAccountId(testAccountId)
      
      // Should not throw error
      await expect(
        insertArchiveInTempTables(supabase, testArchive, () => {})
      ).resolves.not.toThrow()
    })
  })
  
  describe('Deduplication', () => {
    it('should deduplicate likes with same tweet ID', async () => {
      testArchive = {
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${testAccountId}`,
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
          { like: { tweetId: '1002', fullText: 'Different tweet' } }
        ],
        follower: [],
        following: [],
        'community-tweet': []
      }
      
      tracker.addAccountId(testAccountId)
      
      // Insert archive
      await insertArchiveInTempTables(supabase, testArchive, () => {})
      
      // Check deduplicated likes
      const { data: likedTweets } = await supabase
        .schema('temp')
        .from(`liked_tweets_${testAccountId}`)
        .select('*')
      
      expect(likedTweets).toBeDefined()
      expect(likedTweets?.length).toBe(2) // Should have 2 unique tweets, not 3
      
      // Check like relations
      const { data: likes } = await supabase
        .schema('temp')
        .from(`likes_${testAccountId}`)
        .select('*')
      
      expect(likes).toBeDefined()
      expect(likes?.length).toBe(2) // Should have 2 unique likes
    })
    
    it('should handle duplicate user mentions across tweets', async () => {
      testArchive = {
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${testAccountId}`,
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
                  { id_str: '100', screen_name: 'user1', name: 'User 1', indices: ['0', '6'] },
                  { id_str: '200', screen_name: 'user2', name: 'User 2', indices: ['7', '13'] }
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
              source: '',
              user_id: testAccountId
            }
          },
          {
            tweet: {
              id: '2',
              id_str: '2',
              created_at: '2023-01-02 00:00:00 +0000',
              full_text: '@user1 different tweet', // Same user mentioned again
              entities: {
                user_mentions: [
                  { id_str: '100', screen_name: 'user1', name: 'User 1', indices: ['0', '6'] }
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
              source: '',
              user_id: testAccountId
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
      await insertArchiveInTempTables(supabase, testArchive, () => {})
      
      // Check mentioned users (should be deduplicated)
      const { data: mentionedUsers } = await supabase
        .schema('temp')
        .from(`mentioned_users_${testAccountId}`)
        .select('*')
      
      expect(mentionedUsers).toBeDefined()
      expect(mentionedUsers?.length).toBe(2) // user1 and user2, not 3
      
      // Check user mentions relations
      const { data: mentions } = await supabase
        .schema('temp')
        .from(`user_mentions_${testAccountId}`)
        .select('*')
      
      expect(mentions).toBeDefined()
      expect(mentions?.length).toBe(3) // 2 mentions in tweet 1, 1 in tweet 2
    })
  })
  
  describe('Character Sanitization', () => {
    it('should sanitize problematic characters in text fields', async () => {
      const mockArchive = generateSmallExhaustiveMockArchive()
      
      // Find tweet with problematic characters (id 1006 in our mock)
      const problematicTweet = mockArchive.tweets.find(t => t.tweet.id_str === '1006')
      
      if (!problematicTweet) {
        throw new Error('No tweet with problematic characters found')
      }
      
      testArchive = {
        ...mockArchive,
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${testAccountId}`,
            createdVia: 'web',
            createdAt: '2010-01-01T00:00:00.000Z',
            accountDisplayName: 'Test User'
          }
        }],
        tweets: [{
          tweet: {
            ...problematicTweet.tweet,
            user_id: testAccountId
          }
        }],
        'note-tweet': [],
        like: [],
        follower: [],
        following: []
      }
      
      tracker.addAccountId(testAccountId)
      tracker.addTweetId(problematicTweet.tweet.id_str)
      
      // Insert archive
      await insertArchiveInTempTables(supabase, testArchive, () => {})
      
      // Check that problematic characters were sanitized
      const { data: tweet } = await supabase
        .schema('temp')
        .from(`tweets_${testAccountId}`)
        .select('full_text')
        .eq('tweet_id', problematicTweet.tweet.id_str)
        .single()
      
      expect(tweet).toBeDefined()
      // Should not contain null bytes or control characters
      expect(tweet?.full_text).not.toContain('\x00')
      expect(tweet?.full_text).not.toContain('\x01')
      expect(tweet?.full_text).not.toContain('\x02')
      // But should preserve valid unicode and emojis
      expect(tweet?.full_text).toContain('🎉')
      expect(tweet?.full_text).toContain('你好')
    })
  })
  
  describe('Performance', () => {
    it('should handle large archive efficiently', async () => {
      // Generate large archive with reduced size for testing
      const largeArchive = generateLargeBenchmarkArchive({
        tweetCount: 1000, // Reduced for testing
        likeCount: 500,
        followerCount: 100,
        followingCount: 50,
        noteTweetPercentage: 0.05
      })
      
      testArchive = {
        ...largeArchive,
        account: [{
          account: {
            ...largeArchive.account[0].account,
            accountId: testAccountId,
            username: `perf_test_${testAccountId}`
          }
        }]
      }
      
      // Update tweet account references
      testArchive.tweets = largeArchive.tweets.map(t => ({
        tweet: {
          ...t.tweet,
          user_id: testAccountId
        }
      }))
      
      tracker.addAccountId(testAccountId)
      
      const startTime = Date.now()
      
      // Insert archive
      await insertArchiveInTempTables(supabase, testArchive, () => {})
      
      const elapsedTime = Date.now() - startTime
      
      console.log(`Large archive insertion took ${elapsedTime}ms`)
      
      // Should complete within reasonable time (adjust based on your requirements)
      expect(elapsedTime).toBeLessThan(30000) // 30 seconds
      
      // Verify counts
      const { count: tweetCount } = await supabase
        .schema('temp')
        .from(`tweets_${testAccountId}`)
        .select('*', { count: 'exact', head: true })
      
      expect(tweetCount).toBe(1000)
    }, 60000) // 60 second timeout for this test
  })
  
  describe('Error Handling', () => {
    it('should handle missing required fields gracefully', async () => {
      testArchive = {
        account: [{
          account: {
            accountId: testAccountId,
            username: '', // Missing username
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
      
      tracker.addAccountId(testAccountId)
      
      // Should handle the error gracefully
      await expect(
        insertArchiveInTempTables(supabase, testArchive, () => {})
      ).rejects.toThrow()
    })
    
    it('should handle malformed tweet data', async () => {
      testArchive = {
        account: [{
          account: {
            accountId: testAccountId,
            username: `test_${testAccountId}`,
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
        tweets: [{
          tweet: {
            id: null as any, // Invalid ID
            id_str: null as any,
            created_at: 'invalid-date',
            full_text: 'Test tweet',
            entities: {},
            favorite_count: 'not-a-number',
            retweet_count: 'not-a-number',
            favorited: false,
            retweeted: false,
            truncated: false,
            source: ''
          }
        }],
        'note-tweet': [],
        like: [],
        follower: [],
        following: [],
        'community-tweet': []
      }
      
      tracker.addAccountId(testAccountId)
      
      // Should handle the error
      await expect(
        insertArchiveInTempTables(supabase, testArchive, () => {})
      ).rejects.toThrow()
    })
  })
})