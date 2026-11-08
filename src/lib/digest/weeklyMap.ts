import { DAY, type MapAnnotation } from '@/lib/conversation-map/types'
import type { PortalTweet } from '@/lib/portal/types'
import { decodeTweetText } from '@/lib/tweetText'
import type { WeeklyDigestContent, WeeklyDigestStory } from './weekly'

/** One colour per weekly story position; see WeeklyConversationMap. */
export const WEEKLY_MAP_STORY_KINDS = [
  'story1',
  'story2',
  'story3',
  'story4',
  'story5',
] as const

/** Story colours in the same order; the map reads them as --map-storyN. */
export const WEEKLY_MAP_COLORS = [
  'hsl(var(--brand))',
  '#b87738',
  '#9684b4',
  '#5f9e7a',
  '#c0697a',
]

export interface WeeklyMapData {
  year: number
  range: [number, number]
  annotations: MapAnnotation[]
  /** Annotation id of each story's lead tweet → its story number (1-based). */
  leaders: Record<string, number>
}

const snippet = (text: string) => {
  const clean = decodeTweetText(text).replace(/\s+/g, ' ').trim()
  const chars = Array.from(clean)
  if (chars.length <= 64) return clean || 'View tweet'
  const prefix = chars.slice(0, 64).join('')
  const space = prefix.lastIndexOf(' ')
  return (space > 32 ? prefix.slice(0, space) : prefix).trimEnd() + '…'
}

const plain = (markdown: string) =>
  markdown.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()

const shortTitle = (title: string) => {
  const clean = plain(title)
  return clean.length <= 70 ? clean : `${clean.slice(0, 69).trimEnd()}…`
}

/**
 * Plot a week's story tweets on the conversation map's axes: one dot per
 * tweet, height = community quotes. Each story's most-quoted tweet carries the
 * story title so the week reads as a set of labelled conversations.
 */
export function weeklyMapData(
  content: WeeklyDigestContent,
  stories: WeeklyDigestStory[] = content.stories,
  options: { titleLabels?: boolean } = {},
): WeeklyMapData {
  const titleLabels = options.titleLabels ?? true
  const year = new Date(`${content.weekStart}T00:00:00Z`).getUTCFullYear()
  const yearStart = Date.UTC(year, 0, 1)
  const weekDay =
    (Date.parse(`${content.weekStart}T00:00:00Z`) - yearStart) / DAY
  // The Monday edition covers Sunday, so the window opens a day early.
  const lo = weekDay - 1
  const hi = weekDay + 7

  const rows: {
    tweet: PortalTweet
    day: number
    kind: string
    story: WeeklyDigestStory
  }[] = []
  const seen = new Set<string>()
  stories.forEach((story) => {
    const position = content.stories.findIndex(
      (item) => item.slug === story.slug,
    )
    const kind = WEEKLY_MAP_STORY_KINDS[position] ?? 'snippet'
    for (const tweet of story.tweets) {
      const day = (Date.parse(tweet.createdAt) - yearStart) / DAY
      if (seen.has(tweet.id) || !(day >= lo && day <= hi)) continue
      seen.add(tweet.id)
      rows.push({ tweet, day, kind, story })
    }
  })

  const leaders = new Set(
    stories.flatMap((story) => {
      const lead = rows
        .filter((row) => row.story === story)
        .sort(
          (a, b) =>
            (b.tweet.quoteCount ?? 0) - (a.tweet.quoteCount ?? 0) ||
            b.tweet.likes - a.tweet.likes,
        )[0]
      return lead ? [lead.tweet.id] : []
    }),
  )
  const ranked = [...rows].sort(
    (a, b) =>
      Number(leaders.has(b.tweet.id)) - Number(leaders.has(a.tweet.id)) ||
      (b.tweet.quoteCount ?? 0) - (a.tweet.quoteCount ?? 0) ||
      b.tweet.likes - a.tweet.likes,
  )
  const annotations: MapAnnotation[] = ranked.map((row, index) => ({
    id: `weekly-${row.tweet.id}`,
    label:
      titleLabels && leaders.has(row.tweet.id)
        ? shortTitle(row.story.title)
        : snippet(row.tweet.text),
    kind: row.kind,
    day: row.day,
    rank: index + 1,
    score: row.tweet.quoteCount ?? 0,
    tweets: [row.tweet],
  }))
  const leaderNumbers: Record<string, number> = {}
  for (const row of rows)
    if (leaders.has(row.tweet.id))
      leaderNumbers[`weekly-${row.tweet.id}`] =
        content.stories.findIndex((item) => item.slug === row.story.slug) + 1
  return { year, range: [lo, hi], annotations, leaders: leaderNumbers }
}
