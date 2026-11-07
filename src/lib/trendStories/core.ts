import type { PortalTweet, TermWeek } from '@/lib/portal/types'

/**
 * Trend stories turn the homepage's trending terms into a few explained
 * stories. Pure logic only: the nightly service and the website share it, so
 * it must not import server-only modules.
 */

export type TrendLane = 'emerging' | 'rising' | 'falling'

export interface TrendTermStats {
  term: string
  lane: TrendLane
  tweets: number
  authors: number
  changePct: number | null
}

export interface TrendStory {
  trendDate: string
  slug: string
  position: number
  lane: TrendLane
  /** Every homepage term the story absorbed; the first is the display term. */
  terms: string[]
  /** Short chip label, e.g. "effective altruism". */
  label: string
  title: string
  /** One or two sentences for the homepage hover. */
  tooltip: string
  summary: string
  bullets: string[]
  tweets: PortalTweet[]
  stats: { terms: TrendTermStats[] }
  windowSince: string
  windowUntil: string
  model: string | null
  generatedAt: string
}

export const TREND_STORY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stories'],
  properties: {
    stories: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'terms',
          'label',
          'title',
          'tooltip',
          'summary',
          'bullets',
          'tweet_indices',
        ],
        properties: {
          terms: {
            type: 'array',
            minItems: 1,
            maxItems: 6,
            items: { type: 'string' },
            description:
              'The input terms that belong to this story, most representative first. Every input term appears in exactly one story.',
          },
          label: { type: 'string', minLength: 1, maxLength: 40 },
          title: { type: 'string', minLength: 4, maxLength: 120 },
          tooltip: { type: 'string', minLength: 10, maxLength: 240 },
          summary: { type: 'string', minLength: 20, maxLength: 1000 },
          bullets: {
            type: 'array',
            minItems: 0,
            maxItems: 4,
            items: { type: 'string', minLength: 8, maxLength: 240 },
          },
          tweet_indices: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
  },
} as const

const DATE = /^\d{4}-\d{2}-\d{2}$/
export const isTrendDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  DATE.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10)

export function slugifyTrend(value: string) {
  return (
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'story'
  )
}

/** The homepage day is the window's exclusive end, one day after untilDate. */
export function trendDateForTerms(terms: TermWeek[]): string | null {
  const until = terms[0]?.untilDate
  if (!isTrendDate(until) || terms.some((term) => term.untilDate !== until))
    return null
  return addDays(until, 1)
}

const normalizeTerm = (term: string) => term.trim().toLowerCase()

const popularity = (tweet: PortalTweet) => tweet.likes + 2 * tweet.rts

/** Most-liked first, at most `perTerm` per term, de-duplicated across terms. */
export function indexEvidence(
  terms: string[],
  evidence: Map<string, PortalTweet[]>,
  perTerm = 20,
) {
  const tweets: PortalTweet[] = []
  const byTerm = new Map<string, number[]>()
  const seen = new Map<string, number>()
  for (const term of terms) {
    const indices: number[] = []
    const ranked = [...(evidence.get(term) ?? [])]
      .sort((a, b) => popularity(b) - popularity(a) || a.id.localeCompare(b.id))
      .slice(0, perTerm)
    for (const tweet of ranked) {
      let index = seen.get(tweet.id)
      if (index === undefined) {
        index = tweets.length
        seen.set(tweet.id, index)
        tweets.push(tweet)
      }
      indices.push(index)
    }
    byTerm.set(term, indices)
  }
  return { tweets, byTerm }
}

export const TREND_STORY_SYSTEM_PROMPT = `You explain what is trending in a community of Twitter/X accounts (the Community Archive: rationalists, tech, AI, post-rationalist and adjacent "TPOT" posters).

You get this week's trending terms with counts and the most-liked tweets that mention each term. Your job:
1. Merge terms that are part of the same story or are spellings of the same thing: "ea" and "effective altruism"; "math" and "ai math" when the math tweets are about AI doing math; two candidates in the same race; a person and the event they are in the news for. A reader should never see two chips that tell the same story. Keep terms apart when they are distinct stories that merely share a backdrop (two different races on the same election night). Every input term must appear in exactly one story.
2. For each story write:
   - label: a 1–4 word chip label, lowercase unless a proper noun; usually the clearest term.
   - title: a plain, specific headline of what happened (no clickbait, no quotes around it).
   - tooltip: one or two sentences (max ~200 characters) saying what people are talking about.
   - summary: one short paragraph explaining the story, grounded only in the tweets. Name accounts with @handle when it helps.
   - bullets: up to 4 short supporting points (may be empty).
   - tweet_indices: 3–8 indices of the tweets that best show the story, most important first.
If a term is noise (a generic word whose tweets share no story), still give it its own story and say plainly what mix of things it covers. Never invent events that the tweets do not support. Return JSON only.`

