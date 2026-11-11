import type { PortalTweet } from '@/lib/portal/types'
import { classifyDigestTitle, type DigestPromptCorpusRow } from './generation'
import type {
  DigestEditionContent,
  DigestStory,
  DigestTitleKind,
} from './types'

/**
 * Weekly Digest: weaves the published daily stories of one Monday–Sunday week
 * into a short set of weekly stories, and links them to the previous (at most
 * two) weekly digests when a story genuinely continues.
 *
 * The weekly digest is built only from already published daily editions. It
 * never reads ClickHouse or re-ranks tweets, so every claim stays traceable to
 * a daily story that an editor could already see.
 */

export const WEEKLY_DIGEST_MAX_PRIOR_WEEKS = 2
export const WEEKLY_SUMMARY_MAX_CHARS = 200
export const WEEKLY_DEK_MAX_CHARS = 170
export const WEEKLY_MAX_STORIES = 5
/** At most this many weekly stories may come only from "AI news" daily stories. */
export const WEEKLY_MAX_AI_STORIES = 3
export const WEEKLY_MAX_TREND_TERMS = 3
export const WEEKLY_TITLE_MAX_CHARS = 90
export const WEEKLY_SUBTITLE_MAX_CHARS = 200
/** Validation allows a little slack over the prompt's target. */
const WEEKLY_SUBTITLE_HARD_MAX = 240
export const WEEKLY_MAX_FEATURED = 2

export const WEEKLY_STORY_KINDS = ['ongoing', 'major'] as const
export type WeeklyStoryKind = (typeof WEEKLY_STORY_KINDS)[number]

/** One published daily edition, as consumed by the weekly digest. */
export interface WeeklySourceEdition {
  digestDate: string
  issueNumber: number | null
  content: DigestEditionContent
}

export interface WeeklyDailyStoryRef {
  digestDate: string
  slug: string
  title: string
}

export interface WeeklyContinuityRef {
  weekStart: string
  slug: string
  title: string
}

/** A short piece of commentary followed by the tweets it introduces. */
export interface WeeklyStorySegment {
  commentary: string
  tweetIds: string[]
}

/** Daily word-trend counts frozen when the edition was published. */
export interface WeeklyTrendSeries {
  term: string
  /** Tweets matching the term, one entry per day in `WeeklyTrends.days`. */
  tweets: number[]
  /** Matches per 100k archived tweets that day; null where the corpus has no data. */
  per100k: (number | null)[]
}

export interface WeeklyTrends {
  /** UTC days covered, ascending (the week before and the week itself). */
  days: string[]
  series: WeeklyTrendSeries[]
  /** Terms the daily editions froze as rising or falling during the week. */
  weekTerms: string[]
}

export interface WeeklyDigestStory {
  slug: string
  kind: WeeklyStoryKind
  title: string
  /** True when the whole title is one exact excerpt of a story tweet. */
  titleIsQuote: boolean
  titleKind: DigestTitleKind
  /** About three lines for the front page, like a daily story's subtitle. */
  subtitle: string
  /** One paragraph about the story as a whole, for the story page. */
  overview: string
  /** What this week adds to a story from a previous weekly digest. */
  continuityNote: string
  continuesFrom: WeeklyContinuityRef[]
  dailyStories: WeeklyDailyStoryRef[]
  /** Distinct daily dates the story appeared on, ascending. */
  days: string[]
  /** Commentary interleaved with the story's tweets, in reading order. */
  segments: WeeklyStorySegment[]
  /** Every banger from the cited daily stories, copied from the daily editions. */
  tweets: PortalTweet[]
  /** The one or two tweets shown with the story on the front page. */
  featuredTweetIds: string[]
  /** Words whose daily trend lines are shown beside the story. */
  trendTerms: string[]
}

export interface WeeklyAlsoNotable {
  line: string
  dailyStory: WeeklyDailyStoryRef
}

export interface WeeklyDigestContent {
  weekStart: string
  weekEnd: string
  generatedAt: string
  /** One-line subtitle that conveys the week's flavour, not its contents. */
  dek: string
  executiveSummary: string[]
  stories: WeeklyDigestStory[]
  alsoNotable: WeeklyAlsoNotable[]
  /** Absent until the publisher freezes the analytics series. */
  trends?: WeeklyTrends
  source: {
    editionDates: string[]
    missingDates: string[]
    dailyStoryCount: number
    priorWeekStarts: string[]
  }
}

