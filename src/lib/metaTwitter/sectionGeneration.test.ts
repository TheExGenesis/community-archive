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

test('only the fallback path accepts two-post sections', async () => {
  const { generateYearSections } = await import('./sectionGeneration')
  const small = YEAR.filter((tweet) =>
    ['1', '2', '4', '5'].includes(tweet.tweet_id),
  ).map((tweet) => ({ ...tweet, favorite_count: 10 }))
  const raw = [
    { title: 'full of sinkholes', tweet_ids: ['1', '2'] },
    { title: 'soup thoughts', tweet_ids: ['4', '5'] },
  ]
  expect(parseYearSections(raw, small)).toEqual([])
  const request = jest.fn().mockResolvedValue(raw)
  const result = await generateYearSections(
    2025,
    [],
    async () => small,
    request,
  )
  expect(result.source).toBe('fallback')
  expect(result.sections).toHaveLength(2)
  expect(request.mock.calls[0][0]).toContain('at least 2 posts')
})

test('prefers successful bangers and never fetches fallback unnecessarily', async () => {
  const { generateYearSections } = await import('./sectionGeneration')
  const fallback = jest.fn()
  const request = jest
    .fn()
    .mockRejectedValueOnce(new Error('provider down'))
    .mockResolvedValue([
      { title: 'full of sinkholes', tweet_ids: ['1', '2', '3'] },
      { title: 'soup thoughts', tweet_ids: ['4', '5', '6'] },
    ])
  const result = await generateYearSections(2025, YEAR, fallback, request)
  expect(result.source).toBe('bangers')
  expect(result.failures).toBe(1)
  expect(fallback).not.toHaveBeenCalled()
})

test('fallback tries three-post themes before permitting pairs and distinguishes provider errors', async () => {
  const { generateYearSections } = await import('./sectionGeneration')
  const candidates = YEAR.map((tweet) => ({ ...tweet, favorite_count: 10 }))
  const request = jest.fn().mockResolvedValue([])
  const result = await generateYearSections(
    2025,
    [],
    async () => candidates,
    request,
  )
  expect(result.source).toBe('no-defensible-split')
  expect(
    request.mock.calls
      .slice(0, 3)
      .every(([prompt]) => prompt.includes('at least 3 posts')),
  ).toBe(true)
  expect(
    request.mock.calls
      .slice(3)
      .every(([prompt]) => prompt.includes('at least 2 posts')),
  ).toBe(true)
  expect(
    (
      await generateYearSections(
        2025,
        [],
        async () => candidates,
        async () => {
          throw new Error('down')
        },
      )
    ).source,
  ).toBe('provider-failure')
})

test('top-liked pool excludes replies, retweets, links and other years, sorts and caps deterministically', async () => {
  const { topLikedTweets } = await import('./sectionGeneration')
  const candidates = Array.from({ length: 60 }, (_, i) => ({
    ...tweet(String(i), 2025, `original post ${i}`),
    favorite_count: i,
  }))
  const result = topLikedTweets(
    [
      ...candidates,
      {
        ...tweet('reply', 2025, 'a reply'),
        favorite_count: 999,
        reply_to_tweet_id: '1',
      },
      { ...tweet('rt', 2025, 'RT @someone: popular'), favorite_count: 999 },
      { ...tweet('link', 2025, 'https://t.co/link'), favorite_count: 999 },
      { ...tweet('old', 2024, 'old post'), favorite_count: 999 },
      candidates[59],
    ],
    2025,
  )
  expect(result).toHaveLength(50)
  expect(result[0].tweet_id).toBe('59')
  expect(result[49].tweet_id).toBe('10')
})

test('rejects overfragmented model output instead of publishing more than five sections', () => {
  const tweets = Array.from({ length: 18 }, (_, i) =>
    tweet(String(i), 2025, `theme ${Math.floor(i / 3)}`),
  )
  const raw = Array.from({ length: 6 }, (_, i) => ({
    title: `theme ${i}`,
    tweet_ids: [0, 1, 2].map((j) => String(i * 3 + j)),
  }))
  expect(parseYearSections(raw, tweets)).toEqual([])
})

test('bare media labels are not evidence of a theme', async () => {
  const { topLikedTweets } = await import('./sectionGeneration')
  expect(
    topLikedTweets(
      [{ ...tweet('1', 2025, 'Photo: https://t.co/a'), favorite_count: 999 }],
      2025,
    ),
  ).toEqual([])
})
