import {
  getSchemaName,
  getTableName,
  TableName,
} from '@/lib-client/getTableName'
import { SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { insert } from 'fp-ts/lib/ReadonlySet'
import path from 'path'

// Load environment variables from .env file in the scratchpad directory
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })
}

const BATCH_SIZE = 1000

const createArchiveUpload = async (
  supabase: SupabaseClient,
  accountId: string,
  latestTweetDate: string,
): Promise<string> => {
  const { data, error } = await supabase
    .schema(getSchemaName())
    .from(getTableName('archive_upload'))
    .upsert(
      { account_id: accountId, archive_at: latestTweetDate },
      { onConflict: 'account_id,archive_at', ignoreDuplicates: false },
    )
    .select('id')
    .single()

  if (error) throw new Error(`Error upserting archive upload: ${error.message}`)
  return data.id
}

// Generic upsert function
const upsertData = async <T>(
  supabase: SupabaseClient,
  tableName: TableName,
  data: T[],
  conflictTarget: string,
  ignoreDuplicates: boolean = false,
): Promise<void> => {
  const errors: Error[] = []

  const processBatch = async (batch: T[]) => {
    const { error } = await supabase
      .schema(getSchemaName())
      .from(getTableName(tableName))
      .upsert(batch, { onConflict: conflictTarget, ignoreDuplicates })

    if (error) {
      const newError = new Error(
        `Error upserting ${tableName}: ${error.message}`,
      )
      errors.push(newError)
    } else console.log(`${batch.length} ${tableName} upserted successfully`)
  }

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    await processBatch(data.slice(i, i + BATCH_SIZE))
  }

  if (errors.length > 0)
    throw new AggregateError(
      errors,
      `Error(s) occurred while upserting ${tableName}. First error: ${errors[0].message}`,
    )
}

// Refactored insert functions
export const insertArchiveUpload = (
  supabase: SupabaseClient,
  archiveUploads: { account_id: string; archive_at: string }[],
) =>
  upsertData(
    supabase,
    'archive_upload',
    archiveUploads,
    'account_id,archive_at',
  )

export const insertAccounts = (supabase: SupabaseClient, accountsData: any[]) =>
  upsertData(
    supabase,
    'account',
    accountsData.map(({ account }) => ({
      created_via: account.createdVia,
      username: account.username,
      account_id: account.accountId,
      created_at: account.createdAt,
      account_display_name: account.accountDisplayName,
    })),
    'account_id',
  )

export const insertProfiles = (
  supabase: SupabaseClient,
  profilesData: any[],
  archiveUploadId: string,
) =>
  upsertData(
    supabase,
    'profile',
    profilesData.map(({ profile }) => ({
      bio: profile.description.bio,
      website: profile.description.website,
      location: profile.description.location,
      avatar_media_url: profile.avatarMediaUrl,
      header_media_url: profile.headerMediaUrl,
      account_id: profile.account_id,
      archive_upload_id: archiveUploadId,
    })),
    'account_id',
  )

export const insertTweetEntitiesBatch = async (
  supabase: SupabaseClient,
  tweets: any[],
  archiveUploadId: string,
) => {
  const mentionedUsers = new Map<string, any>()
  const userMentions: any[] = []
  const tweetUrls: any[] = []

  tweets.forEach((tweet) => {
    // Process user mentions
    tweet.entities.user_mentions.forEach((u: any, index: number) => {
      mentionedUsers.set(u.id_str, {
        user_id: u.id_str,
        name: u.name,
        screen_name: u.screen_name,
        updated_at: tweet.created_at,
      })

      userMentions.push({
        mentioned_user_id: u.id_str,
        tweet_id: tweet.id_str,
      })
    })

    // Process URLs
    tweet.entities.urls.forEach((url: any) => {
      tweetUrls.push({
        url: url.url,
        expanded_url: url.expanded_url,
        display_url: url.display_url,
        tweet_id: tweet.id_str,
      })
    })
  })

  console.log('inserting entities', { tweetUrls, mentionedUsers, userMentions })

  // Insert mentioned users
  await upsertData(
    supabase,
    'mentioned_users',
    Array.from(mentionedUsers.values()),
    'user_id',
  )

  // Insert user mentions
  await upsertData(
    supabase,
    'user_mentions',
    userMentions,
    'mentioned_user_id,tweet_id',
    true,
  )

  // Insert tweet URLs
  await upsertData(supabase, 'tweet_urls', tweetUrls, 'tweet_id,url')
}

export const insertTweetMediaBatch = async (
  supabase: SupabaseClient,
  tweets: any[],
  archiveUploadId: string,
) => {
  const allMedia = tweets.flatMap(
    (tweet) =>
      tweet.extended_entities?.media?.map((media: any) => ({
        media_id: media.id_str,
        tweet_id: tweet.id_str,
        media_url: media.media_url_https,
        media_type: media.type,
        width: media.sizes.large.w,
        height: media.sizes.large.h,
        archive_upload_id: archiveUploadId,
      })) ?? [],
  )

  const uniqueMedia = Array.from(
    new Map(allMedia.map((item) => [item.media_id, item])).values(),
  )

  await upsertData(supabase, 'tweet_media', uniqueMedia, 'media_id', true)
}

