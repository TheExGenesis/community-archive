import { OTHER_SECTION_SLUG } from '@/lib/metaTwitter/chapterSections'
import {
  MAX_TITLE_WORDS,
  MIN_PRUNED_SECTION_TWEETS,
  MISFIT_TEXT_LENGTH,
  TITLE_WORDS,
  fitTitle,
  misfitPrompt,
  misfitReviewPrompt,
  parseMisfitReview,
  parseMisfits,
  pruneSection,
  sectionTitleTweetId,
  PROMPT_EXAMPLE,
  SMALL_BANGER_POOL,
  cleanSectionLabel,
  generateYearSections,
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

/** YEAR padded to a pool big enough for three banger attempts. */
const BIG_YEAR = [
  ...YEAR,
  ...Array.from({ length: SMALL_BANGER_POOL - YEAR.length }, (_, i) =>
    tweet(String(100 + i), 2025, `filler post ${i}`, 1),
  ),
]

const GROUPING = [
  {
    label: 'sinkhole lore',
    title: 'full of sinkholes',
    tweet_ids: ['1', '2', '3'],
  },
  {
    label: 'soup discourse',
    title: 'soup thoughts',
    tweet_ids: ['4', '5', '6'],
  },
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
  // The example asks for a label beside each quoted title.
  expect(prompt).toContain(
    JSON.stringify({ sections: PROMPT_EXAMPLE.sections }),
  )
  expect(prompt).toContain('"label":"sinkholes"')
})

test('accepts a clean grouping without a catch-all', () => {
  const sections = parseYearSections(
    [
      {
        label: 'sinkhole lore',
        title: 'full of sinkholes',
        tweet_ids: ['1', '2', '3'],
      },
      {
        label: 'soup discourse',
        title: '"soup thoughts"',
        tweet_ids: ['4', '5', '6'],
      },
    ],
    YEAR,
  )
  expect(sections.map((s) => s.slug)).toEqual([
    'full-of-sinkholes',
    'soup-thoughts',
  ])
  expect(sections[1].title).toBe('soup thoughts')
  expect(sections.map((s) => s.label)).toEqual([
    'sinkhole lore',
    'soup discourse',
  ])
  expect(sections.some((s) => s.slug === OTHER_SECTION_SLUG)).toBe(false)
})

test('drops fabricated ids, double claims, non-verbatim titles, and thin years', () => {
  expect(
    parseYearSections(
      [
        {
          label: 'sinkhole lore',
          title: 'full of sinkholes',
          tweet_ids: ['1', '2', '3', '999'],
        },
        // '1' is already claimed, leaving only two real posts.
        {
          label: 'soup discourse',
          title: 'soup thoughts',
          tweet_ids: ['1', '4', '5'],
        },
      ],
      YEAR,
    ),
  ).toEqual([])
  expect(
    parseYearSections(
      [
        {
          label: 'sinkhole lore',
          title: 'Generic Label',
          tweet_ids: ['1', '2', '3'],
        },
        {
          label: 'soup discourse',
          title: 'soup thoughts',
          tweet_ids: ['4', '5', '6'],
        },
      ],
      YEAR,
    ),
  ).toEqual([])
})

test('rejects titles carrying links, handles, or the catch-all slug', () => {
  const base = {
    label: 'soup discourse',
    title: 'soup thoughts',
    tweet_ids: ['4', '5', '6'],
  }
  for (const title of [
    'https://t.co/abc',
    'the finale, with @friend',
    'other',
  ]) {
    expect(
      parseYearSections(
        [
          {
            label: 'sinkhole lore',
            title: 'full of sinkholes',
            tweet_ids: ['1', '2', '3'],
          },
          { ...base, title },
        ],
        YEAR,
      ),
    ).toEqual([])
  }
})

test('cleans a short specific label and rejects vague, long, linked or parroted ones', () => {
  expect(cleanSectionLabel('  "speech  coaching." ')).toBe('speech coaching')
  expect(cleanSectionLabel('FractalU')).toBe('FractalU')
  // Vague words are fine beside a real subject.
  expect(cleanSectionLabel('thoughts on soup')).toBe('thoughts on soup')
  for (const label of [
    undefined,
    42,
    '',
    '  ',
    'other',
    'Other',
    'random thoughts',
    'life updates',
    'my musings and reflections',
    'society and culture',
    'one two three four five',
    'x'.repeat(33),
    'with @friend',
    'https://t.co/abc',
    // Copied from the prompt's example.
    'soup',
    'Sinkholes',
  ])
    expect(cleanSectionLabel(label)).toBeNull()
})

