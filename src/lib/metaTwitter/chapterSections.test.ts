import {
  OTHER_SECTION_SLUG,
  chapterSectionTweets,
  curatedSectionsByYear,
  withCatchAll,
} from '@/lib/metaTwitter/chapterSections'

const CURATED_ACCOUNT_ID = '826134955549790208'

test('serves curated sections only for accounts that have them', () => {
  expect(curatedSectionsByYear(CURATED_ACCOUNT_ID)).not.toBeNull()
  expect(curatedSectionsByYear('42')).toBeNull()
})

test('closes every curated chapter with a catch-all', () => {
  const byYear = curatedSectionsByYear(CURATED_ACCOUNT_ID)!
  expect(Object.keys(byYear).length).toBeGreaterThan(0)
  for (const sections of Object.values(byYear)) {
    expect(sections.length).toBeGreaterThan(1)
    expect(sections.at(-1)?.slug).toBe(OTHER_SECTION_SLUG)
    expect(sections.filter((s) => s.slug === OTHER_SECTION_SLUG)).toHaveLength(
      1,
    )
  }
  expect(withCatchAll([])).toEqual([])
})

test('keeps every curated section addressable, titled, and worth opening', () => {
  const byYear = curatedSectionsByYear(CURATED_ACCOUNT_ID)!
  for (const [year, sections] of Object.entries(byYear)) {
    const slugs = sections.map((section) => {
      expect(section.slug).toMatch(/^[a-z0-9-]+$/)
      expect(section.title.trim()).toBe(section.title)
      expect(section.title).not.toHaveLength(0)
      if (section.slug !== OTHER_SECTION_SLUG) {
        // Below three tweets a section is a footnote, not a chapter.
        expect(section.tweetIds.length).toBeGreaterThanOrEqual(3)
        for (const id of section.tweetIds) expect(id).toMatch(/^\d{1,20}$/)
      }
      return `${year}:${section.slug}`
    })
    expect(new Set(slugs).size).toBe(slugs.length)
  }
})

test('files each tweet under one section, uncurated ones included', () => {
  const sections = curatedSectionsByYear(CURATED_ACCOUNT_ID)![2024]
  const [first] = sections
  const tweets = [
    ...first.tweetIds.map((tweet_id) => ({ tweet_id })),
    { tweet_id: '1' },
  ]

  expect(chapterSectionTweets(sections, first, tweets)).toEqual(
    first.tweetIds.map((tweet_id) => ({ tweet_id })),
  )
  expect(chapterSectionTweets(sections, sections.at(-1)!, tweets)).toEqual([
    { tweet_id: '1' },
  ])

  const filed = sections.flatMap((section) =>
    chapterSectionTweets(sections, section, tweets),
  )
  expect(filed).toHaveLength(tweets.length)
})

test('never lists the same tweet in two sections of a chapter', () => {
  for (const sections of Object.values(
    curatedSectionsByYear(CURATED_ACCOUNT_ID)!,
  )) {
    const ids = sections.flatMap((section) => section.tweetIds)
    expect(new Set(ids).size).toBe(ids.length)
  }
})