export const WEEKLY_DIGEST_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dek', 'executive_summary', 'stories', 'also_notable'],
  properties: {
    dek: { type: 'string', minLength: 30, maxLength: 200 },
    executive_summary: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 35, maxLength: 220 },
    },
    stories: {
      type: 'array',
      minItems: 3,
      maxItems: WEEKLY_MAX_STORIES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'kind',
          'title',
          'subtitle',
          'featured_tweet_ids',
          'overview',
          'daily_refs',
          'continues_from',
          'continuity_note',
          'segments',
          'trend_terms',
        ],
        properties: {
          kind: { type: 'string', enum: WEEKLY_STORY_KINDS },
          title: { type: 'string', minLength: 4, maxLength: 120 },
          subtitle: { type: 'string', minLength: 40, maxLength: 260 },
          featured_tweet_ids: {
            type: 'array',
            minItems: 1,
            maxItems: WEEKLY_MAX_FEATURED,
            items: { type: 'string', minLength: 1, maxLength: 30 },
          },
          overview: { type: 'string', minLength: 80, maxLength: 600 },
          daily_refs: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            items: { type: 'string', minLength: 3, maxLength: 20 },
          },
          continues_from: {
            type: 'array',
            maxItems: 4,
            items: { type: 'string', minLength: 3, maxLength: 20 },
          },
          continuity_note: { type: 'string', maxLength: 400 },
          segments: {
            type: 'array',
            minItems: 1,
            maxItems: 6,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['commentary', 'tweet_ids'],
              properties: {
                commentary: { type: 'string', minLength: 20, maxLength: 320 },
                tweet_ids: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 4,
                  items: { type: 'string', minLength: 1, maxLength: 30 },
                },
              },
            },
          },
          trend_terms: {
            type: 'array',
            maxItems: WEEKLY_MAX_TREND_TERMS,
            items: { type: 'string', minLength: 2, maxLength: 40 },
          },
        },
      },
    },
    also_notable: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['daily_ref', 'line'],
        properties: {
          daily_ref: { type: 'string', minLength: 3, maxLength: 20 },
          line: { type: 'string', minLength: 12, maxLength: 200 },
        },
      },
    },
  },
} as const

