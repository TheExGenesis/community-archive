import { OTHER_SECTION_SLUG } from '@/lib/metaTwitter/chapterSections'
import {
  parseYearSections,
  topBangersByYear,
  yearSectionPrompt,
} from '@/lib/metaTwitter/sectionGeneration'

const tweet = (id: string, year: number, text: string, quotes = 2) => ({
  tweet_id: id,
  created_at: `${year}-06-01T00:00:00.000Z`,
  full_text: text,
  quote_count: quotes,
})

const YEAR = [
  tweet('1', 2025, 'the mind is lush and full of sinkholes', 9),
  tweet('2', 2025, 'more sinkholes over here', 4),
  tweet('3', 2025, 'sinkholes, concluded', 4),
  tweet('4', 2025, 'unrelated banger about soup https://t.co/abc', 3),
  tweet('5', 2025, 'soup thoughts, continued', 2),
  tweet('6', 2025, 'soup: the finale, with @friend', 2),
]

test('groups by year, most-quoted first, ties by id, capped', () => {
  const byYear = topBangersByYear(
    [...YEAR, tweet('7', 2024, 'a lonely tweet', 5)],
    4,
  )
  expect(Array.from(byYear.keys()).sort()).toEqual([2024, 2025])
  expect(byYear.get(2025)!.map((t) => t.tweet_id)).toEqual(['1', '2', '3', '4'])
  expect(byYear.get(2024)).toHaveLength(1)
})

test('prompt names the year and carries every tweet id', () => {
  const prompt = yearSectionPrompt(2025, YEAR)
  expect(prompt).toContain('from 2025')
  for (const { tweet_id } of YEAR) expect(prompt).toContain(`id ${tweet_id}:`)
})

test('accepts a clean grouping without a catch-all', () => {
  const sections = parseYearSections(
    [
      { title: 'full of sinkholes', tweet_ids: ['1', '2', '3'] },
      { title: '"soup thoughts"', tweet_ids: ['4', '5', '6'] },
    ],
    YEAR,
  )
  expect(sections.map((s) => s.slug)).toEqual([
    'full-of-sinkholes',
    'soup-thoughts',
  ])
  expect(sections[1].title).toBe('soup thoughts')
  expect(sections.some((s) => s.slug === OTHER_SECTION_SLUG)).toBe(false)
})

test('drops fabricated ids, double claims, non-verbatim titles, and thin years', () => {
  expect(
    parseYearSections(
      [
        { title: 'full of sinkholes', tweet_ids: ['1', '2', '3', '999'] },
        // '1' is already claimed, leaving only two real posts.
        { title: 'soup thoughts', tweet_ids: ['1', '4', '5'] },
      ],
      YEAR,
    ),
  ).toEqual([])
  expect(
    parseYearSections(
      [
        { title: 'Generic Label', tweet_ids: ['1', '2', '3'] },
        { title: 'soup thoughts', tweet_ids: ['4', '5', '6'] },
      ],
      YEAR,
    ),
  ).toEqual([])
})

test('rejects titles carrying links, handles, or the catch-all slug', () => {
  const base = { title: 'soup thoughts', tweet_ids: ['4', '5', '6'] }
  for (const title of [
    'https://t.co/abc',
    'the finale, with @friend',
    'other',
  ]) {
    expect(
      parseYearSections(
        [
          { title: 'full of sinkholes', tweet_ids: ['1', '2', '3'] },
          { ...base, title },
        ],
        YEAR,
      ),
    ).toEqual([])
  }
})

test('tolerates malformed model output', () => {
  expect(
    parseYearSections(
      [
        { title: 'full of sinkholes', tweet_ids: ['1', '2', '3'] },
        { title: 'soup thoughts' } as never,
        null as never,
      ],
      YEAR,
    ),
  ).toEqual([])
})