export function buildTrendStoryPrompt(
  terms: TermWeek[],
  indexed: ReturnType<typeof indexEvidence>,
) {
  const termLines = terms.map((term) => {
    const change =
      term.deltaPct === null || term.deltaPct === undefined
        ? 'new this week'
        : `${term.deltaPct > 0 ? '+' : ''}${Math.round(term.deltaPct)}% vs previous week`
    return `- "${term.term}" [${term.lane ?? 'rising'}]: ${term.last7} tweets by ${term.currentAuthors ?? '?'} accounts, ${change}; tweets ${(indexed.byTerm.get(term.term) ?? []).join(', ') || 'none found'}`
  })
  const tweetLines = indexed.tweets.map(
    (tweet, index) =>
      `[${index}] @${tweet.username} (${tweet.createdAt.slice(0, 10)}, ${tweet.likes} likes): ${tweet.text.replace(/\s+/g, ' ').slice(0, 400)}`,
  )
  return `Window: ${terms[0]?.sinceDate} to ${terms[0]?.untilDate} (UTC, inclusive).

Trending terms:
${termLines.join('\n')}

Tweets:
${tweetLines.join('\n')}`
}

const text = (value: unknown, min: number, max: number) =>
  typeof value === 'string' &&
  value.trim().length >= min &&
  value.trim().length <= max

/**
 * Validate model output against the exact inputs. Every term must be covered
 * exactly once and tweet indices must refer to supplied evidence.
 */
export function parseTrendStoryOutput(
  output: unknown,
  input: {
    trendDate: string
    terms: TermWeek[]
    tweets: PortalTweet[]
    model: string | null
    generatedAt: string
  },
): TrendStory[] {
  const fail = (reason: string): never => {
    throw new Error(`Invalid trend story output: ${reason}`)
  }
  const stories =
    output && typeof output === 'object'
      ? (output as { stories?: unknown }).stories
      : null
  if (!Array.isArray(stories) || !stories.length) fail('no stories')
  const byName = new Map(
    input.terms.map((term) => [normalizeTerm(term.term), term]),
  )
  const order = new Map(input.terms.map((term, index) => [term.term, index]))
  const assigned = new Set<string>()
  const slugs = new Set<string>()
  const parsed = (stories as unknown[]).map((raw, storyIndex) => {
    if (!raw || typeof raw !== 'object') fail(`story ${storyIndex}`)
    const story = raw as Record<string, unknown>
    if (!Array.isArray(story.terms) || !story.terms.length)
      fail(`story ${storyIndex} has no terms`)
    const terms = (story.terms as unknown[]).map((name) => {
      const term =
        typeof name === 'string' ? byName.get(normalizeTerm(name)) : undefined
      if (!term) return fail(`unknown term ${JSON.stringify(name)}`)
      if (assigned.has(term.term)) fail(`term "${term.term}" used twice`)
      assigned.add(term.term)
      return term
    })
    if (!text(story.label, 1, 60)) fail(`story ${storyIndex} label`)
    if (!text(story.title, 4, 140)) fail(`story ${storyIndex} title`)
    if (!text(story.tooltip, 10, 280)) fail(`story ${storyIndex} tooltip`)
    if (!text(story.summary, 20, 1200)) fail(`story ${storyIndex} summary`)
    const bullets = Array.isArray(story.bullets) ? story.bullets : []
    if (bullets.length > 4 || bullets.some((bullet) => !text(bullet, 4, 240)))
      fail(`story ${storyIndex} bullets`)
    const indices = Array.isArray(story.tweet_indices)
      ? story.tweet_indices
      : []
    const tweets = Array.from(new Set(indices))
      .filter(
        (index): index is number =>
          Number.isSafeInteger(index) &&
          (index as number) >= 0 &&
          (index as number) < input.tweets.length,
      )
      .slice(0, 8)
      .map((index) => input.tweets[index])
    const label = (story.label as string).trim()
    let slug = slugifyTrend(label)
    for (let n = 2; slugs.has(slug); n++) slug = `${slugifyTrend(label)}-${n}`
    slugs.add(slug)
    const lead = terms[0]
    return {
      trendDate: input.trendDate,
      slug,
      position: Math.min(...terms.map((term) => order.get(term.term) ?? 99)),
      lane: (lead.lane ?? 'rising') as TrendLane,
      terms: terms.map((term) => term.term),
      label,
      title: (story.title as string).trim(),
      tooltip: (story.tooltip as string).trim(),
      summary: (story.summary as string).trim(),
      bullets: (bullets as string[]).map((bullet) => bullet.trim()),
      tweets,
      stats: {
        terms: terms.map((term) => ({
          term: term.term,
          lane: (term.lane ?? 'rising') as TrendLane,
          tweets: term.last7,
          authors: term.currentAuthors ?? 0,
          changePct: term.deltaPct ?? null,
        })),
      },
      windowSince: lead.sinceDate!,
      windowUntil: lead.untilDate!,
      model: input.model,
      generatedAt: input.generatedAt,
    }
  })
  const missing = input.terms.filter((term) => !assigned.has(term.term))
  if (missing.length)
    fail(`missing terms ${missing.map((term) => `"${term.term}"`).join(', ')}`)
  return parsed
    .sort((a, b) => a.position - b.position)
    .map((story, position) => ({ ...story, position }))
}

