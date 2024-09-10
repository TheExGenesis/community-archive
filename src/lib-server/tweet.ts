import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { getSchemaName } from '@/lib-client/getTableName'

export const getTweet = async (tweet_id:any) => {
  const supabase = createServerClient(cookies())
  return await 
    supabase
      .schema(getSchemaName())
      .from('tweets')
      .select( `
        *,
        ${'account'}!inner (
          profile (
            avatar_media_url
          ),
          username,
          account_display_name
        )
      `)
      .eq('tweet_id', tweet_id)
}
