import { SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env file in the scratchpad directory
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '.env') })
}

const isProduction = process.env.NODE_ENV === 'production'

// Helper function to get the correct table name based on environment
const getTableName = (baseName: string) =>
  isProduction ? baseName : `dev_${baseName}`

const BATCH_SIZE = 1000

// Helper function to process data in batches
const processBatch = async <T>(
  items: T[],
  batchProcessor: (batch: T[]) => Promise<void>,
) => {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    await batchProcessor(batch)
  }
}

// Insert archive upload data
export const insertArchiveUpload = async (
  supabase: SupabaseClient,
  archiveUploads: { account_id: string; archive_at: string }[],
) => {
  await processBatch(archiveUploads, async (batch) => {
    const { data, error } = await supabase
      .from(getTableName('archive_upload'))
      .upsert(batch, {
        onConflict: 'account_id,archive_at',
        ignoreDuplicates: false,
      })

    if (error) console.error('Error upserting archive uploads:', error)
    else console.log(`${batch.length} archive uploads upserted successfully`)
  })
}

// Insert account data
export const insertAccounts = async (
  supabase: SupabaseClient,
  accountsData: any[],
) => {
  await processBatch(accountsData, async (batch) => {
    const accounts = batch.map((accountData) => ({
      created_via: accountData.account.createdVia,
      username: accountData.account.username,
      account_id: accountData.account.accountId,
      created_at: accountData.account.createdAt,
      account_display_name: accountData.account.accountDisplayName,
    }))

    const { data, error } = await supabase
      .from(getTableName('account'))
      .upsert(accounts, {
        onConflict: 'account_id',
        ignoreDuplicates: false,
      })
      .select()

    if (error) console.error('Error upserting accounts:', error)
    else console.log(`${accounts.length} accounts upserted successfully`)
  })
}

// Insert profile data
export const insertProfiles = async (
  supabase: SupabaseClient,
  profilesData: any[],
) => {
  await processBatch(profilesData, async (batch) => {
    const profiles = batch.map((profileData) => ({
      bio: profileData.profile.description.bio,
      website: profileData.profile.description.website,
      location: profileData.profile.description.location,
      avatar_media_url: profileData.profile.avatarMediaUrl,
      header_media_url: profileData.profile.headerMediaUrl,
      account_id: profileData.profile.account_id,
    }))

    const { data, error } = await supabase
      .from(getTableName('profile'))
      .upsert(profiles, {
        onConflict: 'account_id',
        ignoreDuplicates: false,
      })

    if (error) console.error('Error upserting profiles:', error)
    else console.log(`${profiles.length} profiles upserted successfully`)
  })
}

// Insert tweet data
export const insertTweets = async (
  supabase: SupabaseClient,
  tweetsData: any[],
) => {
  await processBatch(tweetsData, async (batch) => {
    const tweets = batch.map((tweetData) => ({
      tweet_id: tweetData.tweet.id_str,
      account_id: tweetData.tweet.user_id_str,
      created_at: tweetData.tweet.created_at,
      full_text: tweetData.tweet.full_text,
      retweet_count: tweetData.tweet.retweet_count,
      favorite_count: tweetData.tweet.favorite_count,
      reply_to_tweet_id: tweetData.tweet.in_reply_to_status_id_str,
      reply_to_user_id: tweetData.tweet.in_reply_to_user_id_str,
      reply_to_username: tweetData.tweet.in_reply_to_screen_name,
      is_retweet: tweetData.tweet.retweeted,
    }))

    const { data, error } = await supabase
      .from(getTableName('tweets'))
      .upsert(tweets, {
        onConflict: 'tweet_id',
        ignoreDuplicates: false,
      })
      .select()

    if (error) {
      console.error('Error upserting tweets:', error)
    } else {
      console.log(`${tweets.length} tweets upserted successfully`)
      const successfulTweetIds = data ? data.map((tweet) => tweet.tweet_id) : []
      const confirmedSuccessfulTweets = batch.filter((td) =>
        successfulTweetIds.includes(td.tweet.id_str),
      )

      if (confirmedSuccessfulTweets.length > 0) {
        await insertTweetEntitiesBatch(
          supabase,
          confirmedSuccessfulTweets.map((td) => td.tweet),
        )
        await insertTweetMediaBatch(
          supabase,
          confirmedSuccessfulTweets.map((td) => td.tweet),
        )
      }
    }
  })
}

// Insert tweet entities in batch
export const insertTweetEntitiesBatch = async (
  supabase: SupabaseClient,
  tweets: any[],
) => {
  const allEntities = tweets.flatMap((tweet) => [
    ...tweet.entities.hashtags.map((h: any, index: number) => ({
      tweet_id: tweet.id_str,
      entity_type: 'hashtag',
      entity_value: h.text,
      position_index: index,
      start_index: h.indices[0],
      end_index: h.indices[1],
    })),
    ...tweet.entities.user_mentions.map((u: any, index: number) => ({
      tweet_id: tweet.id_str,
      entity_type: 'user_mention',
      entity_value: u.screen_name,
      position_index: index,
      start_index: u.indices[0],
      end_index: u.indices[1],
    })),
    ...tweet.entities.urls.map((u: any, index: number) => ({
      tweet_id: tweet.id_str,
      entity_type: 'url',
      entity_value: u.expanded_url,
      position_index: index,
      start_index: u.indices[0],
      end_index: u.indices[1],
    })),
  ])

  await processBatch(allEntities, async (batch) => {
    const { data, error } = await supabase
      .from(getTableName('tweet_entities'))
      .upsert(batch, {
        onConflict: 'tweet_id,entity_type,position_index',
        ignoreDuplicates: false,
      })

    if (error) console.error('Error upserting tweet entities:', error)
    else console.log(`${batch.length} tweet entities upserted successfully`)
  })
}