export const insertFollowers = (
  supabase: SupabaseClient,
  followersData: any[],
  accountId: string,
  archiveUploadId: string,
) =>
  upsertData(
    supabase,
    'followers',
    followersData.map(({ follower }) => ({
      account_id: accountId,
      follower_account_id: follower.accountId,
      archive_upload_id: archiveUploadId,
    })),
    'account_id,follower_account_id',
    true,
  )

export const insertFollowings = (
  supabase: SupabaseClient,
  followingsData: any[],
  accountId: string,
  archiveUploadId: string,
) =>
  upsertData(
    supabase,
    'following',
    followingsData.map(({ following }) => ({
      account_id: accountId,
      following_account_id: following.accountId,
      archive_upload_id: archiveUploadId,
    })),
    'account_id,following_account_id',
    true,
  )
export const insertLikes = async (
  supabase: SupabaseClient,
  likesData: any[],
  accountId: string,
  archiveUploadId: string,
) => {
  // First, insert liked tweets
  const likedTweets = likesData.map(({ like }) => ({
    tweet_id: like.tweetId,
    full_text: like.fullText,
  }))

  await upsertData(supabase, 'liked_tweets', likedTweets, 'tweet_id', true)

  // Then, insert likes
  const likes = likesData.map(({ like }) => ({
    account_id: accountId,
    liked_tweet_id: like.tweetId,
    archive_upload_id: archiveUploadId,
  }))

  await upsertData(supabase, 'likes', likes, 'account_id,liked_tweet_id', true)
}

