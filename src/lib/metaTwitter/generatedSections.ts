import 'server-only'

import { unstable_cache } from 'next/cache'
import { devLog } from '@/lib/devLog'
import { getProfileBangers } from './bangers'
import {
  withCatchAll,
  type ChapterSection,
  type SectionsByYear,
} from './chapterSections'
import type { BangerTweet } from './types'

/**
 * Splits an uncurated archive's bangers into named chapter sections with one
 * model call, the first time anyone views the profile. The result is cached
 * server-side, so an account is read once per revalidation window rather than
 * per visitor; accounts below MIN_BANGERS are never sent to the model at all.
 */

/** The only model section generation may use. */
const SECTIONS_MODEL = 'deepseek/deepseek-v4-flash-0731'

/** Two sections of three posts each is the smallest split worth showing. */
export const MIN_BANGERS = 6
const MIN_SECTION_TWEETS = 3
const MIN_YEAR_SECTIONS = 2
const REVALIDATE_SECONDS = 7 * 86_400
const REQUEST_TIMEOUT_MS = 120_000
/** After a failed model call, how long to serve "unavailable" before retrying. */
const FAILURE_COOLDOWN_MS = 10 * 60_000

export type GeneratedSectionsState =
  | { status: 'insufficient' }
  | { status: 'unavailable' }
  | { status: 'generated'; sectionsByYear: SectionsByYear }

interface ModelYear {
  year: number
  sections: { title: string; tweet_ids: string[] }[]
}

export const bangersByYear = (
  tweets: Pick<BangerTweet, 'tweet_id' | 'created_at' | 'full_text'>[],
) => {
  const byYear = new Map<number, typeof tweets>()
  for (const tweet of tweets) {
    const year = new Date(tweet.created_at).getUTCFullYear()
    byYear.set(year, [...(byYear.get(year) ?? []), tweet])
  }
  return byYear
}

export const sectionPrompt = (
  byYear: Map<number, Pick<BangerTweet, 'tweet_id' | 'full_text'>[]>,
): string => {
  const years = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(
      ([year, tweets]) =>
        `## ${year}\n` +
        tweets
          .map(
            (tweet) =>
              `- id ${tweet.tweet_id}: ${tweet.full_text.replace(/\s+/g, ' ').slice(0, 280)}`,
          )
          .join('\n'),
    )
    .join('\n\n')
  return `These are one Twitter account's most-quoted posts, grouped by year. Split each year into thematic sections.

Rules:
- Each section holds at least ${MIN_SECTION_TWEETS} of that year's posts; a post appears in at most one section.
- A year that doesn't support ${MIN_YEAR_SECTIONS} such sections gets an empty sections list.
- Not every post needs a section; leave the stragglers out.
- A section's title is a short phrase (2-8 words) copied verbatim from one of the posts INSIDE that section - an idea the author was chewing on, not a generic label. No surrounding quotes.
- Group by what the posts are about; prefer fewer, sharper sections over many loose ones.

Respond with JSON only, in exactly this shape:
{"years": [{"year": 2024, "sections": [{"title": "...", "tweet_ids": ["..."]}]}]}

${years}`
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

const slugify = (title: string) =>
  normalize(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')

/**
 * Turns the model's grouping into chapter sections, dropping anything that
 * doesn't hold up: unknown or repeated tweet IDs, sections below the minimum,
 * titles that aren't verbatim from a tweet inside the section, and years left
 * with fewer than two sections.
 */
export const parseGeneratedSections = (
  years: ModelYear[],
  byYear: Map<number, Pick<BangerTweet, 'tweet_id' | 'full_text'>[]>,
): SectionsByYear => {
  const result: SectionsByYear = {}
  byYear.forEach((_tweets, year) => {
    result[year] = []
  })

  for (const entry of years) {
    const tweets = byYear.get(entry.year)
    if (!tweets) continue
    const textById = new Map(
      tweets.map((tweet) => [tweet.tweet_id, tweet.full_text]),
    )
    const claimed = new Set<string>()
    const slugs = new Set<string>()
    const sections: ChapterSection[] = []

    for (const candidate of entry.sections) {
      const ids = Array.from(new Set(candidate.tweet_ids)).filter(
        (id) => textById.has(id) && !claimed.has(id),
      )
      if (ids.length < MIN_SECTION_TWEETS) continue
      const title = candidate.title.trim().replace(/^["'“]+|["'”]+$/g, '')
      if (!title) continue
      const verbatim = ids.some((id) =>
        normalize(textById.get(id) ?? '').includes(normalize(title)),
      )
      if (!verbatim) continue
      const slug = slugify(title)
      if (!slug || slugs.has(slug)) continue
      slugs.add(slug)
      for (const id of ids) claimed.add(id)
      sections.push({ slug, title, tweetIds: ids })
    }

    result[entry.year] =
      sections.length >= MIN_YEAR_SECTIONS ? withCatchAll(sections) : []
  }
  return result
}

const requestSections = async (
  prompt: string,
  apiKey: string,
): Promise<ModelYear[]> => {
  const baseUrl =
    process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
  const response = await fetch(
    `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: SECTIONS_MODEL,
        max_tokens: 8000,
        // Left to reason, this model spends its whole token budget thinking
        // and returns nothing; grouping short posts doesn't need it.
        reasoning: { enabled: false },
        // The shape is spelled out in the prompt and enforced by
        // parseGeneratedSections, so plain JSON mode is enough.
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    },
  )
  if (!response.ok) {
    throw new Error(`Section generation failed with HTTP ${response.status}`)
  }
  const body = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[]
  }
  const choice = body.choices?.[0]
  if (!choice || choice.finish_reason !== 'stop') {
    throw new Error(
      `Section generation stopped early: ${choice?.finish_reason}`,
    )
  }
  const text = choice.message?.content
  if (!text) throw new Error('Section generation returned no text')
  const parsed = JSON.parse(text) as { years?: ModelYear[] }
  if (!Array.isArray(parsed.years)) {
    throw new Error('Section generation returned no years array')
  }
  return parsed.years
}

const getCachedGeneratedSections = unstable_cache(
  async (accountId: string): Promise<SectionsByYear> => {
    const bangers = await getProfileBangers(accountId)
    if (!bangers.available) throw new Error('Bangers unavailable')
    const byYear = bangersByYear(bangers.tweets)
    const raw = await requestSections(
      sectionPrompt(byYear),
      process.env.OPENROUTER_API_KEY as string,
    )
    return parseGeneratedSections(raw, byYear)
  },
  ['meta-twitter-generated-sections-v2'],
  { revalidate: REVALIDATE_SECONDS },
)

const failedUntil = new Map<string, number>()

/**
 * Sections for an account without hand-curated ones. Cheap gates run before
 * the model is ever involved: no API key or too few bangers short-circuit,
 * and a recent failure backs off instead of retrying on every page view.
 */
export async function getGeneratedSections(
  accountId: string,
  bangerCount: number,
): Promise<GeneratedSectionsState> {
  if (bangerCount < MIN_BANGERS) return { status: 'insufficient' }
  if (!process.env.OPENROUTER_API_KEY) return { status: 'unavailable' }
  if ((failedUntil.get(accountId) ?? 0) > Date.now()) {
    return { status: 'unavailable' }
  }
  try {
    const sectionsByYear = await getCachedGeneratedSections(accountId)
    return { status: 'generated', sectionsByYear }
  } catch (error) {
    devLog('generated sections failed', { accountId, error })
    failedUntil.set(accountId, Date.now() + FAILURE_COOLDOWN_MS)
    return { status: 'unavailable' }
  }
}
