import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env file in the scratchpad directory
dotenv.config({ path: path.resolve(__dirname, '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase URL and key must be provided in environment variables',
  )
}

const supabase = createClient(supabaseUrl, supabaseKey)
// Insert account data
export async function insertAccount(accountData: any) {
  console.log(accountData.account)
  const { data, error } = await supabase.from('dev_account').upsert(
    {
      email: accountData.account.email,
      created_via: accountData.account.createdVia,
      username: accountData.account.username,
      account_id: accountData.account.accountId,
      created_at: accountData.account.createdAt,
      account_display_name: accountData.account.accountDisplayName,
    },
    {
      onConflict: 'account_id',
      ignoreDuplicates: false,
    },
  )

  if (error) console.error('Error upserting account:', error)
  else console.log('Account upserted successfully')
}

// Insert tweet data
export async function insertTweet(tweetData: any) {
  const { data, error } = await supabase.from('dev_tweets').upsert(
    {
      tweet_id: tweetData.tweet.id_str,
      account_id: tweetData.tweet.user_id_str,
      created_at: tweetData.tweet.created_at,
      full_text: tweetData.tweet.full_text,
      lang: tweetData.tweet.lang,
      retweet_count: tweetData.tweet.retweet_count,
      favorite_count: tweetData.tweet.favorite_count,
      reply_to_tweet_id: tweetData.tweet.in_reply_to_status_id_str,
      reply_to_user_id: tweetData.tweet.in_reply_to_user_id_str,
      reply_to_username: tweetData.tweet.in_reply_to_screen_name,
      is_retweet: tweetData.tweet.retweeted,
      source: tweetData.tweet.source,
      possibly_sensitive: tweetData.tweet.possibly_sensitive || false,
    },
    {
      onConflict: 'tweet_id',
      ignoreDuplicates: false,
    },
  )

  if (error) console.error('Error upserting tweet:', error)
  else {
    console.log('Tweet upserted successfully')
    await insertTweetEntities(tweetData.tweet)
    await insertTweetMedia(tweetData.tweet)
  }
}

// Insert tweet entities
export async function insertTweetEntities(tweet: any) {
  const { data: existingTweet, error: tweetError } = await supabase
    .from('dev_tweets')
    .select('tweet_id')
    .eq('tweet_id', tweet.id_str)
    .single()

  if (tweetError || !existingTweet) {
    console.error('Parent tweet does not exist. Inserting tweet first.')
    await insertTweet({ tweet })
  }
  const entities = [
    ...tweet.entities.hashtags.map((h: any, index: number) => ({
      type: 'hashtag',
      value: h.text,
      position_index: index,
      start_index: h.indices[0],
      end_index: h.indices[1],
    })),
    ...tweet.entities.user_mentions.map((u: any, index: number) => ({
      type: 'user_mention',
      value: u.screen_name,
      position_index: index,
      start_index: u.indices[0],
      end_index: u.indices[1],
    })),
    ...tweet.entities.urls.map((u: any, index: number) => ({
      type: 'url',
      value: u.expanded_url,
      position_index: index,
      start_index: u.indices[0],
      end_index: u.indices[1],
    })),
  ]

  const { data, error } = await supabase.from('dev_tweet_entities').upsert(
    entities.map((entity) => ({
      tweet_id: tweet.id_str,
      entity_type: entity.type,
      entity_value: entity.value,
      position_index: entity.position_index,
      start_index: entity.start_index,
      end_index: entity.end_index,
    })),
    {
      onConflict: 'tweet_id,entity_type,position_index',
      ignoreDuplicates: false,
    },
  )

  if (error) console.error('Error upserting tweet entities:', error)
  else console.log('Tweet entities upserted successfully')
}

// Insert tweet media
export async function insertTweetMedia(tweet: any) {
  if (tweet.extended_entities && tweet.extended_entities.media) {
    // Check if the parent tweet exists
    const { data: existingTweet, error: tweetError } = await supabase
      .from('dev_tweets')
      .select('tweet_id')
      .eq('tweet_id', tweet.id_str)
      .single()

    if (tweetError || !existingTweet) {
      console.error('Parent tweet does not exist. Inserting tweet first.')
      await insertTweet({ tweet })
    }

    const mediaInserts = tweet.extended_entities.media.map((media: any) => ({
      media_id: media.id_str,
      tweet_id: tweet.id_str,
      media_url: media.media_url_https,
      media_type: media.type,
      width: media.sizes.large.w,
      height: media.sizes.large.h,
    }))

    const { data, error } = await supabase
      .from('dev_tweet_media')
      .upsert(mediaInserts, {
        onConflict: 'media_id',
        ignoreDuplicates: false,
      })

    if (error) console.error('Error upserting tweet media:', error)
    else console.log('Tweet media upserted successfully')
  }
}

// Insert follower data
export async function insertFollower(followerData: any, accountId: any) {
  const { data, error } = await supabase.from('dev_followers').upsert(
    {
      account_id: accountId,
      follower_account_id: followerData.follower.accountId,
    },
    {
      onConflict: 'account_id,follower_account_id',
      ignoreDuplicates: true,
    },
  )

  if (error) console.error('Error upserting follower:', error)
  else console.log('Follower upserted successfully')
}

// Insert following data
export async function insertFollowing(followingData: any, accountId: any) {
  const { data, error } = await supabase.from('dev_following').upsert(
    {
      account_id: accountId,
      following_account_id: followingData.following.accountId,
    },
    {
      onConflict: 'account_id,following_account_id',
      ignoreDuplicates: true,
    },
  )

  if (error) console.error('Error upserting following:', error)
  else console.log('Following upserted successfully')
}

// Main function to process all data
export async function processTwitterArchive(archiveData: any) {
  console.log('Archive Data')
  console.log(archiveData)
  console.log(archiveData.account)

  const tweets = archiveData.tweets.map((tweet: any) => {
    tweet.tweet.user_id = archiveData.account[0].account.accountId
    tweet.tweet.user_id_str = archiveData.account[0].account.accountId
    return tweet
  })
  console.log(tweets)
  // Insert account data
  await insertAccount(archiveData.account[0])

  // Insert tweets
  for (const tweet of tweets) {
    await insertTweet(tweet)
  }

  // Insert followers
  for (const follower of archiveData.followers) {
    await insertFollower(follower, archiveData.account[0].account.accountId)
  }

  // Insert following
  for (const following of archiveData.following) {
    await insertFollowing(following, archiveData.account[0].account.accountId)
  }
}

// Usage example
// const archiveData = {
//   account: [
//     /* Your account data */
//   ],
//   tweets: [
//     /* Your tweets data */
//   ],
//   followers: [
//     /* Your followers data */
//   ],
//   following: [
//     /* Your following data */
//   ],
// }

// processTwitterArchive(archiveData)
//   .then(() => console.log('Twitter archive processing complete'))
//   .catch((error) => console.error('Error processing Twitter archive:', error))
