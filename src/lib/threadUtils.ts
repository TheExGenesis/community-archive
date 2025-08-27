import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export interface ThreadTweet {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number
  favorite_count: number
  reply_to_tweet_id: string | null
  reply_to_user_id: string | null
  reply_to_username: string | null
  username: string
  account_display_name: string
  avatar_media_url?: string
  media?: any[]
  quote_tweet_id?: string | null
  quoted_tweet?: {
    tweet_id: string
    account_id: string
    created_at: string
    full_text: string
    retweet_count: number
    favorite_count: number
    avatar_media_url?: string
    username: string
    account_display_name: string
    media?: any[]
  } | null
}

export interface ConversationTree {
  root: string
  tweets: { [tweet_id: string]: ThreadTweet }
  children: { [tweet_id: string]: string[] }
  parents: { [tweet_id: string]: string }
  paths: { [leaf_id: string]: string[] }
}

/**
 * Get tweets in a conversation thread by following reply chains
 */
export const getConversationTweets = async (tweet_id: string): Promise<ThreadTweet[]> => {
  const supabase = createServerClient(cookies())
  
  // First get the initial tweet using enriched_tweets view
  const { data: initialTweet, error: initialError } = await supabase
    .schema('public')
    .from('enriched_tweets')
    .select('*')
    .eq('tweet_id', tweet_id)
    .single()

  if (!initialTweet) {
    return []
  }

  // Get all tweets in the same conversation
  let conversationTweets: any[] = []
  
  // If we have a conversation_id, use it to get all related tweets
  if (initialTweet.conversation_id) {
    const { data, error } = await supabase
      .schema('public') 
      .from('enriched_tweets')
      .select('*')
      .eq('conversation_id', initialTweet.conversation_id)
      .order('created_at')

    conversationTweets = data || []
  } else {
    // Fallback: manually find all replies recursively
    const allReplies = await getReplyChain(supabase, tweet_id)
    
    // Include the original tweet plus all replies
    conversationTweets = [initialTweet, ...allReplies]
  }

  // Get media and quote tweets for each tweet
  const tweetIds = conversationTweets.map(t => t.tweet_id)
  if (tweetIds.length > 0) {
    // Get media
    const { data: mediaData } = await supabase
      .schema('public')
      .from('tweet_media')
      .select('*')
      .in('tweet_id', tweetIds)

    // Get quote tweet relationships
    const { data: quoteData } = await supabase
      .schema('public')
      .from('quote_tweets')
      .select('tweet_id, quoted_tweet_id')
      .in('tweet_id', tweetIds)

    // Get all quoted tweet IDs
    const quotedTweetIds = (quoteData?.map(q => q.quoted_tweet_id).filter((id): id is string => id !== null) || [])
    
    // Fetch quoted tweets if any
    let quotedTweets: any[] = []
    if (quotedTweetIds.length > 0) {
      const { data: quotedTweetData } = await supabase
        .schema('public')
        .from('enriched_tweets')
        .select('*')
        .in('tweet_id', quotedTweetIds)
      
      if (quotedTweetData) {
        // Get media for quoted tweets
        const { data: quotedMediaData } = await supabase
          .schema('public')
          .from('tweet_media')
          .select('*')
          .in('tweet_id', quotedTweetIds)
        
        // Add media to quoted tweets
        quotedTweets = quotedTweetData.map(qt => ({
          ...qt,
          media: quotedMediaData?.filter(m => m.tweet_id === qt.tweet_id) || []
        }))
      }
    }

    // Transform to ThreadTweet format with media and quote tweets
    return conversationTweets.map(tweet => {
      const media = mediaData?.filter(m => m.tweet_id === tweet.tweet_id) || []
      
      // Find quote tweet relationship
      const quoteRelation = quoteData?.find(q => q.tweet_id === tweet.tweet_id)
      let quote_tweet_id = null
      let quoted_tweet = null
      
      if (quoteRelation) {
        const quotedTweet = quotedTweets.find(qt => qt.tweet_id === quoteRelation.quoted_tweet_id)
        if (quotedTweet) {
          quote_tweet_id = quoteRelation.quoted_tweet_id
          quoted_tweet = {
            tweet_id: quotedTweet.tweet_id,
            account_id: quotedTweet.account_id,
            created_at: quotedTweet.created_at,
            full_text: quotedTweet.full_text,
            retweet_count: quotedTweet.retweet_count,
            favorite_count: quotedTweet.favorite_count,
            avatar_media_url: quotedTweet.avatar_media_url,
            username: quotedTweet.username,
            account_display_name: quotedTweet.account_display_name,
            media: quotedTweet.media || []
          }
        }
      }
      
      return {
        tweet_id: tweet.tweet_id,
        account_id: tweet.account_id,
        created_at: tweet.created_at,
        full_text: tweet.full_text,
        retweet_count: tweet.retweet_count,
        favorite_count: tweet.favorite_count,
        reply_to_tweet_id: tweet.reply_to_tweet_id,
        reply_to_user_id: tweet.reply_to_user_id,
        reply_to_username: tweet.reply_to_username,
        username: tweet.username,
        account_display_name: tweet.account_display_name,
        avatar_media_url: tweet.avatar_media_url,
        media,
        quote_tweet_id,
        quoted_tweet
      }
    })
  }
  
  // If no tweets, return empty array
  return []
}

