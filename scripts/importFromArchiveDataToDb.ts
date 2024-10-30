import { parse } from 'csv-parse'

import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env' })
import { createReadStream } from 'fs'
import { finished } from 'stream/promises'
import path from 'path'
import {
  InsertAccount,
  InsertArchiveUpload,
  InsertFollowers,
  InsertFollowing,
  InsertLikedTweets,
  InsertLikes,
  InsertMentionedUsers,
  // InsertNotebookLMPodcasts,
  InsertProfile,
  InsertTweetMedia,
  InsertTweets,
  InsertTweetURLs,
  InsertUserMentions,
  //InsertUserFollowing, InsertUserMention, InsertUserTweetLikes, InsertUsers
} from '../src/database-explicit-types'

import {
  createDbScriptClient,
  createServerAdminClient,
} from '../src/utils/supabase'
import { Database } from '../src/database-types'

const GLOBAL_ARCHIVE_PATH = process.env.ARCHIVE_PATH!
type Tables = Database['public']['Tables']
type TableNames = keyof Tables
type ColumnsFor<T extends TableNames> = keyof Tables[T]['Row']

enum FilesToProcess {
  Account = 'account',
  Profile = 'profile',
  UserMentions = 'user_mentions',
  Followers = 'followers',
  Following = 'following',
  Tweets = 'tweets',
  TweetUrls = 'tweet_urls',
  TweetMedia = 'tweet_media',
  Likes = 'likes',
  LikedTweets = 'liked_tweets',
  MentionedUsers = 'mentioned_users',
  ArchiveUpload = 'archive_upload',
}

function ifStringNullReturnNull(value: string | null): string | null {
  return value === 'NULL' || !value ? null : value
}

