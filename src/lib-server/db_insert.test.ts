import {
  insertAccounts,
  insertProfiles,
  insertTweets,
  insertTweetEntitiesBatch,
  insertTweetMediaBatch,
  insertFollowers,
  insertFollowings,
  processTwitterArchive,
  insertArchiveUpload,
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
    },
  }))
  const archiveUpload = {
    account_id: account[0].account.accountId,
    archive_at: new Date().toISOString().replace('Z', '+00:00'),
  }
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
    await supabaseAdmin
      .from('dev_archive_upload')
      .delete()
      .neq('account_id', '0')
    await supabaseAdmin.from('dev_account').delete().neq('account_id', '0')
    await supabaseAdmin.from('dev_profile').delete().neq('account_id', '0')
    await supabaseAdmin.from('dev_tweets').delete().neq('tweet_id', '0')
    await supabaseAdmin.from('dev_tweet_entities').delete().neq('tweet_id', '0')
    await supabaseAdmin.from('dev_tweet_media').delete().neq('tweet_id', '0')
    await supabaseAdmin.from('dev_followers').delete().neq('account_id', '0')
    await supabaseAdmin.from('dev_following').delete().neq('account_id', '0')
  })

  test('processTwitterArchive', async () => {
    // Clear the database before running this test
    const mockArchiveData = {
      account: account,
      profile: profile,
      tweets: tweets.slice(0, 2),
      follower: follower.slice(0, 2),
      following: following.slice(0, 2),
    }
    console.log('tweets', mockArchiveData.tweets)

    await processTwitterArchive(supabaseAdmin, mockArchiveData)

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
