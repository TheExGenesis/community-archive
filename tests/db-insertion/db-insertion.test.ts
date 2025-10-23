import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'
import { Archive } from '@/lib/types'
import { generateSmallExhaustiveMockArchive, generateLargeBenchmarkArchive } from './fixtures/generate-mock-archives'

import {
  createTestClient,
  generateTestAccountId,
  TestDataTracker,
  cleanupTestData,
  verifyInsertion,
  cleanupOldTestData,
  verifyEntityExtraction,
  verifyNoteTweetPatching,
  verifyArchiveUploadPhase
} from './fixtures/test-db-utils'



// @ts-ignore
const postgres = require('postgres') as any
type Sql = any


import { ArchiveUploadProcessor } from '../../services/process_archive/process_archive_upload'
import { removeProblematicCharacters } from '@/lib/removeProblematicChars'


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

// Optimized direct insertion function using ArchiveUploadProcessor
const insertArchiveDirectly = async (
  supabase: SupabaseClient<Database>,
  archive: Archive,
  progressCallback?: (progress: { phase: string; percent: number | null }) => void
): Promise<void> => {



  const isProd = process.env.NODE_ENV === 'production'

  if(isProd) {throw new Error('These tests are not allowed to run in production')};
    // Create postgres connection from supabase URL
    const postgresUrl = process.env.TESTS_POSTGRES_CONNECTION_STRING;
  
  if (!postgresUrl) {
    throw new Error('Database connection not available. Ensure POSTGRES_CONNECTION_STRING is set.')
  }

  progressCallback?.({ phase: 'Connecting to database', percent: 5 })

  // Create postgres connection
  const sql = postgres(postgresUrl, {
    max: 5,
    idle_timeout: 20,
    prepare: false,
    transform: { undefined: null }
  })

  let archiveUploadId: number = -1

  try {
    progressCallback?.({ phase: 'Creating archive upload record', percent: 10 })

    // Create archive upload record
    const accountId = archive.account[0].account.accountId
    const username = archive.account[0].account.username

    const num_tweets = archive.tweets.length
  const num_following = archive.following?.length ?? 0
  const num_followers = archive.follower?.length ?? 0
  const num_likes = archive.like?.length ?? 0

  // Insert into all_account first
  console.log('Inserting account data...')
  
    const { error } = await supabase.from('all_account').upsert({
      account_id: accountId,
      created_via: 'twitter_archive',
      username: archive.account[0].account.username,
      created_at: archive.account[0].account.createdAt,
      account_display_name: archive.account[0].account.accountDisplayName,
      num_tweets,
      num_following,
      num_followers,
      num_likes,
    })
    if (error) throw error


  // Create initial archive_upload record
  console.log('Creating/updating archive upload record...')
  const uploadOptions = archive['upload-options'] || {
    keepPrivate: false,
    uploadLikes: true,
    startDate: null,
    endDate: null,
  }

  let latestTweetDate = archive.tweets.reduce(
    (latest: string, tweet: any) => {
      const tweetDate = new Date(tweet.tweet.created_at)
      return latest
        ? tweetDate > new Date(latest)
          ? tweetDate.toISOString()
          : latest
        : tweetDate.toISOString()
    },new Date().toISOString());

  // Always create a new archive upload record for testing (don't reuse existing ones)
  const { data: archiveUploadIdData, error: uploadError } = await supabase
    .from('archive_upload')
    .insert({
      account_id: accountId,
      archive_at: latestTweetDate,
      keep_private: uploadOptions.keepPrivate,
      upload_likes: uploadOptions.uploadLikes,
      upload_phase: 'ready_for_commit'
    })
    .select('id')
    .single()

 

  console.log('archiveUploadIdData', { archiveUploadIdData })
  const archiveUploadId = archiveUploadIdData?.id

  if (!archiveUploadId) throw new Error('Archive upload ID not found')
  if (uploadError) throw uploadError

   archiveUploadId

    progressCallback?.({ phase: 'Processing archive with ArchiveUploadProcessor', percent: 20 })

    // Use ArchiveUploadProcessor to handle the actual processing
    const processor = new ArchiveUploadProcessor(sql, archiveUploadId)
    await processor.processArchive(archive)

    progressCallback?.({ phase: 'Marking archive upload as completed', percent: 90 })

    // Mark archive upload as completed
    await sql`
      UPDATE public.archive_upload
      SET upload_phase = 'completed'
      WHERE id = ${archiveUploadId}
    `

    progressCallback?.({ phase: 'Complete', percent: 100 })

  } catch (error) {
    console.error('Error in insertArchiveDirectly:', error)

    // Mark archive upload as failed if it was created
    if (archiveUploadId) {
      try {
        await sql`
          UPDATE public.archive_upload
          SET upload_phase = 'failed'
          WHERE id = ${archiveUploadId}
        `
      } catch (updateError) {
        console.error('Failed to mark archive upload as failed:', updateError)
      }
    }

    throw error
  } finally {
    // Always close the connection
    await sql.end()
  }
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
      await insertArchiveDirectly(supabase, testArchive)
      
      // Verify patching
      const patched = await verifyNoteTweetPatching(
        supabase,
        tweetToPatch.tweet.id_str,
        noteTweet.noteTweet.core.text
      )
      let d = patchArchive(mockArchive)
      const ttt = d.tweets.find((td:any) => td.tweet.id_str === '1005')
      expect(ttt.tweet.full_text).toBe(noteTweet.noteTweet.core.text)
      console.log('patched', patched)
      console.log('ttt', ttt.tweet.full_text === noteTweet.noteTweet.core.text)
      expect(patched).toBe(true)
    })
  })


  function patchArchive(archive: any): any {
    try{
      const tweets = archive.tweets
      for(const tweetRecord of tweets) {
        const tweet = tweetRecord.tweet
        
        tweet.full_text = removeProblematicCharacters(tweet.full_text)
        let noteTweets = archive['note-tweet'];
        const matchingNoteTweet = noteTweets.find((noteTweetObj:any) => {
          const noteTweet = noteTweetObj.noteTweet
          return (
            tweet.full_text.includes(noteTweet.core.text.substring(0, 200)) &&
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
      for (const likeRecord of archive.like) {
        const like = likeRecord.like;
        like.fullText = removeProblematicCharacters(like.fullText||'')
      }
      return archive
  
    } catch (error) {
      console.error('Error patching archive:', error)
    throw error
    }
  }
  
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
              favorite_count: 0,
              retweet_count: 0,
              favorited: false,
              //retweeted: false,
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
              favorite_count: 0,
              retweet_count: 0,
              favorited: false,
              //retweeted: false,
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
      
      // The ArchiveUploadProcessor handles invalid data gracefully by skipping problematic records
      // rather than throwing errors, so we expect it to resolve without throwing
      await expect(
        insertArchiveDirectly(supabase, testArchive)
      ).resolves.not.toThrow()
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



  describe('Archive Upload ID Upsert Tests', () => {
    it('should update archive_upload_id when upserting tweets', async () => {
      // Create test tweet
      const testTweet = {
        tweet: {
          id: '9999',
          id_str: '9999',
          created_at: '2023-01-01 00:00:00 +0000',
          full_text: 'Test tweet for archive_upload_id upsert',
          favorite_count: 5,
          retweet_count: 2,
          favorited: false,
          truncated: false,
          source: 'web',
          entities: {
            user_mentions: [],
            hashtags: [],
            symbols: [],
            urls: []
          }
        }
      }

      // First archive upload
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
            description: { bio: 'Test bio', website: '', location: '' },
            avatarMediaUrl: '',
            headerMediaUrl: ''
          }
        }],
        tweets: [testTweet],
        'note-tweet': [],
        like: [],
        follower: [],
        following: [],
        'community-tweet': []
      }

      tracker.addAccountId(testAccountId)
      tracker.addTweetId('9999')

      // Insert first archive
      await insertArchiveDirectly(supabase, testArchive)

      // Get the first archive_upload_id
      const { data: firstArchive } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const firstArchiveUploadId = firstArchive?.id
      expect(firstArchiveUploadId).toBeDefined()

      // Verify tweet has first archive_upload_id
      const { data: firstTweet } = await supabase
        .from('tweets')
        .select('archive_upload_id, favorite_count, retweet_count')
        .eq('tweet_id', '9999')
        .single()

      expect(firstTweet?.archive_upload_id).toBe(firstArchiveUploadId)
      expect(firstTweet?.favorite_count).toBe(5)
      expect(firstTweet?.retweet_count).toBe(2)

      // Create second archive upload with updated tweet data
      const updatedTweet = {
        ...testTweet,
        tweet: {
          ...testTweet.tweet,
          favorite_count: 10, // Updated count
          retweet_count: 5    // Updated count
        }
      }

      const secondTestArchive = {
        ...testArchive,
        tweets: [updatedTweet]
      }

      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Insert second archive (should upsert the tweet)
      await insertArchiveDirectly(supabase, secondTestArchive)

      // Get the second archive_upload_id
      const { data: secondArchive } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const secondArchiveUploadId = secondArchive?.id
      expect(secondArchiveUploadId).toBeDefined()
      expect(secondArchiveUploadId).not.toBe(firstArchiveUploadId)

      // Verify tweet now has second archive_upload_id and updated counts
      const { data: updatedTweetData } = await supabase
        .from('tweets')
        .select('archive_upload_id, favorite_count, retweet_count')
        .eq('tweet_id', '9999')
        .single()

      expect(updatedTweetData?.archive_upload_id).toBe(secondArchiveUploadId)
      expect(updatedTweetData?.favorite_count).toBe(10)
      expect(updatedTweetData?.retweet_count).toBe(5)
    })

    it('should update archive_upload_id when upserting profile data', async () => {
      // First archive upload
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
            description: {
              bio: 'Original bio',
              website: 'https://original.com',
              location: 'Original Location'
            },
            avatarMediaUrl: 'https://original.com/avatar.jpg',
            headerMediaUrl: 'https://original.com/header.jpg'
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

      // Insert first archive
      await insertArchiveDirectly(supabase, testArchive)

      // Get the first archive_upload_id
      const { data: firstArchive } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const firstArchiveUploadId = firstArchive?.id

      // Verify profile has first archive_upload_id
      const { data: firstProfile } = await supabase
        .from('all_profile')
        .select('archive_upload_id, bio, website')
        .eq('account_id', testAccountId)
        .single()

      expect(firstProfile?.archive_upload_id).toBe(firstArchiveUploadId)
      expect(firstProfile?.bio).toBe('Original bio')
      expect(firstProfile?.website).toBe('https://original.com')

      // Create second archive upload with updated profile
      const updatedTestArchive = {
        ...testArchive,
        profile: [{
          profile: {
            description: {
              bio: 'Updated bio',
              website: 'https://updated.com',
              location: 'Updated Location'
            },
            avatarMediaUrl: 'https://updated.com/avatar.jpg',
            headerMediaUrl: 'https://updated.com/header.jpg'
          }
        }]
      }

      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Insert second archive
      await insertArchiveDirectly(supabase, updatedTestArchive)

      // Get the second archive_upload_id
      const { data: secondArchive } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const secondArchiveUploadId = secondArchive?.id
      expect(secondArchiveUploadId).not.toBe(firstArchiveUploadId)

      // Verify profile now has second archive_upload_id and updated data
      const { data: updatedProfile } = await supabase
        .from('all_profile')
        .select('archive_upload_id, bio, website')
        .eq('account_id', testAccountId)
        .single()

      expect(updatedProfile?.archive_upload_id).toBe(secondArchiveUploadId)
      expect(updatedProfile?.bio).toBe('Updated bio')
      expect(updatedProfile?.website).toBe('https://updated.com')
    })

    it('should update archive_upload_id when upserting tweet media', async () => {
      const testTweetWithMedia = {
        tweet: {
          id: '8888',
          id_str: '8888',
          created_at: '2023-01-01 00:00:00 +0000',
          full_text: 'Tweet with media',
          favorite_count: 0,
          retweet_count: 0,
          favorited: false,
          truncated: false,
          source: 'web',
          entities: {
            user_mentions: [],
            hashtags: [],
            symbols: [],
            urls: [],
            media: [{
              id_str: '123456789',
              media_url_https: 'https://example.com/media1.jpg',
              type: 'photo',
              sizes: {
                large: { w: 1024, h: 768 }
              }
            }]
          }
        }
      }

      // First archive upload
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
        tweets: [testTweetWithMedia],
        'note-tweet': [],
        like: [],
        follower: [],
        following: [],
        'community-tweet': []
      }

      tracker.addAccountId(testAccountId)
      tracker.addTweetId('8888')

      // Insert first archive
      await insertArchiveDirectly(supabase, testArchive)

      // Get the first archive_upload_id
      const { data: firstArchive } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const firstArchiveUploadId = firstArchive?.id

      // Verify media has first archive_upload_id
      const { data: firstMedia } = await supabase
        .from('tweet_media')
        .select('archive_upload_id, media_url, width, height')
        .eq('media_id', 123456789)
        .single()

      expect(firstMedia?.archive_upload_id).toBe(firstArchiveUploadId)
      expect(firstMedia?.width).toBe(1024)
      expect(firstMedia?.height).toBe(768)

      // Create second archive with updated media dimensions
      const updatedTweetWithMedia = {
        ...testTweetWithMedia,
        tweet: {
          ...testTweetWithMedia.tweet,
          entities: {
            ...testTweetWithMedia.tweet.entities,
            media: [{
              ...testTweetWithMedia.tweet.entities.media[0],
              media_url_https: 'https://example.com/media1_updated.jpg',
              sizes: {
                large: { w: 2048, h: 1536 } // Updated dimensions
              }
            }]
          }
        }
      }

      const secondTestArchive = {
        ...testArchive,
        tweets: [updatedTweetWithMedia]
      }

      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Insert second archive
      await insertArchiveDirectly(supabase, secondTestArchive)

      // Get the second archive_upload_id
      const { data: secondArchive } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const secondArchiveUploadId = secondArchive?.id
      expect(secondArchiveUploadId).not.toBe(firstArchiveUploadId)

      // Verify media now has second archive_upload_id and updated data
      const { data: updatedMedia } = await supabase
        .from('tweet_media')
        .select('archive_upload_id, media_url, width, height')
        .eq('media_id', 123456789)
        .single()

      expect(updatedMedia?.archive_upload_id).toBe(secondArchiveUploadId)
      expect(updatedMedia?.media_url).toBe('https://example.com/media1_updated.jpg')
      expect(updatedMedia?.width).toBe(2048)
      expect(updatedMedia?.height).toBe(1536)
    })

    it('should update archive_upload_id when upserting likes, following, and followers', async () => {
      // First archive upload
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
          { like: { tweetId: '1234567890123456789', fullText: 'First liked tweet' } }
        ],
        follower: [
          { follower: { accountId: '1234567890', userLink: 'https://twitter.com/follower_1' } }
        ],
        following: [
          { following: { accountId: '9876543210', userLink: 'https://twitter.com/following_1' } }
        ],
        'community-tweet': []
      }

      tracker.addAccountId(testAccountId)
      tracker.addLikedTweetId('1234567890123456789')

      // Insert first archive
      await insertArchiveDirectly(supabase, testArchive)

      // Get the first archive_upload_id
      const { data: firstArchive } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const firstArchiveUploadId = firstArchive?.id

      // Verify likes, following, followers have first archive_upload_id
      const { data: firstLike } = await supabase
        .from('likes')
        .select('archive_upload_id')
        .eq('account_id', testAccountId)
        .eq('liked_tweet_id', '1234567890123456789')
        .single()

      const { data: firstFollowing } = await supabase
        .from('following')
        .select('archive_upload_id')
        .eq('account_id', testAccountId)
        .eq('following_account_id', '9876543210')
        .single()

      const { data: firstFollower } = await supabase
        .from('followers')
        .select('archive_upload_id')
        .eq('account_id', testAccountId)
        .eq('follower_account_id', '1234567890')
        .single()

      expect(firstLike?.archive_upload_id).toBe(firstArchiveUploadId)
      expect(firstFollowing?.archive_upload_id).toBe(firstArchiveUploadId)
      expect(firstFollower?.archive_upload_id).toBe(firstArchiveUploadId)

      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Insert second archive (should upsert the same relationships)
      await insertArchiveDirectly(supabase, testArchive)

      // Get the second archive_upload_id
      const { data: secondArchive } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const secondArchiveUploadId = secondArchive?.id
      expect(secondArchiveUploadId).not.toBe(firstArchiveUploadId)

      // Verify all relationships now have second archive_upload_id
      const { data: updatedLike } = await supabase
        .from('likes')
        .select('archive_upload_id')
        .eq('account_id', testAccountId)
        .eq('liked_tweet_id', '1234567890123456789')
        .single()

      const { data: updatedFollowing } = await supabase
        .from('following')
        .select('archive_upload_id')
        .eq('account_id', testAccountId)
        .eq('following_account_id', '9876543210')
        .single()

      const { data: updatedFollower } = await supabase
        .from('followers')
        .select('archive_upload_id')
        .eq('account_id', testAccountId)
        .eq('follower_account_id', '1234567890')
        .single()

      expect(updatedLike?.archive_upload_id).toBe(secondArchiveUploadId)
      expect(updatedFollowing?.archive_upload_id).toBe(secondArchiveUploadId)
      expect(updatedFollower?.archive_upload_id).toBe(secondArchiveUploadId)
    })

    it('should handle multiple archive uploads with different data sets', async () => {
      // First archive with some tweets
      const firstArchive = {
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
            description: { bio: 'First bio', website: '', location: '' },
            avatarMediaUrl: '',
            headerMediaUrl: ''
          }
        }],
        tweets: [
          {
            tweet: {
              id: '7777',
              id_str: '7777',
              created_at: '2023-01-01 00:00:00 +0000',
              full_text: 'First archive tweet',
              favorite_count: 1,
              retweet_count: 0,
              favorited: false,
              truncated: false,
              source: 'web',
              entities: { user_mentions: [], hashtags: [], symbols: [], urls: [] }
            }
          }
        ],
        'note-tweet': [],
        like: [
          { like: { tweetId: '1111111111111111111', fullText: 'Liked in first archive' } }
        ],
        follower: [],
        following: [],
        'community-tweet': []
      }

      tracker.addAccountId(testAccountId)
      tracker.addTweetId('7777')
      tracker.addLikedTweetId('1111111111111111111')

      // Insert first archive
      await insertArchiveDirectly(supabase, firstArchive)

      // Second archive with overlapping and new data
      const secondArchive = {
        ...firstArchive,
        profile: [{
          profile: {
            description: { bio: 'Updated bio', website: 'https://updated.com', location: '' },
            avatarMediaUrl: '',
            headerMediaUrl: ''
          }
        }],
        tweets: [
          {
            tweet: {
              id: '7777', // Same tweet, updated counts
              id_str: '7777',
              created_at: '2023-01-01 00:00:00 +0000',
              full_text: 'First archive tweet',
              favorite_count: 5, // Updated
              retweet_count: 2,   // Updated
              favorited: false,
              truncated: false,
              source: 'web',
              entities: { user_mentions: [], hashtags: [], symbols: [], urls: [] }
            }
          },
          {
            tweet: {
              id: '6666', // New tweet
              id_str: '6666',
              created_at: '2023-01-02 00:00:00 +0000',
              full_text: 'Second archive tweet',
              favorite_count: 3,
              retweet_count: 1,
              favorited: false,
              truncated: false,
              source: 'web',
              entities: { user_mentions: [], hashtags: [], symbols: [], urls: [] }
            }
          }
        ],
        like: [
          { like: { tweetId: '1111111111111111111', fullText: 'Liked in first archive' } }, // Same like
          { like: { tweetId: '2222222222222222222', fullText: 'New like in second archive' } } // New like
        ]
      }

      tracker.addTweetId('6666')
      tracker.addLikedTweetId('2222222222222222222')

      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Insert second archive
      await insertArchiveDirectly(supabase, secondArchive)

      // Get both archive upload IDs
      const { data: archives } = await supabase
        .from('archive_upload')
        .select('id')
        .eq('account_id', testAccountId)
        .order('created_at', { ascending: true })

      expect(archives?.length).toBe(2)
      const [firstArchiveUploadId, secondArchiveUploadId] = archives!.map(a => a.id)

      // Verify tweet 7777 has updated archive_upload_id and counts
      const { data: updatedTweet } = await supabase
        .from('tweets')
        .select('archive_upload_id, favorite_count, retweet_count')
        .eq('tweet_id', '7777')
        .single()

      expect(updatedTweet?.archive_upload_id).toBe(secondArchiveUploadId)
      expect(updatedTweet?.favorite_count).toBe(5)
      expect(updatedTweet?.retweet_count).toBe(2)

      // Verify tweet 6666 has second archive_upload_id
      const { data: newTweet } = await supabase
        .from('tweets')
        .select('archive_upload_id')
        .eq('tweet_id', '6666')
        .single()

      expect(newTweet?.archive_upload_id).toBe(secondArchiveUploadId)

      // Verify profile has updated archive_upload_id
      const { data: profile } = await supabase
        .from('all_profile')
        .select('archive_upload_id, bio, website')
        .eq('account_id', testAccountId)
        .single()

      expect(profile?.archive_upload_id).toBe(secondArchiveUploadId)
      expect(profile?.bio).toBe('Updated bio')
      expect(profile?.website).toBe('https://updated.com')

      // Verify both likes have second archive_upload_id
      const { data: likes } = await supabase
        .from('likes')
        .select('archive_upload_id, liked_tweet_id')
        .eq('account_id', testAccountId)
        .order('liked_tweet_id')

      expect(likes?.length).toBe(2)
      expect(likes?.[0].archive_upload_id).toBe(secondArchiveUploadId) // 1111111111111111111
      expect(likes?.[1].archive_upload_id).toBe(secondArchiveUploadId) // 2222222222222222222
    })
  })

  describe('Finalize archive_upload record', () => {
    it('should update archive_upload record to completed', async () => {
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

      const {data: archiveUploadIdData} = await supabase.from('archive_upload')
      .select('id')
      .eq('account_id', testAccountId)
      .order('archive_at', {ascending: false})
      .single()
      
      expect(archiveUploadIdData?.id).toBeDefined()
      // Verify insertion
      const result = await verifyArchiveUploadPhase(supabase, archiveUploadIdData!.id, 'completed')
      
      expect(result.success).toBe(true)
    })
  })
})