test('drops a section whose label is missing, invalid or repeated', () => {
  const sinkholes = {
    label: 'sinkhole lore',
    title: 'full of sinkholes',
    tweet_ids: ['1', '2', '3'],
  }
  const soup = { title: 'soup thoughts', tweet_ids: ['4', '5', '6'] }
  for (const label of [
    undefined,
    'misc',
    'sinkhole lore',
    'too many words here now',
  ])
    expect(
      parseYearSections([sinkholes, { ...soup, label } as never], YEAR),
    ).toEqual([])
  expect(
    parseYearSections([sinkholes, { ...soup, label: 'soup discourse' }], YEAR),
  ).toHaveLength(2)
})

test('drops the prompt example when the model parrots it back', () => {
  const posts = PROMPT_EXAMPLE.posts.map(([tweet_id, full_text]) => ({
    tweet_id,
    full_text,
  }))
  const parroted = PROMPT_EXAMPLE.sections.map((section) => ({
    ...section,
    tweet_ids: [...section.tweet_ids],
  }))
  expect(parseYearSections(parroted, posts)).toEqual([])
})

test('tolerates malformed model output', () => {
  expect(
    parseYearSections(
      [
        {
          label: 'sinkhole lore',
          title: 'full of sinkholes',
          tweet_ids: ['1', '2', '3'],
        },
        { title: 'soup thoughts' } as never,
        null as never,
      ],
      YEAR,
    ),
  ).toEqual([])
})

