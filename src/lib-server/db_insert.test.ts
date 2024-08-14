import {
  insertAccounts,
  insertProfiles,
  insertTweets,
  insertTweetEntitiesBatch,
  insertTweetMediaBatch,
  insertFollowers,
  insertFollowings,
  processTwitterArchive,
} from './db_insert'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '.env') })
}
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    'Supabase URL and key must be provided in environment variables',
  )
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

// Helper function to read and parse mock data
const readMockData = (filename: string) => {
  const data = fs.readFileSync(
    path.resolve(__dirname, `../../data/mock-archive/data/${filename}`),
    'utf8',
  )
  const dataJson = data.slice(data.indexOf('['))
  // console.log(dataJson)
  return JSON.parse(dataJson)
}

describe('Twitter Archive DB Insert Functions', () => {
  const account = readMockData('account.js').map((a: any) => ({
    ...a,
    account: {
      ...a.account,
      latest_archive_at: new Date().toISOString().replace('Z', '+00:00'),
    },
  }))
  const profile = readMockData('profile.js').map((p: any) => ({
    ...p,
    profile: {
      ...p.profile,
      account_id: account[0].account.accountId,
    },
  }))
  const tweets = readMockData('tweets.js').map((t: any) => ({
    ...t,
    tweet: {
      ...t.tweet,
      user_id: account[0].account.accountId,
      user_id_str: account[0].account.accountId,
    },
  }))
  const follower = readMockData('follower.js')
  const following = readMockData('following.js')

  beforeEach(async () => {
    // Clear test data before each test
    await supabaseAdmin.from('dev_account').delete().neq('account_id', '0')
    await supabaseAdmin.from('dev_profile').delete().neq('account_id', '0')
    await supabaseAdmin.from('dev_tweets').delete().neq('tweet_id', '0')
    await supabaseAdmin.from('dev_tweet_entities').delete().neq('tweet_id', '0')
    await supabaseAdmin.from('dev_tweet_media').delete().neq('tweet_id', '0')
    await supabaseAdmin.from('dev_followers').delete().neq('account_id', '0')
    await supabaseAdmin.from('dev_following').delete().neq('account_id', '0')
  })

  test('insertAccounts', async () => {
    const mockAccountData = [account[0]]

    await insertAccounts(mockAccountData)

    const { data, error } = await supabaseAdmin
      .from('dev_account')
      .select()
      .eq('account_id', mockAccountData[0].account.accountId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({
      // email: mockAccountData[0].account.email,
      created_via: mockAccountData[0].account.createdVia,
      username: mockAccountData[0].account.username,
      account_id: mockAccountData[0].account.accountId,
      created_at: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:\d{2}|Z)$/,
      ),
      account_display_name: mockAccountData[0].account.accountDisplayName,
    })
  })

  test('insertProfiles', async () => {
    await insertAccounts(account)
    const mockProfileData = [profile[0]]

    await insertProfiles(mockProfileData)

    const { data, error } = await supabaseAdmin
      .from('dev_profile')
      .select()
      .eq('account_id', mockProfileData[0].profile.account_id)
    console.log(mockProfileData)
    console.log(data)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({
      bio: mockProfileData[0].profile.description.bio,
      website: mockProfileData[0].profile.description.website,
      location: mockProfileData[0].profile.description.location,
      avatar_media_url: mockProfileData[0].profile.avatarMediaUrl,
      header_media_url: mockProfileData[0].profile.headerMediaUrl,
    })
  })

  test('insertTweets', async () => {
    await insertAccounts(account)

    const tweetData = [tweets[0]]
    await insertTweets(tweetData)

    const { data, error } = await supabaseAdmin
      .from('dev_tweets')
      .select()
      .eq('tweet_id', tweetData[0].tweet.id_str)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({
      tweet_id: tweetData[0].tweet.id_str,
      full_text: tweetData[0].tweet.full_text,
    })
  })

  test('insertTweetEntitiesBatch', async () => {
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
    await insertTweets([tweetWithEntities])

    await insertTweetEntitiesBatch([tweetWithEntities.tweet])

    const { data, error } = await supabaseAdmin
      .from('dev_tweet_entities')
      .select()
      .eq('tweet_id', tweetWithEntities.tweet.id_str)

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data![0]).toHaveProperty('entity_type')
    expect(data![0]).toHaveProperty('entity_value')
  })

  test('insertTweetMediaBatch', async () => {
    const tweetWithMedia = tweets.find(
      (t: any) => t.tweet.extended_entities?.media,
    )
    if (tweetWithMedia) {
      await insertTweets([tweetWithMedia])

      await insertTweetMediaBatch([tweetWithMedia.tweet])

      const { data, error } = await supabaseAdmin
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

  test('insertFollowers', async () => {
    const mockFollowerData = [follower[0]]
    const accountId = account[0].account.accountId

    await insertFollowers(mockFollowerData, accountId)

    const { data, error } = await supabaseAdmin
      .from('dev_followers')
      .select()
      .eq('account_id', accountId)
      .eq('follower_account_id', mockFollowerData[0].follower.accountId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  test('insertFollowings', async () => {
    const mockFollowingData = [following[0]]
    const accountId = account[0].account.accountId

    await insertFollowings(mockFollowingData, accountId)

    const { data, error } = await supabaseAdmin
      .from('dev_following')
      .select()
      .eq('account_id', accountId)
      .eq('following_account_id', mockFollowingData[0].following.accountId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  test('processTwitterArchive', async () => {
    // Clear the database before running this test
    await supabaseAdmin.from('dev_account').delete().neq('account_id', '0')
    await supabaseAdmin.from('dev_profile').delete().neq('account_id', '0')
    await supabaseAdmin.from('dev_tweets').delete().neq('tweet_id', '0')
    await supabaseAdmin.from('dev_tweet_entities').delete().neq('tweet_id', '0')
    await supabaseAdmin.from('dev_tweet_media').delete().neq('tweet_id', '0')
    await supabaseAdmin.from('dev_followers').delete().neq('account_id', '0')
    await supabaseAdmin.from('dev_following').delete().neq('account_id', '0')

    const mockArchiveData = {
      account: account,
      profile: profile,
      tweets: tweets.slice(0, 2),
      follower: follower.slice(0, 2),
      following: following.slice(0, 2),
    }
    console.log('tweets', mockArchiveData.tweets)

    await processTwitterArchive(mockArchiveData)

    // Check account
    const { data: accountData } = await supabaseAdmin
      .from('dev_account')
      .select()
      .eq('account_id', account[0].account.accountId)

    expect(accountData).toHaveLength(1)

    // Check profile
    const { data: profileData } = await supabaseAdmin
      .from('dev_profile')
      .select()
      .eq('account_id', account[0].account.accountId)

    expect(profileData).toHaveLength(1)

    // Check tweets
    const { data: tweetsData } = await supabaseAdmin
      .from('dev_tweets')
      .select()
      .eq('account_id', account[0].account.accountId)

    expect(tweetsData!.length).toBe(2)

    // Check followers
    const { data: followersData } = await supabaseAdmin
      .from('dev_followers')
      .select()
      .eq('account_id', account[0].account.accountId)

    expect(followersData).toHaveLength(2)

    // Check following
    const { data: followingData } = await supabaseAdmin
      .from('dev_following')
      .select()
      .eq('account_id', account[0].account.accountId)

    expect(followingData).toHaveLength(2)
  })
})