export const insertTweets = async (
  supabase: SupabaseClient,
  tweetsData: any[],
  archiveUploadId: string,
): Promise<void> => {
  const formatTweet = (tweetData: any) => ({
    tweet_id: tweetData.tweet.id_str,
    account_id: tweetData.tweet.user_id_str,
    created_at: tweetData.tweet.created_at,
    full_text: tweetData.tweet.full_text,
    retweet_count: tweetData.tweet.retweet_count,
    favorite_count: tweetData.tweet.favorite_count,
    reply_to_tweet_id: tweetData.tweet.in_reply_to_status_id_str,
    reply_to_user_id: tweetData.tweet.in_reply_to_user_id_str,
    reply_to_username: tweetData.tweet.in_reply_to_screen_name,
    archive_upload_id: archiveUploadId,
  })

  const upsertTweets = async (batch: any[]) => {
    const formattedTweets = batch.map(formatTweet)
    const { data, error } = await supabase
      .schema(getSchemaName())
      .from(getTableName('tweets'))
      .upsert(formattedTweets, {
        onConflict: 'tweet_id',
        ignoreDuplicates: false,
      })
      .select()

    if (error) throw new Error(`Error upserting tweets: ${error.message}`)
    console.log(`${formattedTweets.length} tweets upserted successfully`, {
      data,
    })
    return data?.map((tweet) => tweet.tweet_id) ?? []
  }

  const processSuccessfulTweets = async (
    batch: any[],
    successfulIds: string[],
  ) => {
    const idStrs = successfulIds.map((id) => `${id}`)
    const successfulTweets = batch.filter((td) =>
      idStrs.includes(td.tweet.id_str),
    )
    console.log('successful tweets', {
      batch,
      successfulTweets,
      successfulIds,
      idStrs,
      batchIdStrs: batch.map((tweet) => tweet.tweet.id_str),
    })
    if (successfulTweets.length > 0) {
      await Promise.all([
        insertTweetEntitiesBatch(
          supabase,
          successfulTweets.map((td) => td.tweet),
          archiveUploadId,
        ),
        insertTweetMediaBatch(
          supabase,
          successfulTweets.map((td) => td.tweet),
          archiveUploadId,
        ),
      ])
    }
  }

  const processBatch = async (batch: any[]) => {
    const successfulIds = await upsertTweets(batch)
    await processSuccessfulTweets(batch, successfulIds)
  }

  const errors = await tweetsData.reduce(
    async (errorsPromise, _, index) => {
      const errors = await errorsPromise
      if (index % BATCH_SIZE === 0) {
        const batch = tweetsData.slice(index, index + BATCH_SIZE)
        try {
          await processBatch(batch)
        } catch (error) {
          errors.push(error as Error)
        }
      }
      return errors
    },
    Promise.resolve([] as Error[]),
  )

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Error(s) occurred while upserting tweets. First error: ${errors[0].message}`,
    )
  }
}

const removePastFollowers = async (
  supabase: SupabaseClient,
  accountId: string,
  archiveUploadId: string,
) => {
  const { error } = await supabase
    .schema(getSchemaName())
    .from(getTableName('followers'))
    .delete()
    .eq('account_id', accountId)
    .neq('archive_upload_id', archiveUploadId)

  if (error)
    throw new Error(`Error removing existing followers: ${error.message}`)
  else
    console.log(
      `Existing followers removed for account ${accountId} except for archive upload ${archiveUploadId}`,
    )
}

const removePastFollowings = async (
  supabase: SupabaseClient,
  accountId: string,
  archiveUploadId: string,
) => {
  const { error } = await supabase
    .schema(getSchemaName())
    .from(getTableName('following'))
    .delete()
    .eq('account_id', accountId)
    .neq('archive_upload_id', archiveUploadId)

  if (error)
    throw new Error(`Error removing existing followings: ${error.message}`)
  else
    console.log(
      `Existing followings removed for account ${accountId} except for archive upload ${archiveUploadId}`,
    )
}
// Helper functions
const prepareTweets = (tweets: any[], accountId: string) =>
  tweets.map((tweet) => ({
    ...tweet,
    tweet: {
      ...tweet.tweet,
      user_id: accountId,
      user_id_str: accountId,
    },
  }))

const getLatestTweetDate = (tweets: any[]): string =>
  tweets
    .map((tweet) => new Date(tweet.tweet.created_at))
    .reduce(
      (latest, current) => (current > latest ? current : latest),
      new Date(0),
    )
    .toISOString()

const prepareProfiles = (profiles: any[], accountId: string) =>
  profiles.map((profile) => ({
    ...profile,
    profile: {
      ...profile.profile,
      account_id: accountId,
    },
  }))

// Main function to process all data
export const processTwitterArchive = async (
  supabase: SupabaseClient,
  archiveData: any,
): Promise<void> => {
  console.log('Processing Twitter Archive', { archiveData })

  const accountId = archiveData.account[0].account.accountId
  const tweets = prepareTweets(
    [...archiveData.tweets, ...archiveData['community-tweet']],
    accountId,
  )
  const latestTweetDate = getLatestTweetDate(tweets)
  let archiveUploadId: string | null = null
  const insertedData: { [key: string]: any[] } = {}

  const rollback = async () => {
    console.log('Rolling back...', { insertedData })

    if (archiveUploadId) {
      for (const tableName of Object.keys(insertedData) as TableName[]) {
        await supabase
          .schema(getSchemaName())
          .from(getTableName(tableName))
          .delete()
          .eq('archive_upload_id', archiveUploadId)
      }
      await supabase
        .schema(getSchemaName())
        .from(getTableName('archive_upload'))
        .delete()
        .eq('id', archiveUploadId)
    }
  }

  try {
    // Upsert account first
    await insertAccounts(supabase, archiveData.account)
    insertedData['account'] = archiveData.account
    console.log('Account upserted successfully', { insertedData })

    // Create archive upload entry
    archiveUploadId = await createArchiveUpload(
      supabase,
      accountId,
      latestTweetDate,
    )
    console.log('Archive upload created successfully', { archiveUploadId })

    // Process remaining data
    const profilesWithAccountId = prepareProfiles(
      archiveData.profile,
      accountId,
    )

    await insertProfiles(supabase, profilesWithAccountId, archiveUploadId)
    insertedData['profile'] = profilesWithAccountId

    console.log('Profiles upserted successfully', { insertedData })

    await insertTweets(supabase, tweets, archiveUploadId)
    insertedData['tweets'] = tweets

    await insertFollowers(
      supabase,
      archiveData.follower,
      accountId,
      archiveUploadId,
    )
    insertedData['followers'] = archiveData.follower

    await insertFollowings(
      supabase,
      archiveData.following,
      accountId,
      archiveUploadId,
    )
    insertedData['following'] = archiveData.following

    console.log('Inserting likes:', {
      likesCount: archiveData.like.length,
      accountId,
      archiveUploadId,
      sampleLike: archiveData.like[0],
    })
    await insertLikes(supabase, archiveData.like, accountId, archiveUploadId)
    insertedData['likes'] = archiveData.like

    await removePastFollowers(supabase, accountId, archiveUploadId)
    await removePastFollowings(supabase, accountId, archiveUploadId)
    console.log('Twitter archive processing complete')
  } catch (error) {
    console.error('Error processing Twitter archive:', error)
    // await rollback()
    throw error
  }
}
export const deleteArchive = async (
  supabase: SupabaseClient,
  accountId: string,
): Promise<void> => {
  try {
    const { error } = await supabase
      .schema(getSchemaName())
      .rpc('delete_all_archives', {
        p_account_id: accountId,
      })

    if (error) throw error

    console.log(`All archives for account ${accountId} deleted successfully`)
  } catch (error: any) {
    throw new Error(
      `Error deleting archives of account ${accountId}: ${error.message}`,
    )
  }
}
