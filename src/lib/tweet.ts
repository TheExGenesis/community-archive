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

  // Get quote tweet data
  const { data: quoteData } = await supabase
    .schema('public')
    .from('quote_tweets')
    .select('quoted_tweet_id')
    .eq('tweet_id', tweet_id)
    .single()

  if (quoteData?.quoted_tweet_id) {
    // Fetch the quoted tweet data
    const quotedTweetResult = await getTweet(quoteData.quoted_tweet_id)
    if (quotedTweetResult.data && quotedTweetResult.data[0]) {
      (tweet as any).quoted_tweet = quotedTweetResult.data[0];
      (tweet as any).quote_tweet_id = quoteData.quoted_tweet_id;
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
