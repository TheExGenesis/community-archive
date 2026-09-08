import 'server-only'
import { unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getBirdseyeBangerScores } from './birdseye-bangers'
import { orderBirdseyeSources, type BirdseyePostSort } from './birdseye-order'
import { selectBirdseyeSources } from './birdseye-threads'

// Exact-reference metadata only; full tweet payloads still come from the shared reader.
const sourceMetadata = unstable_cache(
  async (input: string[]) => {
    const ids = Array.from(new Set(input.filter((id) => /^\d{1,20}$/.test(id))))
    const rows: {
      tweet_id: string | null
      username: string | null
      account_id: string | null
      favorite_count: number | null
      reply_to_tweet_id: string | null
      conversation_id: string | null
    }[] = []
    for (let offset = 0; offset < ids.length; offset += 150) {
      const { data, error } = await createServerServiceRoleClient()
        .from('enriched_tweets')
        .select(
          'tweet_id,username,account_id,favorite_count,reply_to_tweet_id,conversation_id',
        )
        .in('tweet_id', ids.slice(offset, offset + 150))
      if (error) throw new Error('Unable to group cited posts')
      rows.push(...(data ?? []))
    }
    return { ids, rows }
  },
  ['birdseye-source-metadata-v3'],
  { revalidate: 300 },
)

export async function getBirdseyeSourceIndex(
  input: string[],
  username: string,
  sort: BirdseyePostSort = 'recent',
) {
  const { ids, rows } = await sourceMetadata(input)
  const index = selectBirdseyeSources(ids, rows, username)
  const eligible = new Set(index.map(({ id }) => id))
  const bangers =
    sort === 'bangers'
      ? await getBirdseyeBangerScores(
          new Map(
            rows.flatMap((row) =>
              row.tweet_id && eligible.has(row.tweet_id)
                ? [[row.tweet_id, row.account_id]]
                : [],
            ),
          ),
        )
      : undefined
  return orderBirdseyeSources(
    index,
    sort,
    new Map(
      rows.flatMap((row) =>
        row.tweet_id ? [[row.tweet_id, row.favorite_count ?? 0]] : [],
      ),
    ),
    bangers,
  )
}
