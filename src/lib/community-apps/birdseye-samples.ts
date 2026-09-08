import 'server-only'
import { unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getStrandTweets } from './strand-tweets'
import type { PortalTweet } from '@/lib/portal/types'

type Candidate = { tweet_id: string | null; favorite_count: number | null }
// Small indexed lookups against only this topic's saved references. Postgres
// supplies ranking metadata, not a second full-text source. TweetCard payloads
// continue to use the configured archive reader and its current opt-out checks.
const rankedIds = unstable_cache(
  async (input: string[], username: string | null) => {
    const ids = Array.from(new Set(input.filter((id) => /^\d{1,20}$/.test(id))))
    const candidates: Candidate[] = []
    for (let offset = 0; offset < ids.length; offset += 150) {
      let query = createServerServiceRoleClient()
        .from('enriched_tweets')
        .select('tweet_id,favorite_count')
        .in('tweet_id', ids.slice(offset, offset + 150))
      if (username)
        query = query.ilike('username', username.replace(/_/g, '\\_'))
      const { data, error } = await query
        .order('favorite_count', { ascending: false, nullsFirst: false })
        .order('tweet_id', { ascending: false })
        .limit(6)
      if (error) throw new Error('Unable to rank cited posts')
      candidates.push(...(data ?? []))
    }
    return candidates
      .sort(
        (a, b) =>
          (b.favorite_count ?? 0) - (a.favorite_count ?? 0) ||
          (b.tweet_id ?? '').localeCompare(a.tweet_id ?? ''),
      )
      .flatMap((row) => (row.tweet_id ? [row.tweet_id] : []))
      .slice(0, 6)
  },
  ['birdseye-cited-likes-v1'],
  { revalidate: 300 },
)

export async function getBirdseyeSamples(ids: string[], username: string) {
  const own = await rankedIds(ids, username)
  const candidates = [...own]
  if (own.length < 2) candidates.push(...(await rankedIds(ids, null)))
  const posts = await getStrandTweets(Array.from(new Set(candidates)))
  return Array.from(posts.values())
    .sort(
      (a, b) =>
        Number(b.username.toLowerCase() === username.toLowerCase()) -
          Number(a.username.toLowerCase() === username.toLowerCase()) ||
        b.likes - a.likes ||
        b.id.localeCompare(a.id),
    )
    .slice(0, 2) as PortalTweet[]
}
