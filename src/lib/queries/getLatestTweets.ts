import { createBrowserClient } from '@/utils/supabase'

const getLatestTweets = async (
  supabase: any,
  count: number,
  account_id?: string,
  offset = 0,
) => {
  const newSupabaseClient = createBrowserClient()

  // Use tweets table with joined data for better performance
  let query = newSupabaseClient
    .from('tweets')
    .select(`
      tweet_id,
      account_id,
      created_at,
      full_text,
      retweet_count,
      favorite_count,
      reply_to_tweet_id,
      account!inner (
        username,
        account_display_name
      ),
      tweet_media (
        media_url,
        media_type
      ),
      tweet_urls (
        expanded_url,
        display_url
      ),
      user_mentions (
        mentioned_user:mentioned_users (
          user_id,
          name,
          screen_name
        )
      )
    `)
    .is('archive_upload_id', null)
    .is('reply_to_tweet_id', null)
    .order('created_at', { ascending: false })
  
  query = query.range(offset, offset + count - 1)

  if (account_id) {
    query = query.eq('account_id', account_id)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching tweets:', error)
    throw error
  }

  // Now get additional enriched data for these tweets
  const tweetIds = data?.map(t => t.tweet_id) || []
  
  // Get profile/avatar data
  const { data: profileData } = await newSupabaseClient
    .from('all_profile')
    .select('account_id, avatar_media_url')
    .in('account_id', data?.map(t => t.account_id) || [])
    .order('archive_upload_id', { ascending: false })

  // Get quote tweet data
  const { data: quoteTweets } = await newSupabaseClient
    .from('quote_tweets')
    .select('tweet_id, quoted_tweet_id')
    .in('tweet_id', tweetIds)

  // Get account data for mentioned users (for RT functionality)
  const allMentionedUsers = data?.flatMap((t: any) => t.user_mentions?.map((um: any) => um.mentioned_user?.screen_name) || []) || []
  const uniqueMentionedUsers = Array.from(new Set(allMentionedUsers)).filter(Boolean)
  
  // Get account data for mentioned users
  let mentionedAccountData: any[] = []
  if (uniqueMentionedUsers.length > 0) {
    const { data: accounts } = await newSupabaseClient
      .from('all_account')
      .select('username, account_display_name, account_id')
      .in('username', uniqueMentionedUsers)

    if (accounts) {
      // Get profile data for these accounts
      const accountIds = accounts.map(acc => acc.account_id)
      const { data: profiles } = await newSupabaseClient
        .from('all_profile')
        .select('account_id, avatar_media_url')
        .in('account_id', accountIds)

      // Combine account and profile data
      mentionedAccountData = accounts.map(account => ({
        ...account,
        profile: profiles?.find(p => p.account_id === account.account_id)
      }))
    }
  }

  // Create lookup maps
  const profileMap = new Map()
  profileData?.forEach(p => {
    if (!profileMap.has(p.account_id)) {
      profileMap.set(p.account_id, p.avatar_media_url)
    }
  })

  const quoteMap = new Map()
  quoteTweets?.forEach(qt => quoteMap.set(qt.tweet_id, qt.quoted_tweet_id))

  // Fetch actual quoted tweet data
  const quotedTweetIds = Array.from(new Set(quoteTweets?.map(qt => qt.quoted_tweet_id) || [])).filter(Boolean)
  let quotedTweetsData: any[] = []
  
  if (quotedTweetIds.length > 0) {
    const { data: quotedTweets } = await newSupabaseClient
      .from('tweets')
      .select(`
        tweet_id,
        account_id,
        created_at,
        full_text,
        retweet_count,
        favorite_count,
        account:all_account!inner (
          username,
          account_display_name
        ),
        tweet_media (
          media_url,
          media_type
        )
      `)
      .in('tweet_id', quotedTweetIds)

    if (quotedTweets) {
      // Get profile data for quoted tweet authors
      const quotedAccountIds = quotedTweets.map(qt => qt.account_id)
      const { data: quotedProfileData } = await newSupabaseClient
        .from('all_profile')
        .select('account_id, avatar_media_url')
        .in('account_id', quotedAccountIds)

      const quotedProfileMap = new Map()
      quotedProfileData?.forEach(p => {
        quotedProfileMap.set(p.account_id, p.avatar_media_url)
      })

      // Enrich quoted tweets with profile data
      quotedTweetsData = quotedTweets.map((qt: any) => ({
        ...qt,
        avatar_media_url: quotedProfileMap.get(qt.account_id),
        username: Array.isArray(qt.account) ? qt.account[0]?.username : qt.account?.username,
        account_display_name: Array.isArray(qt.account) ? qt.account[0]?.account_display_name : qt.account?.account_display_name,
        media: qt.tweet_media || []
      }))
    }
  }

  const quotedTweetMap = new Map()
  quotedTweetsData?.forEach(qt => {
    quotedTweetMap.set(qt.tweet_id, qt)
  })

  const mentionedAccountMap = new Map()
  mentionedAccountData?.forEach(acc => {
    mentionedAccountMap.set(acc.username, acc)
  })

  // Transform data to match expected format with enriched data
  const transformedData = data?.map(tweet => {
    // Detect if this is a retweet (starts with "RT @username:")
    const isRetweet = tweet.full_text?.startsWith('RT @')
    
    // Extract media from tweet_media and also detect images from URLs
    const media = tweet.tweet_media || []
    const urls = tweet.tweet_urls || []
    
    // Add images from URLs that are likely images
    urls.forEach((url: any) => {
      if (url.expanded_url && /\.(jpg|jpeg|png|gif|webp)($|\?)/i.test(url.expanded_url)) {
        media.push({
          media_url: url.expanded_url,
          media_type: 'image/jpeg' // Default to jpeg for URL images
        })
      }
    })

    // Check if this is a quote tweet by looking for Twitter URLs
    const hasTwitterUrl = urls.some((url: any) => 
      url.expanded_url && url.expanded_url.includes('twitter.com/') && url.expanded_url.includes('/status/')
    )
    
    // Enrich mentioned_users with account data
    const enrichedMentionedUsers = (tweet.user_mentions || []).map((userMention: any) => {
      const accountData = mentionedAccountMap.get(userMention.mentioned_user?.screen_name)
      return {
        ...userMention,
        mentioned_user: {
          ...userMention.mentioned_user,
          account: accountData
        }
      }
    })
    
    const quotedTweetId = quoteMap.get(tweet.tweet_id)
    const quotedTweet = quotedTweetId ? quotedTweetMap.get(quotedTweetId) : null

    return {
      tweet_id: tweet.tweet_id,
      account_id: tweet.account_id,
      created_at: tweet.created_at,
      full_text: tweet.full_text,
      retweet_count: tweet.retweet_count,
      favorite_count: tweet.favorite_count,
      reply_to_tweet_id: tweet.reply_to_tweet_id,
      quote_tweet_id: quotedTweetId || (hasTwitterUrl ? 'detected_from_url' : null),
      quoted_tweet: quotedTweet,
      retweeted_tweet_id: isRetweet ? 'detected_from_text' : null,
      avatar_media_url: profileMap.get(tweet.account_id),
      username: Array.isArray((tweet as any).account) ? (tweet as any).account[0]?.username : (tweet as any).account?.username,
      account_display_name: Array.isArray((tweet as any).account) ? (tweet as any).account[0]?.account_display_name : (tweet as any).account?.account_display_name,
      media: media,
      urls: urls || [],
      mentioned_users: enrichedMentionedUsers
    }
  }) || []

  return transformedData
}

export default getLatestTweets
