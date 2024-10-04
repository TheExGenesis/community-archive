import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export const getTweet = async (tweet_id: any) => {
  const supabase = createServerClient(cookies())
  return await supabase
    .from('tweets')
    .select(
      `
        *,
        ${'account'}!inner (
          profile (
            avatar_media_url
          ),
          username,
          account_display_name
        )
      `,
    )
    .eq('tweet_id', tweet_id)
}
