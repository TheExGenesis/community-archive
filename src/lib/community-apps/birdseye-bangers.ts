import 'server-only'
import { unstable_cache } from 'next/cache'
import { fetchQuoteAuthors } from '@/lib/clickhouseCorpusReads'
import { getAppPolicy } from './data'

// Quote relations for this topic only, with each quote's author, from the
// ClickHouse quote-authors route; never loads tweet text. A batch over the
// gateway's 10,000-quote cap is split and re-read, so only a single tweet
// with more than 10,000 quotes is counted from a partial list. Its score is
// then a lower bound, and it still ranks among the top bangers.
const quoteAuthors = unstable_cache(
  async (ids: string[]) => {
    const { quotes, truncatedTweetIds } = await fetchQuoteAuthors(ids)
    if (truncatedTweetIds.length)
      console.warn(
        `Birdseye banger scores are partial for ${truncatedTweetIds.join(', ')}: over 10,000 quotes`,
      )
    return quotes
  },
  ['birdseye-quote-authors-v2'],
  { revalidate: 300 },
)

export async function getBirdseyeBangerScores(
  authors: Map<string, string | null>,
) {
  const rows = await quoteAuthors(Array.from(authors.keys()))
  const policy = await getAppPolicy(
    rows.flatMap(({ username }) => (username ? [username] : [])),
  )
  const quotes = new Map<string, Set<string>>()
  for (const row of rows) {
    const name = row.username?.toLowerCase()
    if (
      !name ||
      !row.accountId ||
      !authors.get(row.quotedTweetId) ||
      row.accountId === authors.get(row.quotedTweetId) ||
      !policy.members.has(name) ||
      policy.blocked.has(name) ||
      policy.blockedIds.has(row.accountId)
    )
      continue
    const ids = quotes.get(row.quotedTweetId) ?? new Set<string>()
    ids.add(row.tweetId)
    quotes.set(row.quotedTweetId, ids)
  }
  return new Map(Array.from(quotes).map(([id, quotes]) => [id, quotes.size]))
}