/**
 * Get replies to a tweet including nested replies (recursive)
 */
async function getReplyChain(supabase: any, tweetId: string, visited: Set<string> = new Set()): Promise<any[]> {
  if (visited.has(tweetId)) return []
  visited.add(tweetId)
  
  const { data: replies, error } = await supabase
    .schema('public')
    .from('enriched_tweets')
    .select('*')
    .eq('reply_to_tweet_id', tweetId)
    .order('created_at')

  const allReplies = replies || []
  
  // Get media for replies
  const replyIds = allReplies.map((r: any) => r.tweet_id)
  if (replyIds.length > 0) {
    const { data: mediaData } = await supabase
      .schema('public')
      .from('tweet_media')
      .select('*')
      .in('tweet_id', replyIds)

    allReplies.forEach((reply: any) => {
      reply.media = mediaData?.filter((m: any) => m.tweet_id === reply.tweet_id) || []
    })
  }
  
  // Recursively get replies to replies
  for (const reply of allReplies.slice()) { // Use slice() to avoid modifying array during iteration
    const nestedReplies = await getReplyChain(supabase, reply.tweet_id, visited)
    allReplies.push(...nestedReplies)
  }
  
  return allReplies
}

/**
 * Build conversation tree structure from tweets
 * Based on the reference implementation in birdseye
 */
export const buildConversationTree = (tweets: ThreadTweet[]): ConversationTree => {
  const tree: ConversationTree = {
    root: '',
    tweets: {},
    children: {},
    parents: {},
    paths: {}
  }

  // Organize tweets by ID and build parent/child relationships
  for (const tweet of tweets) {
    tree.tweets[tweet.tweet_id] = tweet
    tree.children[tweet.tweet_id] = []

    const reply_to = tweet.reply_to_tweet_id
    if (reply_to && tree.tweets[reply_to]) {
      tree.children[reply_to].push(tweet.tweet_id)
      tree.parents[tweet.tweet_id] = reply_to
    } else if (!reply_to) {
      tree.root = tweet.tweet_id
    }
  }

  // Build paths from root to each leaf
  const buildPaths = (currentId: string, path: string[] = []): void => {
    const newPath = [...path, currentId]
    const children = tree.children[currentId] || []

    if (children.length === 0) {
      // Leaf node - store the path
      tree.paths[currentId] = newPath
    } else {
      // Has children - recurse
      for (const childId of children) {
        buildPaths(childId, newPath)
      }
    }
  }

  if (tree.root) {
    buildPaths(tree.root)
  }

  return tree
}

/**
 * Get a thread tree for a specific tweet
 */
export const getThreadTree = async (tweet_id: string): Promise<ConversationTree | null> => {
  const tweets = await getConversationTweets(tweet_id)
  if (tweets.length === 0) {
    return null
  }
  
  return buildConversationTree(tweets)
}

/**
 * Get the path from root to a specific tweet in the conversation
 */
export const getPathToTweet = (tree: ConversationTree, tweet_id: string): string[] => {
  // If this is a leaf, we have the path
  if (tree.paths[tweet_id]) {
    return tree.paths[tweet_id]
  }

  // Otherwise, build path from root
  const path: string[] = []
  let current = tweet_id
  
  while (current && current !== tree.root) {
    path.unshift(current)
    current = tree.parents[current]
  }
  
  if (tree.root) {
    path.unshift(tree.root)
  }
  
  return path
}