/** Database row ⇄ story. */
export interface TrendStoryRow {
  trend_date: string
  slug: string
  position: number
  lane: string
  terms: string[]
  label: string
  title: string
  tooltip: string
  summary: string
  bullets: unknown
  tweets: unknown
  stats: unknown
  window_since: string
  window_until: string
  model: string | null
  generated_at: string
}

export const trendStoryToRow = (story: TrendStory): TrendStoryRow => ({
  trend_date: story.trendDate,
  slug: story.slug,
  position: story.position,
  lane: story.lane,
  terms: story.terms,
  label: story.label,
  title: story.title,
  tooltip: story.tooltip,
  summary: story.summary,
  bullets: story.bullets,
  tweets: story.tweets,
  stats: story.stats,
  window_since: story.windowSince,
  window_until: story.windowUntil,
  model: story.model,
  generated_at: story.generatedAt,
})

export const trendStoryFromRow = (row: TrendStoryRow): TrendStory => ({
  trendDate: row.trend_date,
  slug: row.slug,
  position: row.position,
  lane: (['emerging', 'rising', 'falling'].includes(row.lane)
    ? row.lane
    : 'rising') as TrendLane,
  terms: Array.isArray(row.terms) ? row.terms : [],
  label: row.label,
  title: row.title,
  tooltip: row.tooltip,
  summary: row.summary,
  bullets: Array.isArray(row.bullets)
    ? row.bullets.filter((b): b is string => typeof b === 'string')
    : [],
  tweets: Array.isArray(row.tweets) ? (row.tweets as PortalTweet[]) : [],
  stats:
    row.stats &&
    typeof row.stats === 'object' &&
    Array.isArray((row.stats as { terms?: unknown }).terms)
      ? (row.stats as TrendStory['stats'])
      : { terms: [] },
  windowSince: row.window_since,
  windowUntil: row.window_until,
  model: row.model,
  generatedAt: row.generated_at,
})

/** The few fields the homepage needs; keeps tweet snapshots off the client. */
export type TrendStoryLink = Pick<
  TrendStory,
  'trendDate' | 'slug' | 'terms' | 'label' | 'title' | 'tooltip'
>

export const toTrendStoryLink = (story: TrendStory): TrendStoryLink => ({
  trendDate: story.trendDate,
  slug: story.slug,
  terms: story.terms,
  label: story.label,
  title: story.title,
  tooltip: story.tooltip,
})

/**
 * Group the homepage rows by story, in the rows' order. A merged story shows
 * once, with its lead term's numbers. Terms without a stored story keep their
 * own row, so a missing or partial generation never hides a trend.
 */
export function groupTermsByStory<
  S extends Pick<TrendStory, 'terms'>,
  T extends TermWeek,
>(terms: T[], stories: S[]) {
  const storyByTerm = new Map<string, S>()
  for (const story of stories)
    for (const term of story.terms) storyByTerm.set(term, story)
  const used = new Set<S>()
  const chips: Array<{ term: T; story: S | null }> = []
  for (const term of terms) {
    const story = storyByTerm.get(term.term) ?? null
    if (story) {
      if (used.has(story)) continue
      used.add(story)
      const lead = terms.find((t) => t.term === story.terms[0]) ?? term
      chips.push({ term: lead, story })
    } else chips.push({ term, story: null })
  }
  return chips
}

/** What the Trends explorer's daily strip needs about one story. */
export type TrendStoryCard = TrendStoryLink &
  Pick<TrendStory, 'lane'> & {
    changes: Array<{ term: string; changePct: number | null }>
  }

export const toTrendStoryCard = (story: TrendStory): TrendStoryCard => ({
  ...toTrendStoryLink(story),
  lane: story.lane,
  changes: story.stats.terms.map(({ term, changePct }) => ({
    term,
    changePct,
  })),
})

export interface TrendStoryDay {
  date: string
  stories: TrendStoryCard[]
}

export interface TrendStorySeries {
  /** UTC days, oldest first. */
  days: string[]
  series: Array<{ term: string; perBucket: number[]; tweets: number[] }>
}