export const WEEKLY_DIGEST_SYSTEM_PROMPT = `You are the editor of the Community Archive Weekly Digest. Every day the Daily Digest publishes three to five stories about what the Community Archive's corner of Twitter/X was talking about. Once a week you read all of that week's daily stories and write the weekly edition: the few stories a reader who skipped every daily edition most needs. The weekly edition is led by the community's own tweets; your text is short connective commentary between them.

SELECTING STORIES
Pick exactly ${WEEKLY_MAX_STORIES} weekly stories (fewer only if the week has fewer qualifying stories). Two kinds earn a place:
- "major": the week's most important or most engaged-with developments, even if they were covered on a single day and briefly. Weigh real-world stakes and community engagement (likes, quote counts, how many community members took part).
- "ongoing": a story that returned on two or more days of the week, consecutive or not, because the same event, actor, claim, release, or debate kept developing. An ongoing story must cite daily stories from at least two different dates.
Keep the edition varied. At most ${WEEKLY_MAX_AI_STORIES} stories may be built only from "AI news" daily stories; when the week has strong culture, news, meme, joke, opportunity or community stories, include at least one or two of them even if an AI story had slightly more engagement. Order stories by importance to the reader, not chronologically.

BUNDLING DAILY STORIES
Only put several daily stories in one weekly story when they share a concrete subject: the same event, the same people or organisation, the same release or paper, the same claim being argued over, or a direct reply/response. A shared broad theme ("AI safety", "elections", "launches", "the community") is NOT enough; such stories stay separate or are left out. When a weekly story cites more than one daily story and the link is not obvious from the events themselves, the overview must say plainly what links them (who/what is common and how one led to or answered the other).

CONTINUITY WITH PREVIOUS WEEKS
You also get up to two previous weekly digests. If a weekly story genuinely continues one of their stories (same concrete subject, as above), list those stories' refs in "continues_from" and write "continuity_note": one sentence on what is new this week compared with before. Check every selected story against every previous weekly story before deciding; a returning subject from two weeks ago counts even if last week skipped it. Do not link stories that are only thematically similar. A story that merely repeats last week with nothing new should not be selected. Leave both empty when there is no continuation.

PEOPLE
Refer to people by their Twitter/X @handle exactly as it appears in the tweets' "username" (for example @sama), never by display name. Organisations without a handle in the tweets keep their plain name. Readers can hover a handle to see the profile.

WRITING
- Ground every claim in the supplied daily stories and tweets. Do not add outside knowledge, dates, or numbers.
- title: ONE line of at most ${WEEKLY_TITLE_MAX_CHARS} characters that points the reader at the story. Strongly prefer an exact excerpt copied character for character from one of the story's tweets: the line people kept quoting, the claim at the centre, the reaction that captures the mood. The quote is a pointer to the broader story, not a summary of it, so it does not need to cover every part. Do not add quotation marks (the page adds them). Do NOT compose titles from several parts: no " / " joins, no "X, Y and Z" chains, no "A, as B says C". If no single excerpt works, write one short plain headline about the story's core thread. A quote that means nothing without the story ("whew", "Anyway, it's Wednesday.") is not a title.
- subtitle: one or two short, direct sentences (at most ${WEEKLY_SUBTITLE_MAX_CHARS} characters) under the title on the week page, written like a daily-digest summary bullet: who did or said what, as close to the tweets' own words as possible. Quote two to six telling words inline where they carry the point, and attribute them by @handle. Start with the actor or the event, not with scene-setting ("The week's dominant thread began…", "What started as…", "By the weekend…"); no story arcs, no evaluative filler ("captured the mood", "sparked debate"). Good: "@mattvanswol couldn't believe 'Democrats are winning EVERYTHING' as Texas, Georgia and South Carolina were projected blue; @JDVance blamed 'the war'." Bad: "Election Day jokes gave way to projections, and the timeline argued over blame.
- featured_tweet_ids: the ${WEEKLY_MAX_FEATURED} tweets (or one, if the story has one) that best show the story on the week page, chosen from the story's tweets. Prefer the tweet the title quotes plus the strongest reaction or development.
- overview: one paragraph (two to four sentences) about the story as a whole: what happened across the week, who drove it, and why it mattered to the community. When the story bundles several daily stories, weave in what connects them unless it is self-evident. No bullet lists.
- segments: walk the reader through the story's tweets in a sensible order (usually chronological). Each segment is one or two short sentences of commentary (context, what the tweet adds, how people reacted) followed by the ids of the one to four tweets it introduces. Choose tweets only from the "tweets" of the daily stories this weekly story cites, and use each tweet at most once. Do not restate what the tweet says; say why it matters or what it answered. Any tweet you skip is still shown after the segments, so prefer a few strong segments over covering everything.
- trend_terms: up to ${WEEKLY_MAX_TREND_TERMS} single words or short phrases (lower case, as people would actually type them in tweets) whose daily usage would show this story in the archive, such as a product, person, place or coined phrase central to it. Prefer specific terms ("sora", "polymarket") over generic ones ("ai", "model"). Leave empty when nothing distinctive fits.
- Dek: one sentence under the week's date, roughly 120 to ${WEEKLY_DEK_MAX_CHARS} characters,, that goes straight into the week's biggest moments. Build it from the tweets' own words: quote short phrases exactly, in quotation marks, and say plainly whose they are or what they were about. Do not open with "A week", "This week", "The week" or any framing about the week itself; start with the first thing that happened or was said. No metaphors, wordplay, mood-setting or invented imagery ("sprang leaks", "the captain's final bow"); no @handles; no colon-separated lists. Good shape (invented example): "A lab said its model 'solved the conjecture outright'; the city council voted to 'pause every new data center'; a bakery's sourdough post 'broke the timeline.'" Bad shape: "A week of machines solving puzzles and bread taking over."
- Executive summary: exactly three bullet sentences a reader can understand without opening anything. Aim for about 150 characters each and never exceed 200. Lead each bullet with one story; add a second only if it fits in a short clause. Prefer naming fewer stories clearly over cramming. No compressed noun piles, no unexplained jargon or product names without saying what they are.
- "also_notable": up to 6 one-line mentions of daily stories that did not make the weekly cut but are worth a click. Each line must be understandable on its own.
- Each daily ref may appear in at most one weekly story, and not also in also_notable.

Return one JSON object that matches the schema. No Markdown fences or prose outside the JSON.`

const MONDAY = 1

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** Monday (UTC date) of the week containing `date`. */
export function weekStartFor(date: string): string {
  const value = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(value.getTime())) throw new Error(`Invalid date: ${date}`)
  const offset = (value.getUTCDay() - MONDAY + 7) % 7
  return addDays(date, -offset)
}

