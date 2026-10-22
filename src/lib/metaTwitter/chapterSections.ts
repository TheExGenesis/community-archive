/**
 * Subsections inside a chapter (a year) of an account's archive.
 *
 * A section has two names. Its label says what the section is about: a short
 * plain description of what every tweet in it shares, such as "speech
 * coaching", and it is what the navigation and the heading show. Its title is
 * a phrase quoted verbatim from the tweet that leads the section, shown under
 * the heading, so the section still opens in the person's own words; the
 * title also derives the slug, which keeps links stable. Sections written
 * before labels existed have only a title, and use it as their heading.
 *
 * Membership is an explicit list of tweet IDs, so a post can never be quietly
 * mis-filed. Every chapter with sections also gets a trailing catch-all
 * (title "other", no label) so no banger becomes unreachable.
 *
 * This module is imported by client components, so it holds only the shapes
 * and helpers; the per-account section lists live in sectionConfig.ts.
 */

export interface ChapterSection {
  /** URL-safe identifier, kept stable once published. */
  slug: string
  /**
   * What every tweet in the section shares, in 1-4 plain words. Absent on
   * sections written before labels and on the catch-all.
   */
  label?: string
  /** Phrase quoted verbatim from the tweet that leads the section. */
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

/** Case, curly-quote and whitespace insensitive form for title matching. */
export const normalizeSectionText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

/** What a section is called: its label, or its quote when it has none. */
export const sectionHeading = (
  section: Pick<ChapterSection, 'label' | 'title'>,
) => section.label?.trim() || section.title

/**
 * The quote shown under a labelled heading, or null when the heading already
 * is the quote.
 */
export const sectionQuote = (
  section: Pick<ChapterSection, 'label' | 'title'>,
): string | null =>
  normalizeSectionText(sectionHeading(section)) ===
  normalizeSectionText(section.title)
    ? null
    : section.title

/** Closes a non-empty section list with the catch-all. */
export const withCatchAll = (sections: ChapterSection[]): ChapterSection[] =>
  sections.length ? [...sections, otherSection()] : []

/**
 * A section's tweets in feed order, except that the tweet its title quotes
 * comes first, so the heading always sits on the post it came from. The
 * catch-all holds whatever the sections left behind, so a chapter that gains
 * bangers after its sections were written still shows all of them.
 */
export const chapterSectionTweets = <
  T extends { tweet_id: string; full_text?: string },
>(
  sections: ChapterSection[],
  section: ChapterSection,
  tweets: T[],
): T[] => {
  if (section.slug === OTHER_SECTION_SLUG) {
    const claimed = new Set(sections.flatMap((entry) => entry.tweetIds))
    return tweets.filter((tweet) => !claimed.has(tweet.tweet_id))
  }
  const ids = new Set(section.tweetIds)
  const members = tweets.filter((tweet) => ids.has(tweet.tweet_id))
  const title = normalizeSectionText(section.title)
  const source = section.tweetIds
    .map((id) => members.find((tweet) => tweet.tweet_id === id))
    .find((tweet) =>
      normalizeSectionText(tweet?.full_text ?? '').includes(title),
    )
  return source
    ? [source, ...members.filter((tweet) => tweet !== source)]
    : members
}
