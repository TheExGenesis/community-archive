import 'server-only'
import { getStrands } from './data'
import { getStrandTweets } from './strand-tweets'
import type { StrandPageData } from './types'

export async function getStrandPage(
  query: string,
  offset: number,
): Promise<StrandPageData> {
  const { strands } = await getStrands()
  const search = query.trim().slice(0, 120).toLowerCase()
  const filtered = strands
    .filter((strand) =>
      `${strand.title} ${strand.mapLabel ?? ''} ${strand.summary} ${strand.username}`
        .toLowerCase()
        .includes(search),
    )
    .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
  const visible = filtered.slice(offset, offset + 24)
  const tweets = await getStrandTweets(visible.map((s) => s.id))
  return {
    items: visible.map(
      ({ id, title, summary, position, activity, totalPosts }) => ({
        id,
        title,
        summary: summary.split(/\n\n/)[0],
        position,
        activity,
        totalPosts,
        tweet: tweets.get(id),
      }),
    ),
    total: filtered.length,
    nextOffset:
      offset + visible.length < filtered.length
        ? offset + visible.length
        : null,
  }
}
