import { OTHER_SECTION_SLUG, type ChapterSection } from './chapterSections'

/**
 * Turning an account's bangers into chapter sections, one model call per
 * year, run offline by scripts/generate-profile-sections.ts. Only the pure
 * parts live here so the script and its tests share one definition of what a
 * valid section is; the model is never called at request time.
 */

export interface SectionCandidateTweet {
  tweet_id: string
  /** ISO timestamp. */
  created_at: string
  full_text: string
  quote_count: number
}

export interface ModelSection {
  title: string
  tweet_ids: string[]
}

/** A year needs this many bangers before it is worth splitting. */
export const MIN_BANGERS = 6
export const MIN_SECTION_TWEETS = 3
export const MIN_YEAR_SECTIONS = 2
/** The model sees at most this many of a year's bangers, most-quoted first. */
export const MAX_TWEETS_PER_YEAR = 100
const MAX_TITLE_WORDS = 16

/** Each year's most-quoted bangers, capped, in a deterministic order. */
export const topBangersByYear = (
  tweets: SectionCandidateTweet[],
  cap = MAX_TWEETS_PER_YEAR,
): Map<number, SectionCandidateTweet[]> => {
  const byYear = new Map<number, SectionCandidateTweet[]>()
  for (const tweet of tweets) {
    const year = new Date(tweet.created_at).getUTCFullYear()
    byYear.set(year, [...(byYear.get(year) ?? []), tweet])
  }
  byYear.forEach((list, year) => {
    list.sort(
      (a, b) =>
        b.quote_count - a.quote_count || a.tweet_id.localeCompare(b.tweet_id),
    )
    byYear.set(year, list.slice(0, cap))
  })
  return byYear
}

export const yearSectionPrompt = (
  year: number,
  tweets: Pick<SectionCandidateTweet, 'tweet_id' | 'full_text'>[],
): string => {
  const posts = tweets
    .map(
      (tweet) =>
        `- id ${tweet.tweet_id}: ${tweet.full_text.replace(/\s+/g, ' ').slice(0, 280)}`,
    )
    .join('\n')
  return `Below are one Twitter account's most-quoted posts from ${year}, one per line as "id <number>: <text>". Group the ones that share a theme into sections.

Rules:
- Return between ${MIN_YEAR_SECTIONS} and 5 sections. A section must contain at least ${MIN_SECTION_TWEETS} posts; sections with fewer are discarded, so merge or drop small ones. A post appears in at most one section.
- If the posts don't support ${MIN_YEAR_SECTIONS} sections of ${MIN_SECTION_TWEETS}, return {"sections": []}.
- Not every post needs a section; leave the stragglers out.
- A section's title is a phrase of 2-10 words copied character-for-character from the text of one post INSIDE that section, so that searching the post for the title finds it. It should read as an idea the author was chewing on, not a category label you invented. No surrounding quotes, no links, no @handles.
- Group by what the posts are about; prefer fewer, sharper sections over many loose ones.

Example: given posts 11 "the mind is lush and full of sinkholes", 12 "fell into another sinkhole today", 13 "sinkholes all the way down", 14 "soup is a technology", 15 "more soup thoughts", 16 "the soup finale", respond
{"sections": [{"title": "lush and full of sinkholes", "tweet_ids": ["11", "12", "13"]}, {"title": "soup is a technology", "tweet_ids": ["14", "15", "16"]}]}

Respond with JSON only, in exactly that shape.

${posts}`
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

export const slugify = (title: string) =>
  normalize(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')

const usableTitle = (title: string) =>
  title.length > 0 &&
  !/https?:\/\/|t\.co\//i.test(title) &&
  !/@\w/.test(title) &&
  title.split(' ').length <= MAX_TITLE_WORDS

/**
 * Turns the model's grouping for one year into sections, dropping anything
 * that doesn't hold up: unknown or repeated tweet IDs, sections below the
 * minimum, titles that aren't verbatim from a tweet inside the section (or
 * that carry links or handles), and duplicate slugs. A year that can't keep
 * two sections gets none. The catch-all is not included; it is appended when
 * the sections are read.
 */
export const parseYearSections = (
  candidates: ModelSection[],
  tweets: Pick<SectionCandidateTweet, 'tweet_id' | 'full_text'>[],
): ChapterSection[] => {
  const textById = new Map(
    tweets.map((tweet) => [tweet.tweet_id, tweet.full_text]),
  )
  const claimed = new Set<string>()
  const slugs = new Set<string>([OTHER_SECTION_SLUG])
  const sections: ChapterSection[] = []

  for (const candidate of candidates) {
    if (!Array.isArray(candidate?.tweet_ids)) continue
    const ids = Array.from(new Set(candidate.tweet_ids)).filter(
      (id) => typeof id === 'string' && textById.has(id) && !claimed.has(id),
    )
    if (ids.length < MIN_SECTION_TWEETS) continue
    const title = String(candidate.title ?? '')
      .trim()
      .replace(/^["'“‘]+|["'”’.]+$/g, '')
      .trim()
    if (!usableTitle(title)) continue
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

  return sections.length >= MIN_YEAR_SECTIONS ? sections : []
}
