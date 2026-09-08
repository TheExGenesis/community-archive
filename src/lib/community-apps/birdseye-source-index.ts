import 'server-only'
import { unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { selectBirdseyeSources } from './birdseye-threads'

// Exact-reference metadata only; full tweet payloads still come from the shared reader.
export const getBirdseyeSourceIndex = unstable_cache(
  async (input: string[], username: string) => {
    const ids = Array.from(new Set(input.filter((id) => /^\d{1,20}$/.test(id))))
    const rows: {
      tweet_id: string | null
      username: string | null
      reply_to_tweet_id: string | null
      conversation_id: string | null
    }[] = []
    for (let offset = 0; offset < ids.length; offset += 150) {
      const { data, error } = await createServerServiceRoleClient()
        .from('enriched_tweets')
        .select('tweet_id,username,reply_to_tweet_id,conversation_id')
        .in('tweet_id', ids.slice(offset, offset + 150))
      if (error) throw new Error('Unable to group cited posts')
      rows.push(...(data ?? []))
    }
    return selectBirdseyeSources(ids, rows, username)
  },
  ['birdseye-owner-source-threads-v2'],
  { revalidate: 300 },
)
