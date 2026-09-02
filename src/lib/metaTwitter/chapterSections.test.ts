import {
  OTHER_SECTION_SLUG,
  chapterSectionTweets,
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