// Insert tweet media in batch
export const insertTweetMediaBatch = async (
  supabase: SupabaseClient,
  tweets: any[],
) => {
  const allMedia = tweets.flatMap((tweet) =>
    tweet.extended_entities && tweet.extended_entities.media
      ? tweet.extended_entities.media.map((media: any) => ({
          media_id: media.id_str,
          tweet_id: tweet.id_str,
          media_url: media.media_url_https,
          media_type: media.type,
          width: media.sizes.large.w,
          height: media.sizes.large.h,
        }))
      : [],
  )

  if (allMedia.length > 0) {
    const uniqueMedia = allMedia.reduce((acc: any[], curr: any) => {
      if (!acc.find((item: any) => item.media_id === curr.media_id)) {
        acc.push(curr)
      }
      return acc
    }, [])

    await processBatch(uniqueMedia, async (batch) => {
      const { data, error } = await supabase
        .from(getTableName('tweet_media'))
        .upsert(batch, {
          onConflict: 'media_id',
          ignoreDuplicates: true,
        })

      if (error) console.error('Error upserting tweet media:', error)
      else console.log(`${batch.length} tweet media upserted successfully`)
    })
  }
}

// Insert follower data in batch
export const insertFollowers = async (
  supabase: SupabaseClient,
  followersData: any[],
  accountId: string,
) => {
  const followers = followersData.map((followerData) => ({
    account_id: accountId,
    follower_account_id: followerData.follower.accountId,
  }))

  await processBatch(followers, async (batch) => {
    const { data, error } = await supabase
      .from(getTableName('followers'))
      .upsert(batch, {
        onConflict: 'account_id,follower_account_id',
        ignoreDuplicates: true,
      })

    if (error) console.error('Error upserting followers:', error)
    else console.log(`${batch.length} followers upserted successfully`)
  })
}

// Insert following data in batch
export const insertFollowings = async (
  supabase: SupabaseClient,
  followingsData: any[],
  accountId: string,
) => {
  const followings = followingsData.map((followingData) => ({
    account_id: accountId,
    following_account_id: followingData.following.accountId,
  }))

  await processBatch(followings, async (batch) => {
    const { data, error } = await supabase
      .from(getTableName('following'))
      .upsert(batch, {
        onConflict: 'account_id,following_account_id',
        ignoreDuplicates: true,
      })

    if (error) console.error('Error upserting followings:', error)
    else console.log(`${batch.length} followings upserted successfully`)
  })
}

const removeExistingFollowers = async (
  supabase: SupabaseClient,
  accountId: string,
) => {
  const { error } = await supabase
    .from(getTableName('followers'))
    .delete()
    .eq('account_id', accountId)

  if (error) console.error('Error removing existing followers:', error)
  else console.log(`Existing followers removed for account ${accountId}`)
}

const removeExistingFollowings = async (
  supabase: SupabaseClient,
  accountId: string,
) => {
  const { error } = await supabase
    .from(getTableName('following'))
    .delete()
    .eq('account_id', accountId)

  if (error) console.error('Error removing existing followings:', error)
  else console.log(`Existing followings removed for account ${accountId}`)
}

// Main function to process all data
export const processTwitterArchive = async (
  supabase: SupabaseClient,
  archiveData: any,
) => {
  console.log('Processing Twitter Archive')

  const tweets = archiveData.tweets.map((tweet: any) => ({
    ...tweet,
    tweet: {
      ...tweet.tweet,
      user_id: archiveData.account[0].account.accountId,
      user_id_str: archiveData.account[0].account.accountId,
    },
  }))

  const latestTweetDate = tweets
    .map((tweet: any) => new Date(tweet.tweet.created_at))
    .reduce(
      (latest: any, current: any) => (current > latest ? current : latest),
      new Date(0),
    )
    .toISOString()

  const profilesWithAccountId = archiveData.profile.map((profile: any) => ({
    ...profile,
    profile: {
      ...profile.profile,
      account_id: archiveData.account[0].account.accountId,
    },
  }))

  try {
    await insertAccounts(supabase, archiveData.account)
    await insertArchiveUpload(supabase, [
      {
        account_id: archiveData.account[0].account.accountId,
        archive_at: latestTweetDate,
      },
    ])
    await insertProfiles(supabase, profilesWithAccountId)
    await insertTweets(supabase, tweets)

    const accountId = archiveData.account[0].account.accountId
    await removeExistingFollowers(supabase, accountId)
    await removeExistingFollowings(supabase, accountId)
    await insertFollowers(supabase, archiveData.follower, accountId)
    await insertFollowings(supabase, archiveData.following, accountId)

    console.log('Twitter archive processing complete')
  } catch (error) {
    console.error('Error processing Twitter archive:', error)
    throw error
  }
}
