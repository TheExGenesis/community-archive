import * as dotenv from 'dotenv';
dotenv.config({path: '../.env'});



import { createDbScriptClient } from "../src/utils/supabase";


(async function execute() {
  var supabase = await createDbScriptClient();

  const batchSize = 100; // Process tweets in batches of 100
  const results = {
    noConversationCorrectly: 0,
    noConversationIncorrectly: 0,
    conversationCorrectly: 0,
    conversationIncorrectly: 0
  };

  let lastTweetId: string | null = null;

  async function fetchTweets() {
    const query = supabase
      .from('tweets_w_conversation_id')
      .select('tweet_id, conversation_id, reply_to_tweet_id')
      .order('tweet_id', { ascending: true })
      .limit(batchSize);

    if (lastTweetId) {
      query.gt('tweet_id', lastTweetId);
    }

    const { data: tweets, error } = await query;

    if (error) {
      console.error('Error fetching tweets:', error);
      return null;
    }

    if (tweets && tweets.length > 0) {
      lastTweetId = tweets[tweets.length - 1].tweet_id;
    }

    return tweets;
  }

  async function processTweet(tweet: any) {
    if (tweet.conversation_id) {
      let currentTweetId = tweet.reply_to_tweet_id;
      while (currentTweetId) {
        const { data: parentTweet, error: parentError } = await supabase
          .from('tweets_w_conversation_id')
          .select('tweet_id, conversation_id, reply_to_tweet_id')
          .eq('tweet_id', currentTweetId)
          .single();

        if (parentError || !parentTweet) {
          results.conversationIncorrectly++;
          break;
        }

        if (parentTweet.conversation_id && parentTweet.conversation_id !== tweet.conversation_id) {
          console.error(`Conversation ID mismatch: Tweet ${tweet.tweet_id} has conversation_id ${tweet.conversation_id}, but its ancestor ${parentTweet.tweet_id} has conversation_id ${parentTweet.conversation_id}`);
          break;
        }

        currentTweetId = parentTweet.reply_to_tweet_id;
      }
      results.conversationCorrectly++;
    } else {
      let currentTweetId = tweet.reply_to_tweet_id;
      while (currentTweetId) {
        const { data: parentTweet, error: parentError } = await supabase
          .from('tweets')
          .select('tweet_id, reply_to_tweet_id')
          .eq('tweet_id', currentTweetId)
          .single();

        if (!parentTweet || parentError) {
          results.noConversationCorrectly++;
          break;
        } else {
          currentTweetId = parentTweet.reply_to_tweet_id;
            
          if(parentTweet.reply_to_tweet_id === null){ 
            results.noConversationIncorrectly++;
            break;
          }
        }
      }
    }
  }

  async function processBatch(batch: any[]) {
    await Promise.all(batch.map(processTweet));
  }

  let totalProcessed = 0;
  let tweets: any[] | null;

  while ((tweets = await fetchTweets()) && tweets.length > 0) {
    await processBatch(tweets);
    totalProcessed += tweets.length;
    console.log(`Processed ${totalProcessed} tweets`);
  }

  console.log('Results:', results);
  console.log('Conversation ID check completed.');
})();

console.log("starting");
