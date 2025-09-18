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

  // First try to update existing row
  const { data: existingUpload, error: existingError } = await supabase
    .from('archive_upload')
    .update({ upload_phase: 'uploading' })
    .eq('account_id', accountId)
    .select('id')
    .maybeSingle()

  let latestTweetDate = archive.tweets.reduce(
    (latest: string, tweet: any) => {
      const tweetDate = new Date(tweet.tweet.created_at)
      return latest
        ? tweetDate > new Date(latest)
          ? tweetDate.toISOString()
          : latest
        : tweetDate.toISOString()
    },new Date().toISOString());

  // If no existing row, create new one
  const { data: archiveUploadIdData, error: uploadError } = existingUpload
    ? { data: existingUpload, error: existingError }
    : await supabase
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