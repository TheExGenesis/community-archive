import {
  OTHER_SECTION_SLUG,
  chapterSectionTweets,
  sectionHeading,
  sectionQuote,
  withCatchAll,
  type ChapterSection,
} from '@/lib/metaTwitter/chapterSections'

const SECTIONS: ChapterSection[] = withCatchAll([
  { slug: 'sinkholes', title: 'full of sinkholes', tweetIds: ['1', '2', '3'] },
  { slug: 'soup', title: 'soup thoughts', tweetIds: ['4', '5', '6'] },
])

test('closes a non-empty chapter with exactly one catch-all', () => {
  expect(SECTIONS.at(-1)?.slug).toBe(OTHER_SECTION_SLUG)
  expect(SECTIONS.filter((s) => s.slug === OTHER_SECTION_SLUG)).toHaveLength(1)
  expect(withCatchAll([])).toEqual([])
})

test('files each tweet under one section, unclaimed ones included', () => {
  const [first] = SECTIONS
  const tweets = [
    ...first.tweetIds.map((tweet_id) => ({ tweet_id })),
    { tweet_id: '5' },
    { tweet_id: '99' },
  ]

  expect(chapterSectionTweets(SECTIONS, first, tweets)).toEqual(
    first.tweetIds.map((tweet_id) => ({ tweet_id })),
  )
  expect(chapterSectionTweets(SECTIONS, SECTIONS.at(-1)!, tweets)).toEqual([
    { tweet_id: '99' },
  ])

  const filed = SECTIONS.flatMap((section) =>
    chapterSectionTweets(SECTIONS, section, tweets),
  )
  expect(filed).toHaveLength(tweets.length)
})

test('leads a section with the tweet its title quotes', () => {
  const section: ChapterSection = {
    slug: 'sinkholes',
    title: 'Lush and full of sinkholes',
    tweetIds: ['1', '2', '3'],
  }
  const tweets = [
    { tweet_id: '2', full_text: 'last selfie' },
    { tweet_id: '9', full_text: 'not in the section' },
    { tweet_id: '3', full_text: 'the mind is lush and  full of sinkholes' },
    { tweet_id: '1', full_text: 'speech coaching' },
  ]

  expect(
    chapterSectionTweets([section], section, tweets).map((t) => t.tweet_id),
  ).toEqual(['3', '2', '1'])
  // Without a quoting tweet loaded, feed order stands.
  expect(
    chapterSectionTweets([section], section, tweets.slice(0, 2)).map(
      (t) => t.tweet_id,
    ),
  ).toEqual(['2'])
})

test('heads a labelled section with its label and keeps the quote beneath', () => {
  const labelled: ChapterSection = {
    slug: 'sinkholes',
    label: 'sinkholes',
    title: 'full of sinkholes',
    tweetIds: ['1', '2', '3'],
  }
  expect(sectionHeading(labelled)).toBe('sinkholes')
  expect(sectionQuote(labelled)).toBe('full of sinkholes')

  // Sections written before labels, and the catch-all, read as before.
  for (const section of SECTIONS) {
    expect(sectionHeading(section)).toBe(section.title)
    expect(sectionQuote(section)).toBeNull()
  }
  // A blank label, or one that repeats the quote, adds no second line.
  expect(sectionHeading({ ...labelled, label: ' ' })).toBe('full of sinkholes')
  expect(sectionQuote({ ...labelled, label: 'Full of sinkholes' })).toBeNull()
})
