import 'server-only'
import { getPortalBangersPage } from '@/lib/portal/data'
import type { PortalTweet } from '@/lib/portal/types'
import { decodeTweetText } from '@/lib/tweetText'
import drafts from './editorial-2026.json'
import { DAY, type ConversationMapData, type MapAnnotation } from './types'

export function tweetSnippet(text: string) {
  const clean = decodeTweetText(text).replace(/\s+/g, ' ').trim()
  const chars = Array.from(clean)
  if (chars.length <= 72) return clean || 'View tweet'
  const prefix = chars.slice(0, 72).join('')
  const space = prefix.lastIndexOf(' ')
  return (space > 36 ? prefix.slice(0, space) : prefix).trimEnd() + '…'
}

export function annotateTweets(
  tweets: PortalTweet[],
  year: number,
): MapAnnotation[] {
  const start = Date.UTC(year, 0, 1),
    end = Date.UTC(year + 1, 0, 1)
  const rows = Array.from(
    new Map(
      tweets
        .filter((t) => {
          const time = Date.parse(t.createdAt)
          return /^\d+$/.test(t.id) && time >= start && time < end
        })
        .map((t) => [t.id, t]),
    ).values(),
  ).slice(0, 200)
  const byId = new Map(
    rows.map((t, rank) => [t.id, { tweet: t, rank: rank + 1 }]),
  )
  const used = new Set<string>(),
    annotations: MapAnnotation[] = []
  if (year === 2026) {
    for (const draft of drafts) {
      // A title/group is disclosed only when every source is still in the
      // current member-filtered result. Never hydrate from the local export.
      if (!draft.sourceTweetIds.every((id) => byId.has(id))) continue
      const sources = draft.sourceTweetIds
        .map((id) => byId.get(id)!)
        .sort((a, b) => a.rank - b.rank)
      const anchor = sources[0]
      annotations.push({
        id: draft.id,
        label: draft.label,
        kind: draft.kind,
        day: (Date.parse(anchor.tweet.createdAt) - start) / DAY,
        rank: anchor.rank,
        score: anchor.tweet.quoteCount ?? 0,
        tweets: sources.map((s) => s.tweet),
      })
      draft.sourceTweetIds.forEach((id) => used.add(id))
    }
  }
  for (const [id, { tweet, rank }] of Array.from(byId.entries())) {
    if (used.has(id)) continue
    annotations.push({
      id: `tweet-${id}`,
      label: tweetSnippet(tweet.text),
      kind: 'snippet',
      day: (Date.parse(tweet.createdAt) - start) / DAY,
      rank,
      score: tweet.quoteCount ?? 0,
      tweets: [tweet],
    })
  }
  return annotations.sort((a, b) => a.rank - b.rank)
}

export async function loadConversationMap(
  year: number,
): Promise<ConversationMapData> {
  const options = {
    year,
    scope: 'members' as const,
    sort: 'quotes' as const,
    limit: 100,
  }
  const first = await getPortalBangersPage({ ...options, offset: 0 })
  const tweets = [...first.tweets]
  if (
    first.pagination.nextOffset !== null &&
    first.pagination.nextOffset <= 100
  ) {
    const second = await getPortalBangersPage({
      ...options,
      offset: first.pagination.nextOffset,
    })
    tweets.push(...second.tweets)
  }
  const years = first.pagination.yearCounts
    .filter((row) => row.count > 0 && row.year <= new Date().getUTCFullYear())
    .map((row) => row.year)
  return {
    year,
    years: Array.from(new Set([...years, year])).sort((a, b) => a - b),
    annotations: annotateTweets(tweets, year),
  }
}
