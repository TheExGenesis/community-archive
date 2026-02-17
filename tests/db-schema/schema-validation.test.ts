import { SupabaseClient } from '@supabase/supabase-js'
import {
  createSchemaTestClient,
  tableExists,
  viewHasColumns,
  rpcCallable,
} from './test-utils'

let supabase: SupabaseClient

beforeAll(() => {
  supabase = createSchemaTestClient()
})

jest.setTimeout(60000)

describe('Database Schema Validation', () => {
  describe('Core tables exist', () => {
    const requiredTables = [
      'tweets',
      'all_account',
      'all_profile',
      'tweet_media',
      'user_mentions',
      'mentioned_users',
      'quote_tweets',
      'conversations',
      'archive_upload',
      'likes',
      'liked_tweets',
      'followers',
      'following',
      'tweet_urls',
    ]

    test.each(requiredTables)('table "%s" exists and is queryable', async (table) => {
      const exists = await tableExists(supabase, table)
      expect(exists).toBe(true)
    })
  })

  describe('Views exist with expected columns', () => {
    test('enriched_tweets view has expected columns', async () => {
      const expectedColumns = [
        'tweet_id',
        'account_id',
        'username',
        'account_display_name',
        'created_at',
        'full_text',
        'retweet_count',
        'favorite_count',
        'reply_to_tweet_id',
        'reply_to_user_id',
        'reply_to_username',
        'quoted_tweet_id',
        'conversation_id',
        'avatar_media_url',
      ]
      const result = await viewHasColumns(supabase, 'enriched_tweets', expectedColumns)
      expect(result.exists).toBe(true)
      expect(result.missingColumns).toEqual([])
    })
  })

  describe('RPC functions exist', () => {
    test('search_tweets function is callable', async () => {
      const result = await rpcCallable(supabase, 'search_tweets', {
        search_query: 'test',
      })
      expect(result.callable).toBe(true)
    })

    test('get_main_thread function is callable', async () => {
      const result = await rpcCallable(supabase, 'get_main_thread', {
        p_conversation_id: '0',
      })
      expect(result.callable).toBe(true)
    })

    test('get_tweet_page_data function is callable', async () => {
      const result = await rpcCallable(supabase, 'get_tweet_page_data', {
        p_tweet_id: '0',
      })
      expect(result.callable).toBe(true)
    })
  })

  describe('get_tweet_page_data returns expected shape', () => {
    test('returns JSONB with expected top-level keys for an existing tweet', async () => {
      // Find any tweet that exists in the DB to test against
      const { data: sampleTweet } = await supabase
        .from('tweets')
        .select('tweet_id')
        .limit(1)
        .single()

      if (!sampleTweet) {
        console.warn('No tweets in database - skipping shape test')
        return
      }

      const { data, error } = await supabase.rpc('get_tweet_page_data' as any, {
        p_tweet_id: sampleTweet.tweet_id,
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()

      // The function returns a JSONB object with these keys
      const result = data as any
      expect(result).toHaveProperty('tweet')
      expect(result).toHaveProperty('conversation_tweets')
      expect(result).toHaveProperty('media')
      expect(result).toHaveProperty('conversation_media')
      expect(result).toHaveProperty('mentioned_users')
      expect(result).toHaveProperty('quoted_tweets')

      // tweet should have core fields
      if (result.tweet) {
        expect(result.tweet).toHaveProperty('tweet_id')
        expect(result.tweet).toHaveProperty('full_text')
        expect(result.tweet).toHaveProperty('account_id')
      }
    })

    test('returns null tweet for non-existent tweet_id', async () => {
      const { data, error } = await supabase.rpc('get_tweet_page_data' as any, {
        p_tweet_id: '0',
      })

      // Should not error, but tweet should be null
      expect(error).toBeNull()
      const result = data as any
      expect(result.tweet).toBeNull()
    })
  })
})
