import 'server-only'

import generated from './generatedSections.json'
import { CURATED_SECTIONS } from './curatedSections'
export { CURATED_SECTIONS } from './curatedSections'
import {
  withCatchAll,
  type ChapterSection,
  type SectionsByYear,
} from './chapterSections'

/**
 * Which accounts have chapter sections, and what they are.
 *
 * Two sources, hand-curated winning: CURATED_SECTIONS below, and
 * generatedSections.json, written offline by
 * scripts/generate-profile-sections.ts for the archive's most-followed
 * accounts. Neither holds the catch-all; it is appended on read. Server-only
 * so the tweet-ID lists never ship to the browser.
 */

/** Shape of generatedSections.json. */
export interface GeneratedSectionsFile {
  model: string
  accounts: Record<
    string,
    {
      username: string
      years: Record<
        string,
        {
          generatedAt: string
          bangers: number
          generationSource?: string
          supplementalTweetIds?: string[]
          sections: ChapterSection[]
        }
      >
    }
  >
}

export const GENERATED_SECTIONS = generated as GeneratedSectionsFile

const closeChapters = (
  byYear: Record<string, ChapterSection[]>,
): SectionsByYear =>
  Object.fromEntries(
    Object.entries(byYear).map(([year, sections]) => [
      year,
      withCatchAll(sections),
    ]),
  )

/** Sections for an account, or null when it has none from either source. */
export const configuredSectionsByYear = (
  accountId: string,
): SectionsByYear | null => {
  const curated = CURATED_SECTIONS[accountId]
  const account = GENERATED_SECTIONS.accounts[accountId]
  if (!account && !curated) return null
  return closeChapters({
    ...Object.fromEntries(
      Object.entries(account?.years ?? {}).map(([year, entry]) => [
        year,
        entry.sections,
      ]),
    ),
    ...curated,
  })
}

/** Offline-selected representatives outside the original banger pool. */
export const supplementalSectionIds = (
  accountId: string,
): Record<number, string[]> =>
  Object.fromEntries(
    Object.entries(GENERATED_SECTIONS.accounts[accountId]?.years ?? {})
      .filter(
        ([year, entry]) =>
          entry.supplementalTweetIds?.length &&
          !CURATED_SECTIONS[accountId]?.[Number(year)],
      )
      .map(([year, entry]) => [year, entry.supplementalTweetIds!]),
  )
