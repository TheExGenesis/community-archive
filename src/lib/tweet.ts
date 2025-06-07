import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export const getTweet = async (tweet_id: any) => {
  const supabase = createServerClient(cookies())
  return await supabase
    .schema('public')
    .from('tweets')
    .select(
      `
        *,
        account:all_account!inner (
          username,
          account_display_name,
          profile:profile!left (
            avatar_media_url
          )
        ),
        media:tweet_media (
          media_url,
          media_type,
          width,
          height
        )
      `,
    )
    .eq('tweet_id', tweet_id)
}
