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
    .map((strand) => ({
      strand,
      rank: search
        ? [
            `${strand.title} ${strand.mapLabel ?? ''}`,
            strand.text ?? '',
            [strand.username, ...(strand.participants ?? [])].join(' '),
            strand.summary,
          ].findIndex((field) => field.toLowerCase().includes(search))
        : 0,
    }))
    .filter(({ rank }) => rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.strand.rating - a.strand.rating ||
        a.strand.id.localeCompare(b.strand.id),
    )
    .map(({ strand }) => strand)
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