export function weekDates(weekStart: string): string[] {
  if (weekStartFor(weekStart) !== weekStart) {
    throw new Error(`${weekStart} is not a Monday`)
  }
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekday = (date: string) =>
  WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]

/** The in-progress week: its daily editions so far, before the weekly one. */
export const CURRENT_WEEK_PATH = '/digest/week/current'

export const dailyRef = (digestDate: string, storyIndex: number) =>
  `${digestDate}#${storyIndex + 1}`

export const weeklyRef = (weekStart: string, storyIndex: number) =>
  `W${weekStart}#${storyIndex + 1}`

const clip = (value: string, length: number) =>
  value.length <= length ? value : `${value.slice(0, length - 1)}…`

const storyEngagement = (story: DigestStory) => {
  const bangers = story.bangers ?? []
  return {
    banger_count: bangers.length,
    commentary_count: story.commentary?.length ?? 0,
    reply_count: story.replyCount ?? 0,
    total_banger_likes: bangers.reduce((sum, tweet) => sum + tweet.likes, 0),
    total_community_quotes: bangers.reduce(
      (sum, tweet) => sum + (tweet.quoteCount ?? 0),
      0,
    ),
    community_authored_bangers: bangers.filter(
      (tweet) => tweet.communityAuthored,
    ).length,
  }
}

export function renderWeeklyDigestPrompt(input: {
  weekStart: string
  editions: WeeklySourceEdition[]
  priorWeeks: WeeklyDigestContent[]
}): string {
  const dates = weekDates(input.weekStart)
  const editions = sortedWeekEditions(input.weekStart, input.editions)
  const present = new Set(editions.map(({ digestDate }) => digestDate))
  const missing = dates.filter((date) => !present.has(date))

  const days = editions.map(({ digestDate, content }) => ({
    digest_date: digestDate,
    weekday: weekday(digestDate),
    executive_summary: content.executiveSummary,
    stories: content.stories.map((story, index) => ({
      ref: dailyRef(digestDate, index),
      category: story.category ?? null,
      title: story.title,
      subtitle: story.subtitle,
      bullets: story.bullets,
      editorial_note: story.editorialNote ?? null,
      ...storyEngagement(story),
      tweets: (story.bangers ?? []).map((tweet) => ({
        id: tweet.id,
        username: tweet.username,
        posted: tweet.createdAt,
        likes: tweet.likes,
        community_quotes: tweet.quoteCount ?? 0,
        text: clip(tweet.text, 400),
      })),
    })),
  }))

  const prior = priorWeeksFor(input.weekStart, input.priorWeeks).map(
    (week) => ({
      week_start: week.weekStart,
      week_end: week.weekEnd,
      executive_summary: week.executiveSummary,
      stories: week.stories.map((story, index) => ({
        ref: weeklyRef(week.weekStart, index),
        kind: story.kind,
        title: story.title,
        overview: story.overview,
        days: story.days,
      })),
    }),
  )

  return [
    `WEEK: Monday ${input.weekStart} to Sunday ${dates[6]}.`,
    missing.length
      ? `No published daily digest exists for: ${missing.join(', ')}. Do not speculate about those days.`
      : 'A daily digest was published for every day of the week.',
    '',
    "THIS WEEK'S DAILY STORIES",
    JSON.stringify(days, null, 2),
    '',
    prior.length
      ? `PREVIOUS WEEKLY DIGESTS (MOST RECENT FIRST, FOR CONTINUITY ONLY)\n${JSON.stringify(prior, null, 2)}`
      : 'PREVIOUS WEEKLY DIGESTS: none. Leave every continues_from empty.',
    '',
    'Daily refs look like "2026-10-27#2" (date, story number). Weekly refs look like "W2026-10-19#1". Use only refs that appear above.',
  ].join('\n')
}

function sortedWeekEditions(
  weekStart: string,
  editions: WeeklySourceEdition[],
): WeeklySourceEdition[] {
  const dates = new Set(weekDates(weekStart))
  const byDate = new Map<string, WeeklySourceEdition>()
  for (const edition of editions) {
    if (!dates.has(edition.digestDate)) continue
    if (byDate.has(edition.digestDate)) {
      throw new Error(`Two editions supplied for ${edition.digestDate}`)
    }
    byDate.set(edition.digestDate, edition)
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.digestDate.localeCompare(b.digestDate),
  )
}