test('only the fallback path accepts two-post sections', async () => {
  const small = YEAR.filter((tweet) =>
    ['1', '2', '4', '5'].includes(tweet.tweet_id),
  ).map((tweet) => ({ ...tweet, favorite_count: 10 }))
  const raw = [
    {
      label: 'sinkhole lore',
      title: 'full of sinkholes',
      tweet_ids: ['1', '2'],
    },
    { label: 'soup discourse', title: 'soup thoughts', tweet_ids: ['4', '5'] },
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
  const fallback = jest.fn()
  const request = jest
    .fn()
    .mockRejectedValueOnce(new Error('provider down'))
    .mockResolvedValue(GROUPING)
  const result = await generateYearSections(2025, BIG_YEAR, fallback, request)
  expect(result.source).toBe('bangers')
  expect(result.failures).toBe(1)
  expect(result.responses).toBe(1)
  expect(fallback).not.toHaveBeenCalled()
})

test('regroups a small banger year into pairs when no top-liked pool exists', async () => {
  const pairs = [
    { label: 'sinkhole lore', title: 'full of sinkholes', tweet_ids: ['1', '2'] },
    { label: 'soup discourse', title: 'soup thoughts', tweet_ids: ['4', '5'] },
  ]
  const request = jest.fn().mockResolvedValueOnce([]).mockResolvedValue(pairs)
  const noPool = async () => {
    throw new Error('no pool')
  }
  const result = await generateYearSections(2025, YEAR, noPool, request)
  expect(result.source).toBe('bangers')
  expect(result.sections).toHaveLength(2)
  expect(request.mock.calls[0][0]).toContain('at least 3 posts')
  expect(request.mock.calls[1][0]).toContain('at least 2 posts')
  await expect(
    generateYearSections(2025, YEAR.slice(0, 4), noPool, request),
  ).rejects.toThrow('no pool')
})

test('fallback tries three-post themes before permitting pairs and distinguishes provider errors', async () => {
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
    label: `theme ${i}`,
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

test('prompt spells out one-subject labels, counted sections and short titles', () => {
  const prompt = yearSectionPrompt(2025, YEAR)
  expect(prompt).toContain('1-3 plain words naming ONE subject')
  expect(prompt).toContain('natural noun phrase')
  expect(prompt).toContain('never nouns jammed together')
  expect(prompt).toContain('A label never contains "and" or "&"')
  expect(prompt).toContain('they are two sections, or the off-subject posts')
  expect(prompt).toContain('is too broad')
  expect(prompt).not.toContain('X and Y')
  expect(prompt).toContain('count the posts in each section')
  expect(prompt).toContain('thrown away')
  expect(prompt).toContain('return fewer sections rather than small ones')
  expect(prompt).toContain(`2-${TITLE_WORDS} words`)
  expect(prompt).toContain(`never more than ${TITLE_WORDS}`)
  expect(prompt).toContain('never force unrelated posts together')
  expect(TITLE_WORDS).toBe(10)
})

test('"and" labels are left to the prompt, not the validator', () => {
  expect(cleanSectionLabel('meditation and consciousness')).toBe(
    'meditation and consciousness',
  )
})

test('parsed titles are capped at sixteen words', () => {
  const words = (n: number) =>
    Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ')
  expect(MAX_TITLE_WORDS).toBe(16)
  const long = [
    tweet('1', 2025, words(17)),
    tweet('2', 2025, 'sinkholes again'),
    tweet('3', 2025, 'sinkholes, concluded'),
    ...YEAR.slice(3),
  ]
  const grouping = (title: string) => [
    { label: 'sinkhole lore', title, tweet_ids: ['1', '2', '3'] },
    {
      label: 'soup discourse',
      title: 'soup thoughts',
      tweet_ids: ['4', '5', '6'],
    },
  ]
  // Over the prompt's 10 words with no clause to cut back to, but under the
  // hard cap: kept whole.
  expect(parseYearSections(grouping(words(16)), long)[0].title).toBe(words(16))
  expect(parseYearSections(grouping(words(17)), long)).toEqual([])
})

test('a long title is cut back to a leading clause that fits', () => {
  expect(
    fitTitle('The Story of Fractal, or How I Built a Campus For My Friends…'),
  ).toBe('The Story of Fractal')
  expect(
    fitTitle(
      'announcing the community archive! a quest to back up the tpot canon',
    ),
  ).toBe('announcing the community archive')
  // Short titles are untouched; one-word clauses don't count, and a title
  // under the hard cap with no short clause stays whole.
  expect(fitTitle('soup is, a technology')).toBe('soup is, a technology')
  const long = 'one, two three four five six seven eight nine ten eleven twelve'
  expect(fitTitle(long)).toBe(long)
  // Over the hard cap, a clause under it is the fallback.
  const longer = 'a b c d e f g h i j k l, m n o p q r s t u v w x y z'
  expect(fitTitle(longer)).toBe('a b c d e f g h i j k l')
  const tweets = [
    tweet(
      '1',
      2025,
      `${'The Story of Fractal, or How I Built a Campus For My Friends'} today`,
    ),
    tweet('2', 2025, 'fractal again'),
    tweet('3', 2025, 'fractal, concluded'),
    ...YEAR.slice(3),
  ]
  const sections = parseYearSections(
    [
      {
        label: 'Fractal',
        title: 'The Story of Fractal, or How I Built a Campus For My Friends',
        tweet_ids: ['1', '2', '3'],
      },
      {
        label: 'soup discourse',
        title: 'soup thoughts',
        tweet_ids: ['4', '5', '6'],
      },
    ],
    tweets,
  )
  expect(sections[0]).toMatchObject({
    title: 'The Story of Fractal',
    slug: 'the-story-of-fractal',
  })
})

test('a small banger pool gets one attempt before the fallback', async () => {
  const small = jest.fn().mockResolvedValue([])
  const fallback = jest.fn().mockResolvedValue([])
  await generateYearSections(2025, YEAR, fallback, small)
  expect(YEAR.length).toBeLessThan(SMALL_BANGER_POOL)
  expect(small).toHaveBeenCalledTimes(1)
  expect(small.mock.calls[0][1]).toBe(0)
  expect(fallback).toHaveBeenCalledTimes(1)

  const big = jest.fn().mockResolvedValue([])
  await generateYearSections(2025, BIG_YEAR, async () => [], big)
  expect(big.mock.calls.map(([, temperature]) => temperature)).toEqual([
    0, 0.7, 0.7,
  ])
})

/** YEAR as written sections: '1' leads sinkholes, '5' leads soup. */
const MISFIT_SECTIONS = [
  {
    label: 'sinkhole lore',
    titleTweetId: '1',
    tweets: YEAR.slice(0, 3),
  },
  {
    label: 'soup discourse',
    titleTweetId: '5',
    tweets: YEAR.slice(3),
  },
]

test('finds the tweet a title quotes, as the page does', () => {
  const texts = new Map(YEAR.map((t) => [t.tweet_id, t.full_text]))
  const section = { title: 'Soup Thoughts', tweetIds: ['4', '5', '6'] }
  expect(sectionTitleTweetId(section, texts)).toBe('5')
  // The first quoting tweet in list order wins.
  expect(
    sectionTitleTweetId({ title: 'soup', tweetIds: ['6', '4'] }, texts),
  ).toBe('6')
  expect(
    sectionTitleTweetId({ title: 'no such phrase', tweetIds: ['4'] }, texts),
  ).toBeNull()
  expect(sectionTitleTweetId(section, new Map())).toBeNull()
})

test('misfit prompt shows labels and every tweet, lead first, never the title', () => {
  const long = 'soup '.repeat(MISFIT_TEXT_LENGTH)
  const prompt = misfitPrompt(2025, [
    MISFIT_SECTIONS[0]!,
    {
      ...MISFIT_SECTIONS[1]!,
      tweets: [...YEAR.slice(3), tweet('7', 2025, long)],
    },
  ])
  expect(prompt).toContain("account's 2025 posts")
  expect(prompt).toContain('Section 1, label "sinkhole lore":\n- id 1 (lead):')
  expect(prompt).toContain('Section 2, label "soup discourse":\n- id 5 (lead):')
  for (const { tweet_id } of YEAR) expect(prompt).toContain(`- id ${tweet_id}`)
  expect(prompt).not.toContain('title')
  expect(prompt).toContain(
    `- id 7: ${long.trim().slice(0, MISFIT_TEXT_LENGTH)}…`,
  )
  expect(prompt).not.toContain(long.trim())
})

test('parses misfit verdicts, dropping unknown, title and repeated ids', () => {
  const { bySection, rejected, judged } = parseMisfits(
    {
      posts: [
        { id: '1', about: 'sinkholes', fits: false },
        { id: '2', about: 'sinkholes', fits: true },
        { id: ' 3 ', about: '  a  new haircut ', fits: false },
        { id: '4', about: 'soup', fits: false },
        { id: '4', about: 'soup again', fits: false },
        { id: '999', about: 'invented', fits: false },
        { id: 6, about: 'numeric id', fits: false },
        { id: '6', about: 'soup', fits: 'no' },
        null,
      ],
    },
    MISFIT_SECTIONS,
  )
  expect(bySection).toEqual([
    [{ id: '3', reason: 'a new haircut' }],
    [{ id: '4', reason: 'soup' }],
  ])
  expect(rejected.map((entry) => entry.reason)).toEqual([
    'title tweet',
    'repeated',
    'not a post in any section',
    'not a post in any section',
  ])
  expect(judged).toBe(5)
  for (const raw of [null, {}, { posts: 'none' }, { misfits: [{ id: '3' }] }])
    expect(parseMisfits(raw, MISFIT_SECTIONS)).toEqual({
      bySection: [[], []],
      rejected: [],
      judged: 0,
    })
})

test('prunes misfits unless that empties most of a section or drops it below the floor', () => {
  const misfit = (id: string) => ({ id, reason: 'off-label' })
  expect(pruneSection(['1', '2', '3', '4'], [])).toEqual({
    kind: 'unchanged',
    tweetIds: ['1', '2', '3', '4'],
  })
  // Misfits outside the section are ignored.
  expect(pruneSection(['1', '2', '3'], [misfit('9')]).kind).toBe('unchanged')
  expect(
    pruneSection(['1', '2', '3', '4'], [misfit('4'), misfit('2')]),
  ).toEqual({
    kind: 'pruned',
    tweetIds: ['1', '3'],
    removed: [misfit('4'), misfit('2')],
  })
  expect(pruneSection(['1', '2', '3'], [misfit('2'), misfit('3')])).toEqual({
    kind: 'flagged',
    tweetIds: ['1', '2', '3'],
    removed: [misfit('2'), misfit('3')],
    why: 'would remove 2 of 3',
  })
  expect(MIN_PRUNED_SECTION_TWEETS).toBe(2)
  expect(pruneSection(['1', '2', '3'], [misfit('3')]).kind).toBe('pruned')
  expect(pruneSection(['1', '2', '3'], [misfit('3')], 3)).toMatchObject({
    kind: 'flagged',
    why: 'would leave 2, below 3',
  })
})

test('the second look shows only proposed misfits, beside their lead tweet', () => {
  const prompt = misfitReviewPrompt(2025, MISFIT_SECTIONS, [
    [],
    [{ id: '6', reason: 'a party' }],
  ])
  expect(prompt).toContain("account's 2025 posts")
  expect(prompt).not.toContain('sinkhole lore')
  expect(prompt).toContain(
    'Label "soup discourse". Its lead post, for context: soup thoughts, continued\nProposed misfits:\n- id 6: soup: the finale, with @friend',
  )
  expect(prompt).not.toContain('- id 4')
  // The first pass's reason isn't shown, so it can't anchor the second.
  expect(prompt).not.toContain('a party')
})

test('the second look confirms only explicit moves and keeps everything else', () => {
  const misfit = (id: string) => ({ id, reason: 'off-label' })
  const { bySection, rescued } = parseMisfitReview(
    {
      posts: [
        { id: '2', tie: 'none', keep: false },
        { id: ' 3 ', tie: 'a sinkhole pun', keep: true },
        { id: '6', tie: 'none', keep: 'false' },
        { id: '2', tie: 'changed its mind', keep: true },
      ],
    },
    [
      [misfit('2'), misfit('3')],
      [misfit('5'), misfit('6')],
    ],
  )
  expect(bySection).toEqual([[misfit('2')], []])
  expect(rescued).toEqual([
    { ...misfit('3'), tie: 'a sinkhole pun' },
    { ...misfit('5'), tie: 'no verdict' },
    { ...misfit('6'), tie: 'none' },
  ])
  expect(parseMisfitReview(null, [[misfit('2')]]).bySection).toEqual([[]])
})