;(async function execute() {
  var supabase = await createDbScriptClient()

  async function Upsert_Skeleton<T extends TableNames>(
    items: any[],
    table: T,
    getItem: (item: any) => any,
    batchSize: number = 50,
    idColumn: ColumnsFor<T>[],
  ) {
    let cont = 0
    console.log(
      'Upsert_skeleton for ',
      table,
      items.length,
      'with batch size',
      batchSize,
    )

    const totalBatches = Math.ceil(items.length / batchSize)

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize
      const end = Math.min((i + 1) * batchSize, items.length)
      const batch = items.slice(start, end).map(getItem)

      let query = supabase.from(table)
      let options = { ignoreDuplicates: true }
      if (idColumn.length > 0) {
        options = {
          ignoreDuplicates: true,
          onConflict: idColumn.join(','),
        } as any
      }

      const { data, error } = await query.upsert(batch, options).select()

      if (error) {
        console.error(
          `Error inserting batch into ${table}:`,
          JSON.stringify(error),
        )
        console.error(
          `Error inserting batch into ${table}:`,
          JSON.stringify(data),
        )
      } else if (data.length > 0) {
        cont += data.length
        console.log('processed batch', table, i, data.length)
      }
    }
    if (cont != items.length)
      console.log(`WARNING: ${table} not inserted ${items.length - cont} items`)
    else console.log(`${table} inserted correctly ${cont}`)
    return cont
  }

  async function Upsert_Account() {
    const account = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.Account,
    )

    let getItem = (item: any) => {
      const {
        account_id,
        created_via,
        username,
        created_at,
        account_display_name,
      } = item
      const newAccount: InsertAccount = {
        account_id: account_id,
        username,
        account_display_name,
        created_at,
        created_via,
      }
      return newAccount
    }

    await Upsert_Skeleton(account, 'account', getItem, 1, ['account_id'])
  }

  async function Upsert_Tweet_Media() {
    const tweetMedia = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.TweetMedia,
    )

    let getItem = (item: any) => {
      const {
        media_id,
        tweet_id,
        media_url,
        media_type,
        width,
        height,
        archive_upload_id,
      } = item
      const newItem: InsertTweetMedia = {
        media_id,
        media_type,
        media_url,
        tweet_id,
        width,
        height,
        archive_upload_id,
      }
      return newItem
    }
    await Upsert_Skeleton(tweetMedia, 'tweet_media', getItem, 50, ['media_id'])
  }
  async function Upsert_Liked_Tweets() {
    const liked_tweets = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.LikedTweets,
    )
    let getItem = (item: any) => {
      const { tweet_id, full_text } = item
      const newItem: InsertLikedTweets = {
        tweet_id,
        full_text,
      }
      return newItem
    }
    await Upsert_Skeleton(liked_tweets, 'liked_tweets', getItem, 250, [
      'tweet_id',
    ])
  }
  async function Upsert_Profile() {
    const profile = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.Profile,
    )
    let getItem = (item: any) => {
      const {
        account_id,
        bio,
        website,
        location,
        avatar_media_url,
        header_media_url,
        archive_upload_id,
      } = item
      const newItem: InsertProfile = {
        account_id,
        bio,
        website,
        location,
        avatar_media_url,
        header_media_url: ifStringNullReturnNull(header_media_url),
        archive_upload_id,
      }
      return newItem
    }
    await Upsert_Skeleton(profile, 'profile', getItem, 1, [])
  }
  async function Upsert_User_Mentions() {
    const usersmentioned = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.MentionedUsers,
    )
    let getItemMentionedUser = (item: any) => {
      const { user_id, name, screen_name, updated_at } = item
      const newItem: InsertMentionedUsers = {
        user_id,
        name,
        screen_name,
        updated_at,
      }
      return newItem
    }
    await Upsert_Skeleton(
      usersmentioned,
      'mentioned_users',
      getItemMentionedUser,
      250,
      ['user_id'],
    )

    const usersmentions = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.UserMentions,
    )

    let getItem = (item: any) => {
      const { id, mentioned_user_id, tweet_id } = item
      const newItem: InsertUserMentions = {
        mentioned_user_id,
        tweet_id,
      }
      return newItem
    }
    await Upsert_Skeleton(usersmentions, 'user_mentions', getItem, 150, [
      'mentioned_user_id',
      'tweet_id',
    ])
  }
  async function Upsert_Likes() {
    const likes = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.Likes,
    )

    let getItem = (item: any) => {
      const { account_id, liked_tweet_id, archive_upload_id } = item
      const newItem: InsertLikes = {
        account_id,
        liked_tweet_id,
        archive_upload_id,
      }
      return newItem
    }

    const tweetsToFilter = [
      '1823637522087325732',
      '1320064512771444736',
      '1786438641474011545',
      '1606398704830881803',
      '1809331423779910042',
      '1818771520501825944',
      '1425955110795030528',
      '1438902079389536258',
      '1407838377622208516',
      '1815910871832617374',
      '1632229342934622208',
      '1171522069978210311',
      '1478502243368321027',
      '1406914536519634945',
      '1406914536519634945',
      '1406914536519634945',
    ]

    const processedLikes = likes.filter(
      (item) => !tweetsToFilter.includes(item.liked_tweet_id),
    )

    console.log('processedLikes', processedLikes.length)
    await Upsert_Skeleton(processedLikes, 'likes', getItem, 250, [
      'liked_tweet_id',
      'account_id',
    ])
  }
  async function Upsert_Followers() {
    const followers = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.Followers,
    )
    let getItem = (item: any) => {
      const { account_id, follower_account_id, id, archive_upload_id } = item
      const newItem: InsertFollowers = {
        archive_upload_id,
        follower_account_id,
        account_id,
      }
      return newItem
    }
    await Upsert_Skeleton(followers, 'followers', getItem, 250, [
      'follower_account_id',
      'account_id',
    ])
  }

  async function Upsert_Following() {
    const following = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.Following,
    )
    let getItem = (item: any) => {
      const { account_id, following_account_id, id, archive_upload_id } = item
      const newItem: InsertFollowing = {
        archive_upload_id,
        account_id,
        following_account_id,
      }
      return newItem
    }
    await Upsert_Skeleton(following, 'following', getItem, 250, [
      'account_id',
      'following_account_id',
    ])
  }
  async function Upsert_Archive_Upload() {
    // const archive_upload = await getDataFromUnprocessedFile(GLOBAL_ARCHIVE_PATH, FilesToProcess.ArchiveUpload);
    // let getItem = (item: any) => {
    //   return item as InsertArchiveUpload;
    // };
    // await Upsert_Skeleton(archive_upload, "archive_upload", getItem, 250, ["id"]);
  }
  async function Upsert_Tweet_Urls() {
    const urls = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.TweetUrls,
    )

    let getItem = (item: any) => {
      const { id, url, expanded_url, display_url, tweet_id } = item
      const newItem: InsertTweetURLs = {
        url,
        expanded_url,
        display_url,
        tweet_id,
      }
      return newItem
    }
    await Upsert_Skeleton(urls, 'tweet_urls', getItem, 250, [])
  }

  async function importTweets() {
    const communityarchive_tweets = await getDataFromUnprocessedFile(
      GLOBAL_ARCHIVE_PATH,
      FilesToProcess.Tweets,
    )
    let getItem = (item: any) => {
      const {
        tweet_id,
        account_id,
        created_at,
        full_text,
        retweet_count,
        favorite_count,
        reply_to_tweet_id,
        reply_to_user_id,
        reply_to_username,
        archive_upload_id,
      } = item
      const newItem: InsertTweets = {
        tweet_id,
        account_id,
        created_at,
        full_text,
        retweet_count,
        favorite_count,
        reply_to_tweet_id: ifStringNullReturnNull(reply_to_tweet_id),
        reply_to_user_id: ifStringNullReturnNull(reply_to_user_id),
        reply_to_username: ifStringNullReturnNull(reply_to_username),
        archive_upload_id,
      }
      return newItem
    }
    await Upsert_Skeleton(communityarchive_tweets, 'tweets', getItem, 250, [
      'tweet_id',
    ])
  }

  async function getDataFromUnprocessedFile(dirPath: string, file: string) {
    let processedData: any[] = {} as any

    const filePath = path.join(dirPath, `${file}.csv`)
    try {
      const records: any[] = []
      const csvParser = parse({
        delimiter: ',',
        columns: true, // This assumes the first row of your CSV is headers
      })

      console.log('reading file', file)
      createReadStream(filePath)
        .pipe(csvParser)
        .on('data', (data: any) => {
          records.push(data)
        })
        .on('end', () => {
          console.log(`Parsed CSV data for ${file}:`)
          processedData = records
        })
        .on('error', (error: any) => {
          console.error(`Error parsing CSV for ${file}:`, error)
        })
      await finished(csvParser)
    } catch (error) {
      console.error(`Error processing file ${file}:`, error)
      // Continue with the next file instead of stopping the entire process
    }

    return processedData
  }

  //##### Archive upload is already inserted through the seed file, we need to force the ID to be inserted so it's better to insert it there
  //await Upsert_Archive_Upload().catch((e) => console.log(e));
  await Upsert_Account().catch((e) => console.log(e))
  await Upsert_Profile().catch((e) => console.log(e))
  await importTweets().catch((e) => console.log(e))
  await Upsert_Liked_Tweets().catch((e) => console.log(e))
  await Upsert_Likes().catch((e) => console.log(e))
  await Upsert_Followers().catch((e) => console.log(e))
  await Upsert_Following().catch((e) => console.log(e))
  await Upsert_User_Mentions().catch((e) => console.log(e))
  await Upsert_Tweet_Urls().catch((e) => console.log(e))
  await Upsert_Tweet_Media().catch((e) => console.log(e))
})()

console.log('starting')