/** The (at most two) weekly digests immediately before `weekStart`, newest first. */
export function priorWeeksFor(
  weekStart: string,
  weeks: WeeklyDigestContent[],
): WeeklyDigestContent[] {
  const wanted = Array.from(
    { length: WEEKLY_DIGEST_MAX_PRIOR_WEEKS },
    (_, index) => addDays(weekStart, -7 * (index + 1)),
  )
  return wanted
    .map((start) => weeks.find((week) => week.weekStart === start))
    .filter((week): week is WeeklyDigestContent => Boolean(week))
}

const slugify = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"“”]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '') || 'story'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  return value.trim()
}

const requireStrings = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  return value.map((item, index) => requireString(item, `${field}[${index}]`))
}

/**
 * Validate a model response against the week's real refs and turn it into
 * stored content. Every error message is phrased so it can be handed back to
 * the model as a repair instruction.
 */
export function assembleWeeklyDigestContent(input: {
  weekStart: string
  editions: WeeklySourceEdition[]
  priorWeeks: WeeklyDigestContent[]
  modelOutput: unknown
  generatedAt?: string
}): WeeklyDigestContent {
  const dates = weekDates(input.weekStart)
  const editions = sortedWeekEditions(input.weekStart, input.editions)
  if (editions.length === 0) {
    throw new Error(`No published daily digests for week ${input.weekStart}`)
  }
  const prior = priorWeeksFor(input.weekStart, input.priorWeeks)

  const daily = new Map<string, { digestDate: string; story: DigestStory }>()
  for (const { digestDate, content } of editions) {
    content.stories.forEach((story, index) => {
      daily.set(dailyRef(digestDate, index), { digestDate, story })
    })
  }
  const weekly = new Map<string, WeeklyContinuityRef>()
  for (const week of prior) {
    week.stories.forEach((story, index) => {
      weekly.set(weeklyRef(week.weekStart, index), {
        weekStart: week.weekStart,
        slug: story.slug,
        title: story.title,
      })
    })
  }

  const output = input.modelOutput
  if (!isRecord(output)) throw new Error('Response must be a JSON object')
  const dek =
    typeof output.dek === 'string' ? output.dek.replace(/\s+/g, ' ').trim() : ''
  if (!dek) throw new Error('dek must be one sentence')
  if (dek.length > WEEKLY_DEK_MAX_CHARS) {
    throw new Error(
      `dek is ${dek.length} characters; rewrite it as one sentence of at most ${WEEKLY_DEK_MAX_CHARS} characters built from short quoted phrases`,
    )
  }
  if (/^(a|this|the|one)\s+week\b/i.test(dek)) {
    throw new Error(
      'dek opens with framing about the week; start with the first thing that happened or was said, quoting the tweets',
    )
  }
  const executiveSummary = requireStrings(
    output.executive_summary,
    'executive_summary',
  )
  if (executiveSummary.length !== 3) {
    throw new Error('executive_summary must contain exactly three bullets')
  }
  const longBullets = executiveSummary
    .map((line, index) => ({ index, length: line.length }))
    .filter(({ length }) => length > WEEKLY_SUMMARY_MAX_CHARS)
  if (longBullets.length > 0) {
    throw new Error(
      longBullets
        .map(
          ({ index, length }) =>
            `executive_summary[${index}] is ${length} characters; rewrite it as one plain sentence of at most ${WEEKLY_SUMMARY_MAX_CHARS} characters, dropping secondary stories rather than compressing them`,
        )
        .join('; '),
    )
  }
  if (!Array.isArray(output.stories) || output.stories.length < 3) {
    throw new Error('stories must contain at least three weekly stories')
  }

  const errors: string[] = []
  const usedDaily = new Map<string, number>()
  const slugCounts = new Map<string, number>()
  const aiStories: number[] = []

  const stories: WeeklyDigestStory[] = output.stories.map((raw, index) => {
    const label = `stories[${index}]`
    if (!isRecord(raw)) throw new Error(`${label} must be an object`)
    const kind = requireString(raw.kind, `${label}.kind`) as WeeklyStoryKind
    if (!WEEKLY_STORY_KINDS.includes(kind)) {
      errors.push(
        `${label}.kind must be one of ${WEEKLY_STORY_KINDS.join(', ')}`,
      )
    }
    const rawTitle = requireString(raw.title, `${label}.title`)
      .replace(/^["\u201c\u2018']+|["\u201d\u2019']+$/g, '')
      .trim()
    const subtitle = requireString(raw.subtitle ?? '', `${label}.subtitle`)
    const featuredRaw = requireStrings(
      raw.featured_tweet_ids ?? [],
      `${label}.featured_tweet_ids`,
    )
    const overview = requireString(raw.overview, `${label}.overview`)
    const continuityNote = requireString(
      raw.continuity_note ?? '',
      `${label}.continuity_note`,
    )
    const refs = Array.from(
      new Set(requireStrings(raw.daily_refs, `${label}.daily_refs`)),
    )
    const continuesFromRefs = Array.from(
      new Set(
        requireStrings(raw.continues_from ?? [], `${label}.continues_from`),
      ),
    )
    const trendTerms = Array.from(
      new Set(
        requireStrings(raw.trend_terms ?? [], `${label}.trend_terms`)
          .map((term) => term.toLowerCase().replace(/\s+/g, ' '))
          .filter(Boolean),
      ),
    ).slice(0, WEEKLY_MAX_TREND_TERMS)

    const dailyStories: WeeklyDailyStoryRef[] = []
    const tweets: PortalTweet[] = []
    const days = new Set<string>()
    const categories: (string | null)[] = []
    for (const ref of refs) {
      const found = daily.get(ref)
      if (!found) {
        errors.push(`${label}.daily_refs contains unknown ref ${ref}`)
        continue
      }
      const previous = usedDaily.get(ref)
      if (previous !== undefined) {
        errors.push(
          `daily ref ${ref} is used by both stories[${previous}] and ${label}; give it to one story`,
        )
      }
      usedDaily.set(ref, index)
      days.add(found.digestDate)
      categories.push(found.story.category ?? null)
      dailyStories.push({
        digestDate: found.digestDate,
        slug: found.story.slug,
        title: found.story.title,
      })
      for (const tweet of found.story.bangers ?? []) {
        if (!tweets.some(({ id }) => id === tweet.id)) tweets.push(tweet)
      }
    }
    dailyStories.sort((a, b) => a.digestDate.localeCompare(b.digestDate))
    if (categories.length > 0 && categories.every((c) => c === 'AI news')) {
      aiStories.push(index)
    }

    if (kind === 'ongoing' && days.size < 2) {
      errors.push(
        `${label} is "ongoing" but cites daily stories from only one date; cite at least two dates or mark it "major"`,
      )
    }

    const tweetIds = new Set(tweets.map(({ id }) => id))
    const placed = new Set<string>()
    const rawSegments = Array.isArray(raw.segments) ? raw.segments : []
    if (rawSegments.length === 0) {
      errors.push(`${label}.segments must contain at least one segment`)
    }
    const segments: WeeklyStorySegment[] = rawSegments.flatMap(
      (segment, segmentIndex) => {
        const segmentLabel = `${label}.segments[${segmentIndex}]`
        if (!isRecord(segment)) {
          errors.push(`${segmentLabel} must be an object`)
          return []
        }
        const commentary = requireString(
          segment.commentary,
          `${segmentLabel}.commentary`,
        )
        const ids = requireStrings(
          segment.tweet_ids,
          `${segmentLabel}.tweet_ids`,
        )
        for (const id of ids) {
          if (!tweetIds.has(id)) {
            errors.push(
              `${segmentLabel}.tweet_ids contains ${id}, which is not a tweet of the daily stories this weekly story cites`,
            )
          } else if (placed.has(id)) {
            errors.push(
              `${segmentLabel}.tweet_ids repeats tweet ${id}; use each tweet once`,
            )
          }
          placed.add(id)
        }
        return [{ commentary, tweetIds: ids.filter((id) => tweetIds.has(id)) }]
      },
    )

    if (rawTitle.length > WEEKLY_TITLE_MAX_CHARS) {
      errors.push(
        `${label}.title is ${rawTitle.length} characters; use one line of at most ${WEEKLY_TITLE_MAX_CHARS}, ideally an exact excerpt of one tweet`,
      )
    }
    if (/\s\/\s/.test(rawTitle)) {
      errors.push(
        `${label}.title joins several parts with " / "; use one excerpt or one plain headline`,
      )
    }
    if (subtitle.length < 40 || subtitle.length > WEEKLY_SUBTITLE_HARD_MAX) {
      errors.push(
        `${label}.subtitle is ${subtitle.length} characters; write one or two direct sentences of at most ${WEEKLY_SUBTITLE_MAX_CHARS}: who did or said what, quoting a few telling words`,
      )
    }
    const featuredTweetIds = Array.from(new Set(featuredRaw)).slice(
      0,
      WEEKLY_MAX_FEATURED,
    )
    if (featuredTweetIds.length === 0) {
      errors.push(`${label}.featured_tweet_ids must name at least one tweet`)
    }
    for (const id of featuredTweetIds) {
      if (!tweetIds.has(id)) {
        errors.push(
          `${label}.featured_tweet_ids contains ${id}, which is not a tweet of the daily stories this weekly story cites`,
        )
      }
    }
    const corpus: DigestPromptCorpusRow[] = tweets.map((tweet, tweetIndex) => ({
      index: tweetIndex,
      kind: 'banger',
      parentBangerIndex: null,
      tweetId: tweet.id,
      tweet,
    }))
    const classified = classifyDigestTitle(rawTitle, corpus)
    const title = classified.title

    const continuesFrom: WeeklyContinuityRef[] = []
    for (const ref of continuesFromRefs) {
      const found = weekly.get(ref)
      if (!found) {
        errors.push(
          `${label}.continues_from contains unknown weekly ref ${ref}`,
        )
      } else {
        continuesFrom.push(found)
      }
    }
    if (continuesFrom.length > 0 && continuityNote.length < 20) {
      errors.push(
        `${label} continues an earlier weekly story, so "continuity_note" must say what is new this week`,
      )
    }

    const baseSlug = slugify(title)
    const occurrence = (slugCounts.get(baseSlug) ?? 0) + 1
    slugCounts.set(baseSlug, occurrence)

    return {
      slug: occurrence === 1 ? baseSlug : `${baseSlug}-${occurrence}`,
      kind,
      title,
      titleIsQuote: classified.kind === 'quote',
      titleKind: classified.kind,
      subtitle,
      overview,
      continuityNote: continuesFrom.length > 0 ? continuityNote : '',
      continuesFrom,
      dailyStories,
      days: Array.from(days).sort(),
      segments,
      tweets,
      featuredTweetIds: featuredTweetIds.filter((id) => tweetIds.has(id)),
      trendTerms,
    }
  })

  if (stories.length > WEEKLY_MAX_STORIES) {
    errors.push(
      `stories has ${stories.length} entries; keep at most ${WEEKLY_MAX_STORIES}`,
    )
  }
  if (aiStories.length > WEEKLY_MAX_AI_STORIES) {
    errors.push(
      `stories ${aiStories.map((i) => `[${i}]`).join(', ')} are all built only from "AI news" daily stories; keep at most ${WEEKLY_MAX_AI_STORIES} and replace the rest with the strongest non-AI stories of the week`,
    )
  }

  const alsoNotable: WeeklyAlsoNotable[] = []
  const rawAlso = Array.isArray(output.also_notable) ? output.also_notable : []
  rawAlso.forEach((raw, index) => {
    const label = `also_notable[${index}]`
    if (!isRecord(raw)) {
      errors.push(`${label} must be an object`)
      return
    }
    const ref = requireString(raw.daily_ref, `${label}.daily_ref`)
    const found = daily.get(ref)
    if (!found) {
      errors.push(`${label}.daily_ref contains unknown ref ${ref}`)
      return
    }
    if (usedDaily.has(ref)) {
      errors.push(`${label} repeats ${ref}, which is already in a weekly story`)
      return
    }
    alsoNotable.push({
      line: requireString(raw.line, `${label}.line`),
      dailyStory: {
        digestDate: found.digestDate,
        slug: found.story.slug,
        title: found.story.title,
      },
    })
  })

  if (errors.length > 0) throw new Error(errors.join('; '))

  const present = new Set(editions.map(({ digestDate }) => digestDate))
  return {
    weekStart: input.weekStart,
    weekEnd: dates[6],
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dek,
    executiveSummary,
    stories,
    alsoNotable,
    source: {
      editionDates: Array.from(present).sort(),
      missingDates: dates.filter((date) => !present.has(date)),
      dailyStoryCount: daily.size,
      priorWeekStarts: prior.map(({ weekStart }) => weekStart),
    },
  }
}

/** Plain Markdown rendering, used for local review and future email/Substack delivery. */
export function weeklyDigestToMarkdown(
  content: WeeklyDigestContent,
  siteUrl = 'https://www.community-archive.org',
): string {
  const lines = [
    `# Community Archive Weekly — ${content.weekStart} to ${content.weekEnd}`,
    '',
    ...(content.dek ? [`*${content.dek}*`, ''] : []),
    ...content.executiveSummary.map((line) => `- ${line}`),
    '',
  ]
  for (const story of content.stories) {
    lines.push(
      `## ${story.titleIsQuote ? `\u201c${story.title}\u201d` : story.title}`,
      '',
      `*${story.kind === 'ongoing' ? `Ongoing · ${story.days.length} days` : 'Major'}* — ${story.subtitle}`,
      '',
      story.overview,
      '',
    )
    for (const segment of story.segments) {
      lines.push(segment.commentary, '')
      for (const id of segment.tweetIds) {
        const tweet = story.tweets.find((item) => item.id === id)
        if (tweet)
          lines.push(
            `> @${tweet.username}: ${tweet.text.replace(/\n+/g, ' ')}`,
            '',
          )
      }
    }
    if (story.continuesFrom.length > 0) {
      const links = story.continuesFrom
        .map((ref) => `“${ref.title}” (week of ${ref.weekStart})`)
        .join('; ')
      lines.push(`**Continues from:** ${links}. ${story.continuityNote}`, '')
    }
    lines.push(
      `Daily coverage: ${story.dailyStories
        .map(
          (ref) =>
            `[${ref.digestDate}](${siteUrl}/digest/${ref.digestDate}/${ref.slug})`,
        )
        .join(', ')}`,
      '',
    )
  }
  if (content.alsoNotable.length > 0) {
    lines.push('## Also this week', '')
    for (const item of content.alsoNotable) {
      lines.push(
        `- ${item.line} ([${item.dailyStory.digestDate}](${siteUrl}/digest/${item.dailyStory.digestDate}/${item.dailyStory.slug}))`,
      )
    }
    lines.push('')
  }
  if (content.source.missingDates.length > 0) {
    lines.push(
      `_No daily digest was published for ${content.source.missingDates.join(', ')}._`,
      '',
    )
  }
  return lines.join('\n')
}

/** Text shown when a reader hovers a link to a daily or weekly story. */
export interface WeeklyRefPreview {
  kicker: string
  title: string
  excerpt: string
}

export const dailyPreviewKey = (digestDate: string, slug: string) =>
  `daily:${digestDate}#${slug}`
export const weeklyPreviewKey = (weekStart: string, slug: string) =>
  `weekly:${weekStart}#${slug}`

const HANDLE = /(^|[^\w/@])@(\w{1,15})(?!\w)/g

/** A person a weekly edition shows or mentions, for @handle profile cards. */
export interface WeeklyPerson {
  username: string
  accountId?: string
  name?: string
  avatar?: string | null
  tweetId?: string
}

/**
 * Everyone whose tweet the edition carries, plus every @handle its text
 * mentions, keyed once per lower-case handle.
 */
/** Lower-case @handles mentioned in some text. */
export function handlesIn(texts: string[]): Set<string> {
  const handles = new Set<string>()
  for (const text of texts)
    for (const match of Array.from(text.matchAll(HANDLE)))
      handles.add(match[2].toLowerCase())
  return handles
}

export function weeklyPeople(content: WeeklyDigestContent): WeeklyPerson[] {
  const people = new Map<string, WeeklyPerson>()
  for (const story of content.stories) {
    for (const tweet of story.tweets) {
      if (!tweet.username) continue
      const key = tweet.username.toLowerCase()
      const known = people.get(key)
      if (!known || (!known.avatar && tweet.avatar)) {
        people.set(key, {
          username: tweet.username,
          accountId: tweet.accountId ?? known?.accountId,
          name: tweet.name ?? known?.name,
          avatar: tweet.avatar ?? known?.avatar ?? null,
          tweetId: tweet.id,
        })
      }
    }
  }
  const texts = [
    ...content.executiveSummary,
    ...content.alsoNotable.map(({ line }) => line),
    ...content.stories.flatMap((story) => [
      story.title,
      story.subtitle,
      story.overview,
      story.continuityNote,
      ...story.segments.map(({ commentary }) => commentary),
    ]),
  ]
  for (const text of texts) {
    for (const match of Array.from(text.matchAll(HANDLE))) {
      const key = match[2].toLowerCase()
      if (!people.has(key)) people.set(key, { username: match[2] })
    }
  }
  return Array.from(people.values())
}
