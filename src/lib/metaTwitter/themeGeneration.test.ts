import {
  MAX_KEYWORD_SHARE,
  PROMPT_EXAMPLE_THEMES,
  buildYearThemes,
  cleanPostText,
  consideredPosts,
  countThemes,
  generateYearThemes,
  keywordMatcher,
  parseGeneratedThemes,
  samplePosts,
  yearThemePrompt,
  type ThemePost,
} from '@/lib/metaTwitter/themeGeneration'

const ACCOUNT = '42'

const row = (
  id: string,
  text: string,
  extra: Record<string, unknown> = {},
) => ({
  tweet_id: id,
  created_at: `2025-03-0${(Number(id) % 9) + 1}T12:00:00.000Z`,
  full_text: text,
  favorite_count: Number(id),
  ...extra,
})

const post = (id: string, text: string, likes = 0, day = 1): ThemePost => ({
  tweet_id: id,
  created_at: `2025-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  text,
  favorite_count: likes,
})

const theme = (
  label: string,
  keywords: string[],
  examples: unknown[] = [],
) => ({
  label,
  description: `posts about ${label}`,
  keywords,
  examples,
})

test('keeps originals, quotes and self-replies; drops retweets, replies to others, tombstones, other years and bare links', () => {
  const posts = consideredPosts(
    [
      row('1', 'an original post https://t.co/abc'),
      row('2', 'quoting a friend https://twitter.com/x/status/9'),
      row('3', '@me continuing my thread', {
        reply_to_tweet_id: '1',
        reply_to_user_id: ACCOUNT,
      }),
      row('4', '@friend replying to you', {
        reply_to_tweet_id: '99',
        reply_to_user_id: '7',
      }),
      row('5', 'RT @friend: their post'),
      row('6', 'a tombstone', { is_tombstone: true }),
      row('7', 'last year', { created_at: '2024-12-31T23:59:59.000Z' }),
      row('8', 'https://t.co/photo'),
      row('1', 'an original post https://t.co/abc'),
    ],
    ACCOUNT,
    2025,
  )
  expect(posts.map((p) => p.tweet_id).sort()).toEqual(['1', '2', '3'])
  expect(posts.find((p) => p.tweet_id === '3')!.text).toBe(
    'continuing my thread',
  )
  expect(posts.find((p) => p.tweet_id === '1')!.text).toBe('an original post')
})

test('a null year keeps considered posts from every year', () => {
  const posts = consideredPosts(
    [
      row('1', 'this year'),
      row('7', 'last year', { created_at: '2019-06-01T00:00:00.000Z' }),
      row('5', 'RT @friend: their post'),
    ],
    ACCOUNT,
    null,
  )
  expect(posts.map((p) => p.tweet_id)).toEqual(['7', '1'])
})

test('cleans entities, links and leading mentions', () => {
  expect(cleanPostText('@a @b tea &amp; toast https://t.co/x  ok')).toBe(
    'tea & toast ok',
  )
})

test('keyword matching is whole-word, case-insensitive and forgives simple endings', () => {
  const art = keywordMatcher('art')
  expect(art.test('made some ART today')).toBe(true)
  expect(art.test('two arts')).toBe(true)
  expect(art.test('party time')).toBe(false)
  expect(art.test('artificial')).toBe(false)
  expect(keywordMatcher('build').test('building cuties')).toBe(true)
  expect(keywordMatcher('vibecamp').test('see you at #vibecamp!')).toBe(true)
  const phrase = keywordMatcher('close friend')
  expect(phrase.test('my close-friends know')).toBe(true)
  expect(phrase.test('close  friend')).toBe(true)
  expect(phrase.test('a friend close by')).toBe(false)
  expect(keywordMatcher('c++').test('writing c++ again')).toBe(true)
})

test('parses, lowercases and resolves example refs against the sample', () => {
  const sampleIds = ['100', '200', '300']
  const themes = parseGeneratedThemes(
    JSON.stringify({
      themes: [
        {
          label: 'Building Cuties',
          description: 'Shipping small apps for friends.',
          keywords: ['App', '#cuties', 'app', 'people', 'ship'],
          examples: [1, '[3]', '9', 'x'],
        },
        theme('close friendship', ['friend', 'bestie'], [2]),
        theme('tea ceremony', ['matcha']),
        theme('bouldering', ['climb']),
        theme('sourdough', ['starter']),
        theme('a sixth theme', ['extra']),
      ],
    }),
    sampleIds,
  )
  expect(themes.map((t) => t.label)).toEqual([
    'building cuties',
    'close friendship',
    'tea ceremony',
    'bouldering',
    'sourdough',
  ])
  expect(themes[0]).toEqual({
    label: 'building cuties',
    description: 'Shipping small apps for friends',
    keywords: ['app', 'cuties', 'ship'],
    exampleTweetIds: ['100', '300'],
  })
  expect(themes[1].exampleTweetIds).toEqual(['200'])
})

test('drops long, generic, parroted, duplicate and malformed themes', () => {
  const example = PROMPT_EXAMPLE_THEMES[0]
  const themes = parseGeneratedThemes(
    {
      themes: [
        theme('far too many words in this label', ['words']),
        theme('random thoughts', ['random']),
        theme('Life', ['life']),
        theme('only stop words', ['people', 'think', 'like']),
        { ...theme('long description', ['long']), description: 'x'.repeat(91) },
        theme('with @handle', ['handle']),
        theme(example.label, ['tide']),
        {
          ...theme('copied text', ['copied']),
          description: example.description,
        },
        theme('borrowed keywords', example.keywords.slice(0, 2)),
        { label: 'no description', keywords: ['x'] },
        null,
        'garbage',
        theme('community archive', ['archive']),
        theme('the community archive', ['archive']),
        theme('archives', ['archives']),
        theme('archive tooling', ['tooling']),
      ],
    },
    [],
  )
  expect(themes.map((t) => t.label)).toEqual([
    'community archive',
    'archive tooling',
  ])
  expect(parseGeneratedThemes('not json', [])).toEqual([])
  expect(parseGeneratedThemes({ sections: [] }, [])).toEqual([])
})

const POSTS = [
  post('1', 'shipped a new app tonight', 5),
  post('2', 'app store review again', 50),
  post('3', 'my best friend visited', 1),
  post('4', 'friendship is a garden', 2),
  post('5', 'the app and my friend', 3),
  post('6', 'nothing to see', 0),
]

test('counts every matching post, drops dead keywords and empty themes, sorts by count', () => {
  const themes = countThemes(
    [
      {
        label: 'friends',
        description: 'friends',
        keywords: ['friend', 'friendship', 'pal'],
        exampleTweetIds: ['3', '999'],
      },
      {
        label: 'apps',
        description: 'apps',
        keywords: ['app'],
        exampleTweetIds: [],
      },
      {
        label: 'sailing',
        description: 'sailing',
        keywords: ['boat'],
        exampleTweetIds: ['1'],
      },
    ],
    POSTS,
  )
  expect(themes.map((t) => [t.label, t.postCount])).toEqual([
    ['apps', 3],
    ['friends', 3],
  ])
  // No model examples: the most-liked matching posts stand in.
  expect(themes[0].exampleTweetIds).toEqual(['2', '1', '5'])
  // Unknown ids drop; examples never repeat across themes.
  expect(themes[1].exampleTweetIds).toEqual(['3'])
  expect(themes[1].keywords).toEqual(['friend', 'friendship'])
})

test('drops a theme whose every post is already a bigger theme’s example', () => {
  const themes = countThemes(
    [
      {
        label: 'apps',
        description: 'apps',
        keywords: ['app'],
        exampleTweetIds: ['1', '2', '5'],
      },
      {
        label: 'app store',
        description: 'store',
        keywords: ['store'],
        exampleTweetIds: ['2'],
      },
    ],
    POSTS,
  )
  expect(themes.map((t) => t.label)).toEqual(['apps'])
})

test('model examples must match the theme, else matching posts stand in', () => {
  const [apps] = countThemes(
    [
      {
        label: 'apps',
        description: 'apps',
        keywords: ['app'],
        exampleTweetIds: ['3'],
      },
    ],
    POSTS,
  )
  expect(apps.exampleTweetIds).toEqual(['2', '1', '5'])
})

test('drops keywords matching too much of a big year', () => {
  const posts = Array.from({ length: 100 }, (_, i) =>
    post(String(i), i < 60 ? 'coffee and code' : i < 70 ? 'pottery' : 'misc'),
  )
  expect(60 / 100).toBeGreaterThan(MAX_KEYWORD_SHARE)
  const [result] = countThemes(
    [
      {
        label: 'craft',
        description: 'craft',
        keywords: ['coffee', 'pottery'],
        exampleTweetIds: [],
      },
    ],
    posts,
  )
  expect(result.keywords).toEqual(['pottery'])
  expect(result.postCount).toBe(10)
})

test('small years go to the prompt whole; big ones keep top-liked plus an even spread, deterministically', () => {
  expect(samplePosts(POSTS).map((p) => p.tweet_id)).toHaveLength(6)
  const many = Array.from({ length: 300 }, (_, i) =>
    post(
      String(1000 + i),
      `post ${i}`,
      i % 50 === 0 ? 1000 + i : 0,
      (i % 28) + 1,
    ),
  )
  const sample = samplePosts(many, 100, 10)
  expect(sample).toHaveLength(100)
  expect(new Set(sample.map((p) => p.tweet_id)).size).toBe(100)
  for (const top of many.filter((p) => p.favorite_count >= 1000))
    expect(sample).toContain(top)
  expect(samplePosts(many, 100, 10)).toEqual(sample)
  const sorted = sample
    .slice()
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) ||
        a.tweet_id.localeCompare(b.tweet_id),
    )
  expect(sample).toEqual(sorted)
  // A tight character budget shrinks the sample.
  expect(samplePosts(many, 300, 10, 2000).length).toBeLessThan(300)
})

test('prompt names the year, numbers every sampled post and says when it is a sample', () => {
  const prompt = yearThemePrompt(2025, POSTS.slice(0, 2), 6)
  expect(prompt).toContain('wrote in 2025')
  expect(prompt).toContain('[1] shipped a new app tonight')
  expect(prompt).toContain('[2] app store review again')
  expect(prompt).toContain('sample of 2 of the 6 posts')
  expect(yearThemePrompt(2025, POSTS, 6)).toContain('all 6 of their')
  expect(yearThemePrompt(2025, [post('1', 'x'.repeat(500))], 1)).toContain(
    `${'x'.repeat(239)}…`,
  )
})

test('an all-time prompt names the span of years instead of one year', () => {
  const span = [
    { ...post('1', 'early post'), created_at: '2017-02-01T00:00:00.000Z' },
    post('2', 'recent post'),
  ]
  const prompt = yearThemePrompt(null, span, 2)
  expect(prompt).toContain('wrote between 2017 and 2025')
  expect(prompt).toContain('posted about between 2017 and 2025')
  expect(prompt).toContain('search over all of their posts')
  expect(prompt).not.toContain('null')
})

test('builds a year from a reply, counting over all posts', () => {
  const result = buildYearThemes(
    2025,
    JSON.stringify({ themes: [theme('apps', ['app'], [2])] }),
    POSTS,
    POSTS.slice(0, 2),
  )
  expect(result).toEqual({
    year: 2025,
    totalPosts: 6,
    themes: [
      {
        label: 'apps',
        description: 'posts about apps',
        postCount: 3,
        keywords: ['app'],
        exampleTweetIds: ['2'],
      },
    ],
  })
})

test('retries a failed or thin reply once at 0.7 and keeps the better one', async () => {
  const full = JSON.stringify({
    themes: [
      theme('apps', ['app']),
      theme('friendship', ['friendship', 'best friend']),
      theme('quiet days', ['nothing']),
    ],
  })
  const request = jest
    .fn()
    .mockResolvedValueOnce(JSON.stringify({ themes: [theme('apps', ['app'])] }))
    .mockResolvedValueOnce(full)
  const { result, responses } = await generateYearThemes(2025, POSTS, request)
  expect(request.mock.calls.map(([, t]) => t)).toEqual([0, 0.7])
  expect(responses).toBe(2)
  expect(result!.themes).toHaveLength(3)

  const failing = jest
    .fn()
    .mockRejectedValueOnce(new Error('down'))
    .mockResolvedValueOnce('{"themes": []}')
  const empty = await generateYearThemes(2025, POSTS, failing)
  expect(empty.failures).toBe(1)
  expect(empty.result!.themes).toEqual([])

  // A reply with a full set of distinct themes is kept without a retry.
  const subjects = ['chess', 'gardening', 'sourdough', 'climbing', 'tarot']
  const distinct = subjects.flatMap((subject, i) =>
    [0, 1].map((n) => post(`${i}${n}`, `more ${subject} today`, n, i + 1)),
  )
  const complete = JSON.stringify({
    themes: subjects.map((subject) => theme(subject, [subject])),
  })
  const once = jest.fn().mockResolvedValue(complete)
  const kept = await generateYearThemes(2025, distinct, once)
  expect(once).toHaveBeenCalledTimes(1)
  expect(kept.result!.themes).toHaveLength(5)
})
