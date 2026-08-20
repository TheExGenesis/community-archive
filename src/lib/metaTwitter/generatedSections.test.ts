import { OTHER_SECTION_SLUG } from '@/lib/metaTwitter/chapterSections'
import {
  bangersByYear,
  parseGeneratedSections,
  sectionPrompt,
} from '@/lib/metaTwitter/generatedSections'

const tweet = (id: string, year: number, text: string) => ({
  tweet_id: id,
  created_at: `${year}-06-01T00:00:00.000Z`,
  full_text: text,
})

const CORPUS = [
  tweet('1', 2025, 'the mind is lush and full of sinkholes'),
  tweet('2', 2025, 'more sinkholes over here'),
  tweet('3', 2025, 'sinkholes, concluded'),
  tweet('4', 2025, 'unrelated banger about soup'),
  tweet('5', 2025, 'soup thoughts, continued'),
  tweet('6', 2025, 'soup: the finale'),
  tweet('7', 2024, 'a lonely tweet'),
]

test('groups bangers by their created year', () => {
  const byYear = bangersByYear(CORPUS)
  expect(Array.from(byYear.keys()).sort()).toEqual([2024, 2025])
  expect(byYear.get(2025)).toHaveLength(6)
})

test('prompt carries every tweet id', () => {
  const prompt = sectionPrompt(bangersByYear(CORPUS))
  for (const { tweet_id } of CORPUS) {
    expect(prompt).toContain(`id ${tweet_id}:`)
  }
})

test('accepts a clean model grouping and appends the catch-all', () => {
  const byYear = bangersByYear(CORPUS)
  const result = parseGeneratedSections(
    [
      {
        year: 2025,
        sections: [
          { title: 'full of sinkholes', tweet_ids: ['1', '2', '3'] },
          { title: 'soup thoughts', tweet_ids: ['4', '5', '6'] },
        ],
      },
      { year: 2024, sections: [] },
    ],
    byYear,
  )
  expect(result[2025].map((s) => s.slug)).toEqual([
    'full-of-sinkholes',
    'soup-thoughts',
    OTHER_SECTION_SLUG,
  ])
  expect(result[2024]).toEqual([])
})

test('drops fabricated ids, non-verbatim titles, and thin years', () => {
  const byYear = bangersByYear(CORPUS)
  const result = parseGeneratedSections(
    [
      {
        year: 2025,
        sections: [
          // "999" is not a real banger; still three valid ids -> kept
          { title: 'full of sinkholes', tweet_ids: ['1', '2', '3', '999'] },
          // title not verbatim in any member tweet -> dropped
          { title: 'culinary musings', tweet_ids: ['4', '5', '6'] },
        ],
      },
      // unknown year -> ignored entirely
      { year: 1999, sections: [{ title: 'x', tweet_ids: ['1', '2', '3'] }] },
    ],
    byYear,
  )
  // only one surviving section -> below the two-section minimum -> no split
  expect(result[2025]).toEqual([])
  expect(result[1999]).toBeUndefined()
})

test('never files one tweet into two sections', () => {
  const byYear = bangersByYear(CORPUS)
  const result = parseGeneratedSections(
    [
      {
        year: 2025,
        sections: [
          { title: 'full of sinkholes', tweet_ids: ['1', '2', '3'] },
          // overlaps ids 1-2; only 4,5,6... but claims 1,2,4 -> "4" alone is too few
          { title: 'soup thoughts', tweet_ids: ['1', '2', '4'] },
          { title: 'soup: the finale', tweet_ids: ['4', '5', '6'] },
        ],
      },
    ],
    byYear,
  )
  const ids = result[2025].flatMap((s) => s.tweetIds)
  expect(new Set(ids).size).toBe(ids.length)
  expect(result[2025].map((s) => s.slug)).toEqual([
    'full-of-sinkholes',
    'soup-the-finale',
    OTHER_SECTION_SLUG,
  ])
})
