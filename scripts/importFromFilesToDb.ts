import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

import {
  InsertAccount,
  InsertArchiveUpload,
  InsertFollowers,
  InsertFollowing,
  InsertLikedTweets,
  InsertLikes,
  InsertMentionedUsers,
  InsertProfile,
  InsertTweetMedia,
  InsertTweets,
  InsertTweetURLs,
  InsertUserMentions,
  //InsertUserFollowing, InsertUserMention, InsertUserTweetLikes, InsertUsers
} from '../src/database-explicit-types'

import {
  createDbScriptClient,
} from '../src/utils/supabase'
import { Database } from '../src/database-types'

import * as fs from 'fs';
import * as path from 'path';

type Tables = Database['public']['Tables']
type TableNames = keyof Tables
type ColumnsFor<T extends TableNames> = keyof Tables[T]['Row']



function ifStringNullReturnNull(value: string | null): string | null {
  return value === 'NULL' || !value ? null : value
}


const GLOBAL_ARCHIVE_PATH = process.env.ARCHIVE_PATH!



;(async function execute() {
  var supabase = await createDbScriptClient()

  const { data: healthCheck, error: healthError } = await supabase.from('account').select('*').limit(1)
  if (healthError) {
    console.error('Supabase connection error:', healthError)
    throw new Error('Failed to connect to Supabase')
  }



  async function Upsert_SkeletonItem<T extends TableNames>(
    item: any,
    fileRoot:string,
    table: T,
    getItem: (item: any) => any,
    idColumn: ColumnsFor<T>[],
  ) {
    let query = supabase.from(table)
      let options = { ignoreDuplicates: true }
      if (idColumn.length > 0) {
        options = {
          ignoreDuplicates: true,
          onConflict: idColumn.join(','),
        } as any
      }
      const { data, error } = await query.upsert(item, options).select("*")

      if (error) {
        console.error(
          `Error inserting batch into ${table}:`,
          JSON.stringify(error),
        )
        console.error(
          `Error inserting batch into ${table}:`,
          JSON.stringify(data),
        )
      } 

      return data;

    }

  async function Upsert_Skeleton<T extends TableNames>(
    items: any[],
    fileRoot:string,
    table: T,
    getItem: (item: any) => any,
    batchSize: number = 50,
    idColumn: ColumnsFor<T>[],
  ) {
    let cont = 0
    //console.log(
    //  'Upsert_skeleton for ',
    //  table,
    //  items.length,
    //  'with batch size',
    //  batchSize,
    //)

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
        //throw new Error(fileRoot + ' ' + error.message);
      } else if (data.length > 0) {
        cont += data.length
        //console.log('processed batch', table, i, data.length)
      }
    }
    console.log(`${table} inserted correctly ${cont}`)
    return cont
  }

  async function Upsert_Account(data: any , fileRoot:string) {
    const account = data.account;
    const num_followers = data.follower.length || 0;
    const num_following = data.following.length || 0;
    const num_likes = data.like.length || 0;
    const num_tweets = data.tweets.length || 0;

    let getItem = (item: any) => {
      const {
        accountId,
        createdVia,
        username,
        createdAt,
        accountDisplayName,

      } = item.account
      const newAccount: InsertAccount = {
        account_id: accountId,
        username,
        account_display_name:accountDisplayName,
        created_at: createdAt,
        created_via: createdVia,
        num_followers,
        num_following,
        num_likes,
        num_tweets,
      }
      return newAccount
    }

    await Upsert_Skeleton(account, fileRoot, 'account', getItem, 1, ['account_id'])
  }

  async function Upsert_Tweet_Media(data: any, fileRoot:string) {
    const tweets = data.tweets.map((i:any) => i.tweet);
    const allmedia = [];

    for(const tweet of tweets){
      if(tweet.entities.media){
        for(const media of tweet.entities.media){
          allmedia.push({
          tweet_id: tweet.id,
          url: media.url,
          expanded_url: media.expanded_url,
          display_url: media.display_url ,
          media_type : media.type,
          media_url: media.media_url,
          media_url_https: media.media_url_https,         
        })
        }
      }
    }
    
    let { count: media_ids, error } = await supabase.from("tweet_media").select("*", { count: "exact", head: true });
    let i = (media_ids || 0)+1;
    let getItem = (item: any) => {
      const {
        tweet_id,
        url,
        expanded_url,
        display_url,
        media_type,
        media_url,
        media_url_https,
      } = item
      const newItem: InsertTweetMedia = {
        tweet_id,
        media_type,
        media_url:media_url_https,
       height:0,
       width:0,
       media_id:++i,
        archive_upload_id:data.archive_upload_id,
      }
      return newItem
    }
    await Upsert_Skeleton(allmedia, fileRoot, 'tweet_media', getItem, 50, ['media_id'])
  }
  async function Upsert_Liked_Tweets(data: any, fileRoot:string ) {
    const liked_tweets = data.like;
    let getItem = (item: any) => {
      const { tweetId, fullText } = item.like
      const newItem: InsertLikedTweets = {
        tweet_id:tweetId,
        full_text:fullText ||"",
      }
      return newItem
    }
    await Upsert_Skeleton(liked_tweets, fileRoot, 'liked_tweets', getItem, 250, [
      'tweet_id',
    ])
  }
  async function Upsert_Profile(data: any, fileRoot:string) {
    const profile = data.profile;
    const accountId = data.account[0].account.accountId;
    let getItem = (item: any) => {
      const {
        description,
        avatarMediaUrl,
        headerMediaUrl,
      } = item.profile
      const newItem: InsertProfile = {
        account_id : accountId,
        bio: description.bio,
        website: description.website,
        location: description.location,
        avatar_media_url: ifStringNullReturnNull(avatarMediaUrl),
        header_media_url: ifStringNullReturnNull(headerMediaUrl),
        archive_upload_id: data.archive_upload_id,
      }
      return newItem
    }
    await Upsert_Skeleton(profile, fileRoot, 'profile', getItem, 1, [])
  }
  async function Upsert_User_Mentions(data: any, fileRoot:string) {
    
    const tweets = data.tweets.map((i:any) =>i.tweet);
    const mentions = [];

    for(const tweet of tweets){
      for(const mention of tweet.entities.user_mentions){
        mentions.push({
          tweet_id: tweet.id,
          user_id: mention.id,
          name: mention.name,
          screen_name: mention.screen_name,
        })
      }
    }

    let getItemMentionedUser = (item: any) => {
      const { user_id, name, screen_name } = item
      const newItem: InsertMentionedUsers = {
        user_id,
        name,
        screen_name,
        updated_at: new Date().toISOString(),
      }
      return newItem
    }
    await Upsert_Skeleton(
      mentions,
      fileRoot,
      'mentioned_users',
      getItemMentionedUser,
      200,
      ['user_id'],
    )

    let getItem = (item: any) => {
      const { user_id, tweet_id } = item
      const newItem: InsertUserMentions = {
        mentioned_user_id:user_id,
        tweet_id,
      }
      return newItem
    }
    await Upsert_Skeleton(mentions, fileRoot, 'user_mentions', getItem, 150, [
      'mentioned_user_id',
      'tweet_id',
    ])
  }
  async function Upsert_Likes(data: any, fileRoot:string) {
    const likes = data.like.map((i:any) => i.like);
    const accountId = data.account[0].account.accountId;
    

    let getItem = (item: any) => {
      const { tweetId } = item
      const newItem: InsertLikes = {
        account_id : accountId,
        liked_tweet_id:tweetId,
        archive_upload_id : data.archive_upload_id,
      }
      return newItem
    }

    await Upsert_Skeleton(likes, fileRoot, 'likes', getItem, 250, [
      'liked_tweet_id',
      'account_id',
    ])
  }
  async function Upsert_Followers(data: any, fileRoot:string) {
    const followers = data.follower;
    const userAccountId = data.account[0].account.accountId;
    let getItem = (item: any) => {
      const { accountId } = item.follower
      const newItem: InsertFollowers = {
        archive_upload_id:data.archive_upload_id,
        follower_account_id:accountId,
        account_id : userAccountId,
      }
      return newItem
    }
    await Upsert_Skeleton(followers, fileRoot, 'followers', getItem, 250, [
      'follower_account_id',
      'account_id',
    ])
  }

  async function Upsert_Following(data: any, fileRoot:string) {
    const following = data.following;
    const userAccountId = data.account[0].account.accountId;


    let getItem = (item: any) => {
      const {  accountId } = item.following
      const newItem: InsertFollowing = {
        archive_upload_id:data.archive_upload_id,
        account_id : userAccountId,
        following_account_id:accountId,
      }
      return newItem
    }
    await Upsert_Skeleton(following, fileRoot, 'following', getItem, 250, [
      'account_id',
      'following_account_id',
    ])
  }
  async function Upsert_Archive_Upload(data: any, fileRoot:string) {
    const accountId = data.account[0].account.accountId;
    const tweetsDate=data.tweets.map((t:any)=>new Date(t.tweet.created_at)).sort((a:any, b:any) => a - b);;
    const start_date = tweetsDate[0];
    const end_date = tweetsDate[tweetsDate.length-1];

    const archive_upload : InsertArchiveUpload ={
      account_id:accountId, 
      start_date:start_date.toISOString(),
      end_date:end_date.toISOString(),
      archive_at:new Date().toISOString(),
      keep_private:false}

     let getItem = (item: any) => {
       return item as InsertArchiveUpload;
     };
    const res = await Upsert_SkeletonItem(archive_upload, fileRoot, "archive_upload", getItem, ["id"]);
    if(!res) throw new Error("Error inserting archive_upload");
    const archiveId = res[0].id;
    data.archive_upload_id = archiveId;
  }
  async function Upsert_Tweet_Urls(data: any, fileRoot:string) {
    const tweets = data.tweets.map((i:any) =>i.tweet);
    const urls = [];

    for(const tweet of tweets){
      for(const url of tweet.entities.urls){
        urls.push({
          tweet_id: tweet.id,
          url: url.url,
          expanded_url: url.expanded_url,
          display_url: url.display_url ,

        })
      }
    }


    let getItem = (item: any) => {
      const { url, expanded_url, display_url, tweet_id } = item
      const newItem: InsertTweetURLs = {
        url,
        expanded_url,
        display_url,
        tweet_id,
      }
      return newItem
    }
    await Upsert_Skeleton(urls, fileRoot, 'tweet_urls', getItem, 250, ['tweet_id','url'])
  }

  async function importTweets(data: any, fileRoot:string) {
      const communityarchive_tweets = data.tweets;
      const accountId = data.account[0].account.accountId;

    let getItem = (item: any) => {
      const {
        id,
        created_at,
        full_text,
        retweet_count,
        favorite_count,
        in_reply_to_status_id,
        in_reply_to_user_id_str,
        in_reply_to_screen_name,
      } = item.tweet
      const newItem: InsertTweets = {
        tweet_id:id,
        account_id : accountId,
        created_at,
        full_text,
        retweet_count,
        favorite_count,
        reply_to_tweet_id: ifStringNullReturnNull(in_reply_to_status_id),
        reply_to_user_id: ifStringNullReturnNull(in_reply_to_user_id_str),
        reply_to_username: ifStringNullReturnNull(in_reply_to_screen_name),
        archive_upload_id:data.archive_upload_id,
      }
      return newItem
    }
    await Upsert_Skeleton(communityarchive_tweets,fileRoot, 'tweets', getItem, 250, [
      'tweet_id',
    ])
  }

  async function getDataFromUnprocessedFile(targetPath: string) {
    let processedData: any[] = []

    const filePath = path.join(targetPath,`/archive.json`)
    try {
      const fileContent = await fs.promises.readFile(filePath, 'utf-8')
      const jsonData = JSON.parse(fileContent)

      if (Array.isArray(jsonData)) {
        processedData = jsonData
      } else if(!jsonData) {
        console.error('Some error happened with targetPath', targetPath)
      }
      return jsonData
    } catch (error) {
      console.error(`Error processing file archive.json:`, error)
      // Continue with the next file instead of stopping the entire process
      return null;
    }

    
  }

  const Operations =[
    Upsert_Account,
    Upsert_Archive_Upload,
    Upsert_Profile,
    importTweets,
    Upsert_Liked_Tweets,
    Upsert_Likes,
    Upsert_Followers,
    Upsert_Following,
    Upsert_User_Mentions,
    Upsert_Tweet_Urls,
    Upsert_Tweet_Media
    ]

  
    async function processData(data: any,fileRoot:string): Promise<void> {
      for (const operation of Operations) {
        try {
          await operation(data,fileRoot);
        } catch (error) {
          console.error('Operation failed:', error);
          throw error;
        }
      }
    }

  const filesRoot = getFoldersInPath(GLOBAL_ARCHIVE_PATH);



  const BATCH_SIZE = 10; // Adjust based on your needs
  
  for (let i = 0; i < filesRoot.length; i += BATCH_SIZE) {
    const batch = filesRoot.slice(i, i + BATCH_SIZE);
    //console.log(`Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(filesRoot.length / BATCH_SIZE)}`);
    
    const batchPromises = batch.map(async (fileRoot) => {
      console.log('Processing file:', fileRoot);
      try {
        const data = await getDataFromUnprocessedFile(fileRoot);
        await processData(data,fileRoot);
      } catch (error) {
        console.error(`Error processing ${fileRoot}:`, error);
      }
    });

    console.log("waiting for batch to finish")
    await Promise.all(batchPromises);
    
    // Add a small delay between batches to allow GC
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const {data, error} = await supabase.schema("public").from("archive_upload").update({upload_phase:"completed"}).eq("upload_phase","uploading");
  if(error){
    console.error("Error updating archive_upload table:",error);
    console.error("Please run the query manually: update \"archive_upload\" set \"upload_phase\" = 'completed' where \"upload_phase\" = 'uploading';")
  }


  
})()

console.log('starting')




function getFoldersInPath(directoryPath: string): string[] {
  try {
    // Read the contents of the directory
    const items = fs.readdirSync(directoryPath);

    // Filter out non-directory items and get full paths
    const folders = items
      .filter(item => fs.statSync(path.join(directoryPath, item)).isDirectory())
      .map(folder => path.join(directoryPath, folder));

    return folders;
  } catch (error) {
    console.error(`Error reading directory: ${error}`);
    return [];
  }
}