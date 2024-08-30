import {
  getSchemaName,
  getTableName,
  TableName,
} from '@/lib-client/getTableName'
import { SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env file in the scratchpad directory
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })
}

const BATCH_SIZE = 1000 // Adjust as needed

const patchTweetsWithNoteTweets = (noteTweets: any[], tweets: any[]): any[] => {
  const startTime = performance.now()
  let changedTweets: any[] = []
  // console.log('noteTweets', { noteTweets })

  const patchedTweets = tweets.map((tweetObj) => {
    const tweet = tweetObj.tweet
    const matchingNoteTweet = noteTweets.find((noteTweetObj) => {
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
      // changedTweets.push(tweetObj)
      return {
        ...tweetObj,
        tweet: {
          ...tweet,
          full_text: matchingNoteTweet.noteTweet.core.text,
        },
      }
    }

    return tweetObj
  })

  const endTime = performance.now()
  console.log(`Patching tweets with note tweets took ${endTime - startTime} ms`)

  // console.log('Changed tweets:', changedTweets)

  return patchedTweets
}

const insertTempTweets = async (
  supabase: SupabaseClient,
  tweets: any[],
  suffix: string,
) => {
  const formattedTweets = tweets.map((tweet) => ({
    tweet_id: tweet.id_str,
    account_id: tweet.user_id,
    created_at: tweet.created_at,
    full_text: tweet.full_text,
    retweet_count: tweet.retweet_count,
    favorite_count: tweet.favorite_count,
    reply_to_tweet_id: tweet.in_reply_to_status_id_str,
    reply_to_user_id: tweet.in_reply_to_user_id_str,
    reply_to_username: tweet.in_reply_to_screen_name,
    archive_upload_id: -1, // Placeholder value
  }))

  const { error } = await supabase
    .schema('temp')
    .from(`tweets_${suffix}`)
    .upsert(formattedTweets, {
      onConflict: 'tweet_id',
      ignoreDuplicates: false,
    })

  if (error)
    throw new Error(
      `Error inserting tweets: ${error.message} ${formattedTweets}`,
    )
}

const processAndInsertTweetEntities = async (
  supabase: SupabaseClient,
  tweets: any[],
  suffix: string,
) => {
  const mentionedUsers = Object.values(
    tweets
      .flatMap((tweet) =>
        tweet.entities.user_mentions.reduce((acc: any, user: any) => {
          acc[user.id_str] = {
            user_id: user.id_str,
            name: user.name,
            screen_name: user.screen_name,
            updated_at: new Date().toISOString(),
          }
          return acc
        }, {}),
      )
      .reduce((acc: any, curr: any) => {
        Object.assign(acc, curr)
        return acc
      }, {}),
  )

  const userMentions = tweets.flatMap((tweet) =>
    tweet.entities.user_mentions.map((user: any) => ({
      mentioned_user_id: user.id_str,
      tweet_id: tweet.id_str,
    })),
  )

  const tweetMedia = tweets.flatMap((tweet) =>
    (tweet.entities.media || []).map((media: any) => ({
      media_id: media.id_str,
      tweet_id: tweet.id_str,
      media_url: media.media_url_https,
      media_type: media.type,
      width: media.sizes.large.w,
      height: media.sizes.large.h,
      archive_upload_id: -1, // Placeholder value
    })),
  )

  const tweetUrls = tweets.flatMap((tweet) =>
    tweet.entities.urls.map((url: any) => ({
      url: url.url,
      expanded_url: url.expanded_url,
      display_url: url.display_url,
      tweet_id: tweet.id_str,
    })),
  )

  const tables = [
    {
      name: `mentioned_users_${suffix}`,
      data: mentionedUsers,
      conflictTarget: 'user_id',
    },
    {
      name: `user_mentions_${suffix}`,
      data: userMentions,
      conflictTarget: 'mentioned_user_id, tweet_id',
    },
    {
      name: `tweet_media_${suffix}`,
      data: tweetMedia,
      conflictTarget: 'media_id',
    },
    {
      name: `tweet_urls_${suffix}`,
      data: tweetUrls,
      conflictTarget: 'url, tweet_id',
    },
  ]

  for (const table of tables) {
    for (let i = 0; i < table.data.length; i += 1000) {
      const batch = table.data.slice(i, i + 1000)
      const { error } = await supabase
        .schema('temp')
        .from(table.name)
        .upsert(batch, {
          onConflict: table.conflictTarget,
          ignoreDuplicates: true,
        })
      if (error) {
        throw new Error(`Error inserting ${table.name}: ${error.message}`)
      }
    }
  }
}

const insertTempFollowers = async (
  supabase: SupabaseClient,
  followers: any[],
  accountId: string,
  suffix: string,
) => {
  const formattedFollowers = followers.map((follower) => ({
    account_id: accountId,
    follower_account_id: follower.follower.accountId,
    archive_upload_id: -1, // Placeholder value
  }))

  const { error } = await supabase
    .schema('temp')
    .from(`followers_${suffix}`)
    .upsert(formattedFollowers, {
      onConflict: 'account_id,follower_account_id',
      ignoreDuplicates: false,
    })

  if (error) throw new Error(`Error inserting followers: ${error.message}`)
}

const insertTempFollowing = async (
  supabase: SupabaseClient,
  following: any[],
  accountId: string,
  suffix: string,
) => {
  const formattedFollowing = following.map((follow) => ({
    account_id: accountId,
    following_account_id: follow.following.accountId,
    archive_upload_id: -1, // Placeholder value
  }))

  const { error } = await supabase
    .schema('temp')
    .from(`following_${suffix}`)
    .upsert(formattedFollowing, {
      onConflict: 'account_id,following_account_id',
      ignoreDuplicates: false,
    })

  if (error) throw new Error(`Error inserting following: ${error.message}`)
}

const insertTempLikes = async (
  supabase: SupabaseClient,
  likes: any[],
  accountId: string,
  suffix: string,
) => {
  const likedTweets = likes.map((like) => ({
    tweet_id: like.like.tweetId,
    full_text: like.like.fullText,
  }))

  // Ensure all likes have non-null full_text
  const invalidLikedTweets = likedTweets.filter((like) => !like.full_text)

  const validLikedTweets = likedTweets.map((like) => ({
    ...like,
    full_text: like.full_text || '',
  }))

  const { error: likedTweetsError } = await supabase
    .schema('temp')
    .from(`liked_tweets_${suffix}`)
    .upsert(validLikedTweets, {
      onConflict: 'tweet_id',
      ignoreDuplicates: false,
    })

  if (likedTweetsError) {
    console.error('Error details:', likedTweetsError)
    throw new Error(`Error inserting liked tweets: ${likedTweetsError.message}`)
  }

  const likeRelations = likes.map((like) => ({
    account_id: accountId,
    liked_tweet_id: like.like.tweetId,
    archive_upload_id: -1, // Placeholder value
  }))

  const { error: likesError } = await supabase
    .schema('temp')
    .from(`likes_${suffix}`)
    .upsert(likeRelations, {
      onConflict: 'account_id,liked_tweet_id',
      ignoreDuplicates: false,
    })

  if (likesError)
    throw new Error(`Error inserting likes: ${likesError.message}`)
}

export const processTwitterArchive = async (
  supabase: SupabaseClient,
  archiveData: any,
  progressCallback: (progress: { phase: string; percent: number }) => void,
): Promise<void> => {
  const startTime = Date.now()
  console.log('Processing Twitter Archive', { archiveData })

  const accountId = archiveData.account[0].account.accountId
  const suffix = accountId

  console.log('Dropping temporary tables...')
  await supabase
    .schema(getSchemaName())
    .rpc('drop_temp_tables', { p_suffix: suffix })

  try {
    // Calculate latest tweet date
    const latestTweetDate = archiveData.tweets.reduce(
      (latest: string, tweet: any) => {
        const tweetDate = new Date(tweet.tweet.created_at)
        return latest
          ? tweetDate > new Date(latest)
            ? tweetDate.toISOString()
            : latest
          : tweetDate.toISOString()
      },
      '',
    )

    console.log(`Latest tweet date: ${latestTweetDate}`)

    // Create temporary tables
    console.log('Creating temporary tables...')
    await supabase
      .schema(getSchemaName())
      .rpc('create_temp_tables', { p_suffix: suffix })

    console.log('Inserting account data...')
    const { error: accountError } = await supabase
      .schema(getSchemaName())
      .rpc('insert_temp_account', {
        p_account: archiveData.account[0].account,
        p_suffix: suffix,
      })
    if (accountError)
      throw new Error(`Error inserting account data: ${accountError.message}`)

    console.log('Inserting archive upload data...')
    const { data: archiveUploadId, error: archiveUploadError } = await supabase
      .schema(getSchemaName())
      .rpc('insert_temp_archive_upload', {
        p_account_id: accountId,
        p_archive_at: latestTweetDate,
        p_suffix: suffix,
      })
    if (archiveUploadError)
      throw new Error(
        `Error inserting archive upload data: ${archiveUploadError.message}`,
      )

    console.log('Inserting profile data...')
    const { error: profileError } = await supabase
      .schema(getSchemaName())
      .rpc('insert_temp_profiles', {
        p_profile: archiveData.profile[0].profile,
        p_account_id: accountId,
        p_suffix: suffix,
      })
    if (profileError)
      throw new Error(`Error inserting profile data: ${profileError.message}`)

    // Patch tweets with note tweets
    console.log('Patching tweets with note tweets...')
    const patchedTweets = patchTweetsWithNoteTweets(
      archiveData['note-tweet'] || [],
      archiveData.tweets,
    )
    console.log('patchedTweets', { patchedTweets })
    // Process likes
    console.log('Processing likes...')
    const likesStartTime = Date.now()
    const totalLikes = archiveData.like.length
    for (let i = 0; i < totalLikes; i += BATCH_SIZE) {
      const likesBatch = archiveData.like.slice(i, i + BATCH_SIZE)
      console.log(`Processing likes batch ${i / BATCH_SIZE + 1}...`)
      await insertTempLikes(supabase, likesBatch, accountId, suffix)
      progressCallback({
        phase: 'Likes',
        percent: Math.min(100, ((i + BATCH_SIZE) / totalLikes) * 100),
      })
    }
    const likesEndTime = Date.now()
    console.log(`Likes processing time: ${likesEndTime - likesStartTime}ms`)

    // Process tweets
    console.log('Processing tweets...')
    const tweetsStartTime = Date.now()
    const totalTweets = patchedTweets.length
    for (let i = 0; i < totalTweets; i += BATCH_SIZE) {
      const tweetsBatch = patchedTweets.slice(i, i + BATCH_SIZE)
      console.log(`Processing tweets batch ${i / BATCH_SIZE + 1}...`)
      await insertTempTweets(
        supabase,
        tweetsBatch.map((t: any) => ({ ...t.tweet, user_id: accountId })),
        suffix,
      )
      await processAndInsertTweetEntities(
        supabase,
        tweetsBatch.map((t: any) => t.tweet),
        suffix,
      )
      progressCallback({
        phase: 'Tweets',
        percent: Math.min(100, ((i + BATCH_SIZE) / totalTweets) * 100),
      })
    }
    const tweetsEndTime = Date.now()
    console.log(`Tweets processing time: ${tweetsEndTime - tweetsStartTime}ms`)

    // Process followers
    console.log('Processing followers...')
    const followsStartTime = Date.now()
    const totalFollowers = archiveData.follower.length
    for (let i = 0; i < totalFollowers; i += BATCH_SIZE) {
      const followersBatch = archiveData.follower.slice(i, i + BATCH_SIZE)
      console.log(`Processing followers batch ${i / BATCH_SIZE + 1}...`)
      await insertTempFollowers(supabase, followersBatch, accountId, suffix)
      progressCallback({
        phase: 'Followers',
        percent: Math.min(100, ((i + BATCH_SIZE) / totalFollowers) * 100),
      })
    }

    // Process following
    console.log('Processing following...')
    const totalFollowing = archiveData.following.length
    for (let i = 0; i < totalFollowing; i += BATCH_SIZE) {
      const followingBatch = archiveData.following.slice(i, i + BATCH_SIZE)
      console.log(`Processing following batch ${i / BATCH_SIZE + 1}...`)
      await insertTempFollowing(supabase, followingBatch, accountId, suffix)
      progressCallback({
        phase: 'Following',
        percent: Math.min(100, ((i + BATCH_SIZE) / totalFollowing) * 100),
      })
    }
    const followsEndTime = Date.now()
    console.log(
      `Follows processing time: ${followsEndTime - followsStartTime}ms`,
    )

    // Commit all data
    console.log('Committing all data...')
    progressCallback({
      phase: 'Finishing up...',
      percent: 50,
    })
    const commitStartTime = Date.now()
    const { error: commitError } = await supabase
      .schema(getSchemaName())
      .rpc('commit_temp_data', {
        p_suffix: suffix,
      })
    const commitEndTime = Date.now()
    console.log(`Commit processing time: ${commitEndTime - commitStartTime}ms`)
    if (commitError)
      throw new Error(`Error committing data: ${commitError.message}`)

    console.log('Twitter archive processing completed successfully.')
    progressCallback({
      phase: 'Archive Uploaded',
      percent: 100,
    })
    const endTime = Date.now()
    console.log(`Total processing time: ${endTime - startTime}ms`)
  } catch (error: any) {
    console.error('Error processing Twitter archive:', error)

    // Attempt to drop temporary tables
    try {
      console.log('Attempting to drop temporary tables...')
      await supabase
        .schema(getSchemaName())
        .rpc('drop_temp_tables', { p_suffix: suffix })
      console.log('Temporary tables dropped successfully.')
    } catch (dropError: any) {
      console.error('Error dropping temporary tables:', dropError)
    }

    // Throw a new error with more context
    throw new Error(`Error processing Twitter archive: ${error.message}`)
  }
}

// not used, bc slightly slower, but a code example
export const processTwitterArchivePgFns = async (
  supabase: SupabaseClient,
  archiveData: any,
): Promise<void> => {
  const startTime = Date.now()
  console.log('Processing Twitter Archive', { archiveData })

  const accountId = archiveData.account[0].account.accountId
  const suffix = accountId

  try {
    // Calculate latest tweet date
    const latestTweetDate = archiveData.tweets.reduce(
      (latest: string, tweet: any) => {
        const tweetDate = new Date(tweet.tweet.created_at)
        return latest
          ? tweetDate > new Date(latest)
            ? tweetDate.toISOString()
            : latest
          : tweetDate.toISOString()
      },
      '',
    )

    console.log(`Latest tweet date: ${latestTweetDate}`)

    // Create temporary tables
    console.log('Creating temporary tables...')
    await supabase
      .schema(getSchemaName())
      .rpc('create_temp_tables', { p_suffix: suffix })

    console.log('Inserting account data...')
    const { error: accountError } = await supabase
      .schema(getSchemaName())
      .rpc('insert_temp_account', {
        p_account: archiveData.account[0].account,
        p_suffix: suffix,
      })
    if (accountError)
      throw new Error(`Error inserting account data: ${accountError.message}`)

    console.log('Inserting profile data...')
    const { error: profileError } = await supabase
      .schema(getSchemaName())
      .rpc('insert_temp_profiles', {
        p_profile: archiveData.profile[0].profile,
        p_account_id: accountId,
        p_suffix: suffix,
      })
    if (profileError)
      throw new Error(`Error inserting profile data: ${profileError.message}`)

    // Batch process tweets
    console.log('Processing tweets...')

    const tweetsStartTime = Date.now()
    for (let i = 0; i < archiveData.tweets.length; i += BATCH_SIZE) {
      const tweetsBatch = archiveData.tweets.slice(i, i + BATCH_SIZE)
      console.log(`Processing tweets batch ${i / BATCH_SIZE + 1}...`, {
        tweetsBatch,
        suffix,
      })
      const { error: tweetsError } = await supabase
        .schema(getSchemaName())
        .rpc('insert_temp_tweets', {
          p_tweets: tweetsBatch.map((tweet: any) => {
            return { ...tweet.tweet, user_id: accountId }
          }),
          p_suffix: suffix,
        })
      if (tweetsError)
        throw new Error(`Error inserting tweets: ${tweetsError.message}`)

      const { error: entitiesError } = await supabase
        .schema(getSchemaName())
        .rpc('process_and_insert_tweet_entities', {
          p_tweets: tweetsBatch,
          p_suffix: suffix,
        })
      if (entitiesError)
        throw new Error(
          `Error processing tweet entities: ${entitiesError.message}`,
        )
    }
    const tweetsEndTime = Date.now()
    console.log(`Tweets processing time: ${tweetsEndTime - tweetsStartTime}ms`)

    // Batch process followers and following
    console.log('Processing followers...')
    const followsStartTime = Date.now()
    for (let i = 0; i < archiveData.follower.length; i += BATCH_SIZE) {
      const followersBatch = archiveData.follower.slice(i, i + BATCH_SIZE)
      console.log(`Processing followers batch ${i / BATCH_SIZE + 1}...`)
      const { error: followersError } = await supabase
        .schema(getSchemaName())
        .rpc('insert_temp_followers', {
          p_followers: followersBatch,
          p_account_id: accountId,
          p_suffix: suffix,
        })
      if (followersError)
        throw new Error(`Error inserting followers: ${followersError.message}`)
    }
    const followsEndTime = Date.now()
    console.log(
      `Follows processing time: ${followsEndTime - followsStartTime}ms`,
    )

    console.log('Processing following...')
    for (let i = 0; i < archiveData.following.length; i += BATCH_SIZE) {
      const followingBatch = archiveData.following.slice(i, i + BATCH_SIZE)
      console.log(`Processing following batch ${i / BATCH_SIZE + 1}...`)
      const { error: followingError } = await supabase
        .schema(getSchemaName())
        .rpc('insert_temp_following', {
          p_following: followingBatch,
          p_account_id: accountId,
          p_suffix: suffix,
        })
      if (followingError)
        throw new Error(`Error inserting following: ${followingError.message}`)
    }

    // Batch process likes
    console.log('Processing likes...')
    const likesStartTime = Date.now()
    for (let i = 0; i < archiveData.like.length; i += BATCH_SIZE) {
      const likesBatch = archiveData.like.slice(i, i + BATCH_SIZE)
      console.log(`Processing likes batch ${i / BATCH_SIZE + 1}...`)
      const { error: likesError } = await supabase
        .schema(getSchemaName())
        .rpc('insert_temp_likes', {
          p_likes: likesBatch,
          p_account_id: accountId,
          p_suffix: suffix,
        })
      if (likesError)
        throw new Error(`Error inserting likes: ${likesError.message}`)
    }
    const likesEndTime = Date.now()
    console.log(`Likes processing time: ${likesEndTime - likesStartTime}ms`)

    // Commit all data
    console.log('Committing all data...')
    const commitStartTime = Date.now()
    const { error: commitError } = await supabase
      .schema(getSchemaName())
      .rpc('commit_temp_data', {
        p_suffix: suffix,
      })
    const commitEndTime = Date.now()
    console.log(`Commit processing time: ${commitEndTime - commitStartTime}ms`)
    if (commitError)
      throw new Error(`Error committing data: ${commitError.message}`)

    console.log('Twitter archive processing completed successfully.')
    const endTime = Date.now()
    console.log(`Total processing time: ${endTime - startTime}ms`)
  } catch (error: any) {
    console.error('Error processing Twitter archive:', error)

    // Attempt to drop temporary tables
    try {
      console.log('Attempting to drop temporary tables...')
      await supabase
        .schema(getSchemaName())
        .rpc('drop_temp_tables', { p_suffix: suffix })
      console.log('Temporary tables dropped successfully.')
    } catch (dropError: any) {
      console.error('Error dropping temporary tables:', dropError)
    }

    // Throw a new error with more context
    throw new Error(`Error processing Twitter archive: ${error.message}`)
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
