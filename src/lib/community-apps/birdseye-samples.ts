import 'server-only'
import { unstable_cache } from 'next/cache'
import { fetchTweetCards } from '@/lib/clickhouseCorpusReads'
import { getSourceTweets } from './source-tweets'
import type { PortalTweet } from '@/lib/portal/types'

type Cited = { id: string; username: string | null; likes: number }
// Ranking metadata for this topic's saved references only, from the
// ClickHouse tweet cards. TweetCard payloads still come from the shared
// archive reader.
const citedLikes = unstable_cache(
  async (input: string[]): Promise<Cited[]> =>
    Array.from((await fetchTweetCards(input)).values(), (card) => ({
      id: card.tweetId,
      username: card.username,
      likes: Number(card.favoriteCount) || 0,
    })),
  ['birdseye-cited-likes-v2'],
  { revalidate: 300 },
)

async function rankedIds(ids: string[], username: string | null) {
  const name = username?.toLowerCase()
  return (await citedLikes(ids))
    .filter((row) => !name || row.username?.toLowerCase() === name)
    .sort((a, b) => b.likes - a.likes || b.id.localeCompare(a.id))
    .slice(0, 6)
    .map((row) => row.id)
}

export async function getBirdseyeSamples(ids: string[], username: string) {
  const own = await rankedIds(ids, username)
  const candidates = [...own]
  if (own.length < 3) candidates.push(...(await rankedIds(ids, null)))
  const posts = await getSourceTweets(Array.from(new Set(candidates)))
  return Array.from(posts.values())
    .sort(
      (a, b) =>
        Number(b.username.toLowerCase() === username.toLowerCase()) -
          Number(a.username.toLowerCase() === username.toLowerCase()) ||
        b.likes - a.likes ||
        b.id.localeCompare(a.id),
    )
    .slice(0, 3) as PortalTweet[]
}
