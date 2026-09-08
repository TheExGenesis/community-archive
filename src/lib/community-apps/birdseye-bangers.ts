import 'server-only'
import { unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getAppPolicy } from './data'

// Indexed lookups of quote relations for this topic only; never load tweet text.
const quoteAuthors = unstable_cache(
  async (ids: string[]) => {
    const rows: {
      tweet_id: string
      quoted_tweet_id: string
      enriched_tweets: { account_id: string | null; username: string | null }
    }[] = []
    for (let start = 0; start < ids.length; start += 100) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await createServerServiceRoleClient()
          .from('quote_tweets')
          .select(
            'tweet_id,quoted_tweet_id,enriched_tweets!inner(account_id,username)',
          )
          .in('quoted_tweet_id', ids.slice(start, start + 100))
          .order('tweet_id')
          .order('quoted_tweet_id')
          .range(offset, offset + 999)
        if (error) throw new Error('Unable to rank Birdseye bangers')
        rows.push(...(data ?? []))
        if ((data ?? []).length < 1000) break
      }
    }
    return rows
  },
  ['birdseye-quote-authors-v1'],
  { revalidate: 300 },
)

export async function getBirdseyeBangerScores(
  authors: Map<string, string | null>,
) {
  const rows = await quoteAuthors(Array.from(authors.keys()))
  const policy = await getAppPolicy(
    rows.flatMap(({ enriched_tweets }) =>
      enriched_tweets.username ? [enriched_tweets.username] : [],
    ),
  )
  const quotes = new Map<string, Set<string>>()
  for (const row of rows) {
    const author = row.enriched_tweets
    const name = author.username?.toLowerCase()
    if (
      !name ||
      !author.account_id ||
      !authors.get(row.quoted_tweet_id) ||
      author.account_id === authors.get(row.quoted_tweet_id) ||
      !policy.members.has(name) ||
      policy.blocked.has(name) ||
      policy.blockedIds.has(author.account_id)
    )
      continue
    const ids = quotes.get(row.quoted_tweet_id) ?? new Set<string>()
    ids.add(row.tweet_id)
    quotes.set(row.quoted_tweet_id, ids)
  }
  return new Map(Array.from(quotes).map(([id, quotes]) => [id, quotes.size]))
}
