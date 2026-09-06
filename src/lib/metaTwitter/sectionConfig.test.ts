import { OTHER_SECTION_SLUG } from '@/lib/metaTwitter/chapterSections'
import {
  CURATED_SECTIONS,
  GENERATED_SECTIONS,
  configuredSectionsByYear,
} from '@/lib/metaTwitter/sectionConfig'

const CURATED_ACCOUNT_ID = '826134955549790208'

/** Every configured chapter, from both sources, as [label, sections]. */
const chapters = () => [
  ...Object.entries(CURATED_SECTIONS).flatMap(([id, byYear]) =>
    Object.entries(byYear).map(
      ([year, sections]) => [`curated ${id} ${year}`, sections] as const,
    ),
  ),
  ...Object.entries(GENERATED_SECTIONS.accounts).flatMap(([id, account]) =>
    Object.entries(account.years).map(
      ([year, entry]) =>
        [
          `generated @${account.username} ${id} ${year}`,
          entry.sections,
        ] as const,
    ),
  ),
]

test('serves sections only for configured accounts, curated first', () => {
  expect(configuredSectionsByYear(CURATED_ACCOUNT_ID)).not.toBeNull()
  expect(configuredSectionsByYear('42')).toBeNull()
  for (const [id, account] of Object.entries(GENERATED_SECTIONS.accounts)) {
    expect(account.username).toMatch(/^\w{1,15}$/)
    expect(configuredSectionsByYear(id)).not.toBeNull()
  }
})

test('closes every configured chapter with a catch-all', () => {
  const byYear = configuredSectionsByYear(CURATED_ACCOUNT_ID)!
  expect(Object.keys(byYear).length).toBeGreaterThan(0)
  for (const sections of Object.values(byYear)) {
    expect(sections.length).toBeGreaterThan(1)
    expect(sections.at(-1)?.slug).toBe(OTHER_SECTION_SLUG)
    expect(sections.filter((s) => s.slug === OTHER_SECTION_SLUG)).toHaveLength(
      1,
    )
  }
})

test('keeps every section addressable, titled, and worth opening', () => {
  for (const [label, sections] of chapters()) {
    // A chapter either splits into at least two sections or stays whole.
    expect({ label, count: sections.length }).not.toEqual({ label, count: 1 })
    const slugs = sections.map((section) => {
      expect(section.slug).toMatch(/^[a-z0-9-]+$/)
      expect(section.slug).not.toBe(OTHER_SECTION_SLUG)
      expect(section.title.trim()).toBe(section.title)
      expect(section.title).not.toHaveLength(0)
      expect(section.title).not.toMatch(/https?:\/\/|@\w/)
      // Below three tweets a section is a footnote, not a chapter.
      expect(section.tweetIds.length).toBeGreaterThanOrEqual(3)
      for (const id of section.tweetIds) expect(id).toMatch(/^\d{1,20}$/)
      return section.slug
    })
    expect(new Set(slugs).size).toBe(slugs.length)
    const ids = sections.flatMap((section) => section.tweetIds)
    expect(new Set(ids).size).toBe(ids.length)
  }
})
