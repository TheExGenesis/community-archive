import type { PortalTweet } from '@/lib/portal/types'
import type { DigestEditionContent, DigestStory } from './types'

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

export interface WeeklyDigestStory {
  slug: string
  kind: WeeklyStoryKind
  title: string
  subtitle: string
  bullets: string[]
  /** Why the bundled daily stories belong together; empty for a single source. */
  connection: string
  /** What this week adds to a story from a previous weekly digest. */
  continuityNote: string
  continuesFrom: WeeklyContinuityRef[]
  dailyStories: WeeklyDailyStoryRef[]
  /** Distinct daily dates the story appeared on, ascending. */
  days: string[]
  /** Representative banger snapshots copied from the daily editions. */
  tweets: PortalTweet[]
}

export interface WeeklyAlsoNotable {
  line: string
  dailyStory: WeeklyDailyStoryRef
}

export interface WeeklyDigestContent {
  weekStart: string
  weekEnd: string
  generatedAt: string
  executiveSummary: string[]
  stories: WeeklyDigestStory[]
  alsoNotable: WeeklyAlsoNotable[]
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
  required: ['executive_summary', 'stories', 'also_notable'],
  properties: {
    executive_summary: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 35, maxLength: 220 },
    },
    stories: {
      type: 'array',
      minItems: 3,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'kind',
          'title',
          'subtitle',
          'bullets',
          'connection',
          'daily_refs',
          'continues_from',
          'continuity_note',
        ],
        properties: {
          kind: { type: 'string', enum: WEEKLY_STORY_KINDS },
          title: { type: 'string', minLength: 8, maxLength: 140 },
          subtitle: { type: 'string', minLength: 60, maxLength: 500 },
          bullets: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: { type: 'string', minLength: 12, maxLength: 260 },
          },
          connection: { type: 'string', maxLength: 400 },
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

export const WEEKLY_DIGEST_SYSTEM_PROMPT = `You are the editor of the Community Archive Weekly Digest. Every day the Daily Digest publishes three to five stories about what the Community Archive's corner of Twitter/X was talking about. Once a week you read all of that week's daily stories and write the weekly edition: the few stories a reader who skipped every daily edition most needs.

SELECTING STORIES
Pick 4 to 7 weekly stories. Two kinds earn a place:
- "major": the week's most important or most engaged-with developments, even if they were covered on a single day and briefly. Weigh real-world stakes and community engagement (likes, quote counts, how many community members took part).
- "ongoing": a story that returned on two or more days of the week, consecutive or not, because the same event, actor, claim, release, or debate kept developing. An ongoing story must cite daily stories from at least two different dates.
Order stories by importance to the reader, not chronologically.

BUNDLING DAILY STORIES
Only put several daily stories in one weekly story when they share a concrete subject: the same event, the same people or organisation, the same release or paper, the same claim being argued over, or a direct reply/response. A shared broad theme ("AI safety", "elections", "launches", "the community") is NOT enough; such stories stay separate or are left out. When a weekly story cites more than one daily story, "connection" must say in one or two plain sentences exactly what links them (who/what is common and how one led to or answered the other). For a single daily story, leave "connection" empty.

CONTINUITY WITH PREVIOUS WEEKS
You also get up to two previous weekly digests. If a weekly story genuinely continues one of their stories (same concrete subject, as above), list those stories' refs in "continues_from" and write "continuity_note": one sentence on what is new this week compared with before. Check every selected story against every previous weekly story before deciding; a returning subject from two weeks ago counts even if last week skipped it. Do not link stories that are only thematically similar. A story that merely repeats last week with nothing new should not be selected. Leave both empty when there is no continuation.

WRITING
- Ground every claim in the supplied daily stories. Do not add outside knowledge, dates, or numbers.
- Title: plain and specific, in the voice of the community's own posts rather than newsletter-speak. A reader who sees only the title must learn what happened. A short exact quote from a source tweet is welcome when the story has one element and the quote itself says what happened; a quote that only makes sense after reading the story ("Anyway, it's Wednesday.", "whew") is not a title. When a story has several distinct elements, the title must cover all of them: either join two short quotes ("'quote one' / 'quote two'") or write a plain title naming each element. Never title a multi-part story with a quote that fits only one part.
- Subtitle: one or two sentences saying what happened across the week and why it matters, naming the people or organisations involved.
- Bullets: 2 to 4 for ongoing stories (in chronological order, each starting with the weekday, e.g. "Tue: ..."), 1 to 3 for major stories. Each bullet is one concrete development.
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
      top_tweets: (story.bangers ?? []).slice(0, 3).map((tweet) => ({
        username: tweet.username,
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
        subtitle: story.subtitle,
        bullets: story.bullets,
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

  const stories: WeeklyDigestStory[] = output.stories.map((raw, index) => {
    const label = `stories[${index}]`
    if (!isRecord(raw)) throw new Error(`${label} must be an object`)
    const kind = requireString(raw.kind, `${label}.kind`) as WeeklyStoryKind
    if (!WEEKLY_STORY_KINDS.includes(kind)) {
      errors.push(
        `${label}.kind must be one of ${WEEKLY_STORY_KINDS.join(', ')}`,
      )
    }
    const title = requireString(raw.title, `${label}.title`)
    const subtitle = requireString(raw.subtitle, `${label}.subtitle`)
    const bullets = requireStrings(raw.bullets, `${label}.bullets`)
    const connection = requireString(
      raw.connection ?? '',
      `${label}.connection`,
    )
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

    const dailyStories: WeeklyDailyStoryRef[] = []
    const tweets: PortalTweet[] = []
    const days = new Set<string>()
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
      dailyStories.push({
        digestDate: found.digestDate,
        slug: found.story.slug,
        title: found.story.title,
      })
      const lead = found.story.bangers?.[0]
      if (lead && !tweets.some(({ id }) => id === lead.id)) tweets.push(lead)
    }
    dailyStories.sort((a, b) => a.digestDate.localeCompare(b.digestDate))

    if (kind === 'ongoing' && days.size < 2) {
      errors.push(
        `${label} is "ongoing" but cites daily stories from only one date; cite at least two dates or mark it "major"`,
      )
    }
    if (refs.length > 1 && connection.length < 20) {
      errors.push(
        `${label} bundles ${refs.length} daily stories, so "connection" must explain concretely what links them`,
      )
    }

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
      subtitle,
      bullets,
      connection: refs.length > 1 ? connection : '',
      continuityNote: continuesFrom.length > 0 ? continuityNote : '',
      continuesFrom,
      dailyStories,
      days: Array.from(days).sort(),
      tweets,
    }
  })

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
    ...content.executiveSummary.map((line) => `- ${line}`),
    '',
  ]
  for (const story of content.stories) {
    lines.push(
      `## ${story.title}`,
      '',
      `*${story.kind === 'ongoing' ? `Ongoing · ${story.days.length} days` : 'Major'}* — ${story.subtitle}`,
      '',
      ...story.bullets.map((bullet) => `- ${bullet}`),
      '',
    )
    if (story.connection)
      lines.push(`**How these connect:** ${story.connection}`, '')
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
