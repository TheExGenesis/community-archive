/**
 * Subsections inside a chapter (a year) of an account's archive.
 *
 * A section title is a phrase quoted verbatim from one of the tweets it holds,
 * so a chapter reads as an idea the person was actually chewing on rather than
 * a generic label. Membership is an explicit list of tweet IDs, so a post can
 * never be quietly mis-filed. Every chapter with sections also gets a trailing
 * catch-all so no banger becomes unreachable.
 *
 * This module is imported by client components, so it holds only the shapes
 * and helpers; the per-account section lists live in sectionConfig.ts.
 */

export interface ChapterSection {
  /** URL-safe identifier, kept stable once published. */
  slug: string
  /** Quoted phrase from one of the section's tweets. */
  title: string
  /** Tweets in the section; empty for the catch-all. */
  tweetIds: string[]
}

export type SectionsByYear = Record<number, ChapterSection[]>

export const OTHER_SECTION_SLUG = 'other'

const otherSection = (): ChapterSection => ({
  slug: OTHER_SECTION_SLUG,
  title: 'other',
  tweetIds: [],
})

/** Closes a non-empty section list with the catch-all. */
export const withCatchAll = (sections: ChapterSection[]): ChapterSection[] =>
  sections.length ? [...sections, otherSection()] : []

/**
 * The catch-all holds whatever the sections left behind, so a chapter that
 * gains bangers after its sections were written still shows all of them.
 */
export const chapterSectionTweets = <T extends { tweet_id: string }>(
  sections: ChapterSection[],
  section: ChapterSection,
  tweets: T[],
): T[] => {
  if (section.slug !== OTHER_SECTION_SLUG) {
    const ids = new Set(section.tweetIds)
    return tweets.filter((tweet) => ids.has(tweet.tweet_id))
  }
  const claimed = new Set(sections.flatMap((entry) => entry.tweetIds))
  return tweets.filter((tweet) => !claimed.has(tweet.tweet_id))
}
