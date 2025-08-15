import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { getMentionedUserAccount } from './mentionedUsers'

export const getTweet = async (tweet_id: any) => {
  const supabase = createServerClient(cookies())
  const result = await supabase
    .schema('public')
    .from('tweets')
    .select(
      `
        *,
        account:all_account!inner (
          username,
          account_display_name,
          account_id
        ),
        media:tweet_media (
          media_url,
          media_type,
          width,
          height
        ),
        mentioned_users:user_mentions (
          mentioned_user:mentioned_users (
            user_id,
            name,
            screen_name
          )
        )
      `,
    )
    .eq('tweet_id', tweet_id)

  if (!result.data || !result.data[0]) {
    return result
  }

  const tweet = result.data[0]

  // Get profile data for the main account
  const { data: profileData } = await supabase
    .schema('public')
    .from('all_profile')
    .select('avatar_media_url')
    .eq('account_id', tweet.account.account_id)
    .single()

  // Add profile data to the account
  if (profileData) {
    (tweet.account as any).profile = profileData
  }

  // Get quote tweet data - note: view uses lowercase column names
  const { data: quoteData, error: quoteError } = await supabase
    .schema('public')
    .from('quote_tweets')
    .select('quoted_tweet_id')
    .eq('tweet_id', tweet_id)
    .maybeSingle()

  console.log('[DEBUG] Quote tweet query:', {
    tweet_id,
    quoteData,
    quoteError,
    hasQuotedTweetId: !!quoteData?.quoted_tweet_id
  })

  if (quoteData?.quoted_tweet_id) {
    // Fetch the quoted tweet data with a simpler query to avoid infinite recursion
    const { data: quotedTweetData } = await supabase
      .schema('public')
      .from('tweets')
      .select(`
        *,
        account:all_account!inner (
          username,
          account_display_name,
          account_id
        ),
        media:tweet_media (
          media_url,
          media_type,
          width,
          height
        )
      `)
      .eq('tweet_id', quoteData.quoted_tweet_id)
      .single()
    
    console.log('[DEBUG] Quoted tweet data fetch:', {
      quoted_tweet_id: quoteData.quoted_tweet_id,
      quotedTweetData,
      hasData: !!quotedTweetData
    })
    
    if (quotedTweetData) {
      // Get profile data for the quoted tweet's author
      const { data: quotedProfileData } = await supabase
        .schema('public')
        .from('all_profile')
        .select('avatar_media_url')
        .eq('account_id', quotedTweetData.account.account_id)
        .single()
      
      // Format the quoted tweet to match expected structure
      const quotedTweet = {
        tweet_id: quotedTweetData.tweet_id,
        account_id: quotedTweetData.account_id,
        created_at: quotedTweetData.created_at,
        full_text: quotedTweetData.full_text,
        retweet_count: quotedTweetData.retweet_count,
        favorite_count: quotedTweetData.favorite_count,
        avatar_media_url: quotedProfileData?.avatar_media_url,
        username: quotedTweetData.account.username,
        account_display_name: quotedTweetData.account.account_display_name,
        media: quotedTweetData.media || []
      }
      
      ;(tweet as any).quoted_tweet = quotedTweet
      ;(tweet as any).quote_tweet_id = quoteData.quoted_tweet_id
      
      console.log('[DEBUG] Final tweet with quote:', {
        has_quoted_tweet: !!(tweet as any).quoted_tweet,
        quote_tweet_id: (tweet as any).quote_tweet_id
      })
    }
  }

  // Enrich with account data for mentioned users
  if (tweet.mentioned_users) {
    const enrichedMentionedUsers = await Promise.all(
      tweet.mentioned_users.map(async (userRecord: any) => {
        const accountData = await getMentionedUserAccount(supabase, userRecord.mentioned_user.screen_name)
        return {
          ...userRecord,
          mentioned_user: {
            ...userRecord.mentioned_user,
            account: accountData.data
          }
        }
      })
    )
    tweet.mentioned_users = enrichedMentionedUsers
  }

  return result
}
