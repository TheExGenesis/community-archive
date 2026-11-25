import 'server-only'
import { unstable_cache } from 'next/cache'
import { fetchTweetCards } from '@/lib/clickhouseCorpusReads'
import { getBirdseyeBangerScores } from './birdseye-bangers'
import { orderBirdseyeSources, type BirdseyePostSort } from './birdseye-order'
import { selectBirdseyeSources } from './birdseye-threads'

// Exact-reference metadata from the ClickHouse tweet cards; full tweet
// payloads still come from the shared reader. Deleted, opted-out and unknown
// tweets have no card and drop out, as they had no row before.
const sourceMetadata = unstable_cache(
  async (input: string[]) => {
    const ids = Array.from(new Set(input.filter((id) => /^\d{1,20}$/.test(id))))
    const rows = Array.from((await fetchTweetCards(ids)).values(), (card) => ({
      tweet_id: card.tweetId as string | null,
      username: card.username,
      account_id: card.accountId as string | null,
      favorite_count: (Number(card.favoriteCount) || 0) as number | null,
      reply_to_tweet_id: card.replyToTweetId,
      conversation_id: card.conversationId,
    }))
    return { ids, rows }
  },
  ['birdseye-source-metadata-v4'],
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
