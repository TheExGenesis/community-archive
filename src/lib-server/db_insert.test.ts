import {
  insertAccount,
  insertTweet,
  insertTweetEntities,
  insertTweetMedia,
  insertFollower,
  insertFollowing,
  processTwitterArchive,
} from './db_insert'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase URL and key must be provided in environment variables',
  )
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Helper function to read and parse mock data
const readMockData = (filename: string) => {
  const data = fs.readFileSync(
    path.resolve(__dirname, `../../data/mock-archive/data/${filename}`),
    'utf8',
  )
  const dataJson = data.slice(data.indexOf('['))
  return JSON.parse(dataJson)
}

describe('Twitter Archive DB Insert Functions', () => {
  const tweets = readMockData('tweets.js')
  const follower = readMockData('follower.js')
  const following = readMockData('following.js')
  const account = readMockData('account.js')

  beforeAll(async () => {
    // Clear test data before running tests
    await supabase.from('dev_account').delete().neq('account_id', '0')
    await supabase.from('dev_tweets').delete().neq('tweet_id', '0')
    await supabase.from('dev_tweet_entities').delete().neq('tweet_id', '0')
    await supabase.from('dev_tweet_media').delete().neq('tweet_id', '0')
    await supabase.from('dev_followers').delete().neq('account_id', '0')
    await supabase.from('dev_following').delete().neq('account_id', '0')
  })

  test('insertAccount', async () => {
    const mockAccountData = account[0]

    await insertAccount(mockAccountData)

    const { data, error } = await supabase
      .from('dev_account')
      .select()
      .eq('account_id', mockAccountData.account.accountId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({
      email: mockAccountData.account.email,
      created_via: mockAccountData.account.createdVia,
      username: mockAccountData.account.username,
      account_id: mockAccountData.account.accountId,
      created_at: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:\d{2}|Z)$/,
      ),
      account_display_name: mockAccountData.account.accountDisplayName,
    })
  })

  test('insertTweet', async () => {
    const tweetData = tweets[0]
    await insertTweet(tweetData)

    const { data, error } = await supabase
      .from('dev_tweets')
      .select()
      .eq('tweet_id', tweetData.tweet.id_str)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({
      tweet_id: tweetData.tweet.id_str,
      full_text: tweetData.tweet.full_text,
      lang: tweetData.tweet.lang,
    })
  })

  test('insertTweetEntities', async () => {
    const tweetWithEntities = tweets.find(
      (t: any) =>
        t.tweet.entities.user_mentions.length > 0 ||
        t.tweet.entities.hashtags.length > 0 ||
        t.tweet.entities.symbols.length > 0 ||
        t.tweet.entities.urls.length > 0,
    )

    if (!tweetWithEntities) {
      console.warn('No tweet with entities found in the sample data')
      return
    }

    // Insert the parent tweet first
    await insertTweet(tweetWithEntities)

    const entitiesCount =
      tweetWithEntities.tweet.entities.user_mentions.length +
      tweetWithEntities.tweet.entities.hashtags.length +
      tweetWithEntities.tweet.entities.symbols.length +
      tweetWithEntities.tweet.entities.urls.length

    await insertTweetEntities(tweetWithEntities.tweet)

    const { data, error } = await supabase
      .from('dev_tweet_entities')
      .select()
      .eq('tweet_id', tweetWithEntities.tweet.id_str)

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data![0]).toHaveProperty('entity_type')
    expect(data![0]).toHaveProperty('entity_value')
  })

  test('insertTweetMedia', async () => {
    const tweetWithMedia = tweets.find(
      (t: any) => t.tweet.extended_entities?.media,
    )
    if (tweetWithMedia) {
      // Insert the parent tweet first
      await insertTweet(tweetWithMedia)

      await insertTweetMedia(tweetWithMedia.tweet)

      const { data, error } = await supabase
        .from('dev_tweet_media')
        .select()
        .eq('tweet_id', tweetWithMedia.tweet.id_str)

      expect(error).toBeNull()
      expect(data!.length).toBeGreaterThan(0)
      expect(data![0]).toHaveProperty('media_url')
      expect(data![0]).toHaveProperty('media_type')
    } else {
      console.warn('No tweet with media found in the sample data')
    }
  })

  test('insertFollower', async () => {
    const mockFollowerData = follower[0]
    const accountId = account[0].account.accountId

    await insertFollower(mockFollowerData, accountId)

    const { data, error } = await supabase
      .from('dev_followers')
      .select()
      .eq('account_id', accountId)
      .eq('follower_account_id', mockFollowerData.follower.accountId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  test('insertFollowing', async () => {
    const mockFollowingData = following[0]
    const accountId = account[0].account.accountId

    await insertFollowing(mockFollowingData, accountId)

    const { data, error } = await supabase
      .from('dev_following')
      .select()
      .eq('account_id', accountId)
      .eq('following_account_id', mockFollowingData.following.accountId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  test('processTwitterArchive', async () => {
    // Clear the database before running this test
    await supabase.from('dev_account').delete().neq('account_id', '0')
    await supabase.from('dev_tweets').delete().neq('tweet_id', '0')
    await supabase.from('dev_tweet_entities').delete().neq('tweet_id', '0')
    await supabase.from('dev_tweet_media').delete().neq('tweet_id', '0')
    await supabase.from('dev_followers').delete().neq('account_id', '0')
    await supabase.from('dev_following').delete().neq('account_id', '0')

    const mockArchiveData = {
      account: account,
      tweets: tweets.slice(0, 2),
      followers: follower.slice(0, 2),
      following: following.slice(0, 2),
    }

    await processTwitterArchive(mockArchiveData)

    // Check account
    const { data: accountData } = await supabase
      .from('dev_account')
      .select()
      .eq('account_id', account[0].account.accountId)

    expect(accountData).toHaveLength(1)

    // Check tweets
    const { data: tweetsData } = await supabase
      .from('dev_tweets')
      .select()
      .eq('account_id', account[0].account.accountId)

    expect(tweetsData!.length).toBe(2)

    // Check followers
    const { data: followersData } = await supabase
      .from('dev_followers')
      .select()
      .eq('account_id', account[0].account.accountId)

    expect(followersData).toHaveLength(2)

    // Check following
    const { data: followingData } = await supabase
      .from('dev_following')
      .select()
      .eq('account_id', account[0].account.accountId)

    expect(followingData).toHaveLength(2)
  })
})
