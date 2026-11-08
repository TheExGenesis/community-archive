import type { PortalTweet, TermWeek } from '@/lib/portal/types'
import {
  groupTermsByStory,
  indexEvidence,
  parseTrendStoryOutput,
  slugifyTrend,
  trendDateForTerms,
  trendStoryFromRow,
  trendStoryToRow,
} from './core'
import { generateTrendStories } from './generate'

const term = (
  name: string,
  lane: TermWeek['lane'],
  deltaPct: number | null,
): TermWeek => ({
  term: name,
  lane,
  last7: 40,
  prev7: 10,
  currentAuthors: 12,
  sinceDate: '2026-10-30',
  untilDate: '2026-11-05',
  deltaPct,
  status: deltaPct === null ? 'new' : 'comparable',
})

const tweet = (
  id: string,
  likes: number,
  text = `tweet ${id}`,
): PortalTweet => ({
  id,
  accountId: `a${id}`,
  username: `user${id}`,
  name: `User ${id}`,
  avatar: null,
  text,
  observedAt: '2026-11-03T00:00:00.000Z',
  createdAt: '2026-11-03T00:00:00.000Z',
  likes,
  rts: 0,
})

const terms = [
  term('effective altruism', 'emerging', null),
  term('ai math', 'rising', 300),
  term('ea', 'rising', 120),
  term('math', 'falling', -40),
]

const story = (names: string[], label: string, indices = [0]) => ({
  terms: names,
  label,
  title: `${label} headline`,
  tooltip: `People are talking about ${label}.`,
  summary: `A longer explanation of what happened with ${label}.`,
  bullets: ['First point here'],
  tweet_indices: indices,
})

const input = {
  trendDate: '2026-11-06',
  terms,
  tweets: [tweet('1', 5), tweet('2', 9)],
  model: 'test/model',
  generatedAt: '2026-11-06T07:30:00.000Z',
}

test('the trend date is the day after the window', () => {
  expect(trendDateForTerms(terms)).toBe('2026-11-06')
  expect(trendDateForTerms([])).toBeNull()
  expect(
    trendDateForTerms([terms[0], { ...terms[1], untilDate: '2026-11-04' }]),
  ).toBeNull()
})

test('merges terms into stories ordered by first homepage position', () => {
  const stories = parseTrendStoryOutput(
    {
      stories: [
        story(['AI Math', 'math'], 'AI math', [1, 0, 1, 99]),
        story(['effective altruism', 'ea'], 'effective altruism'),
      ],
    },
    input,
  )
  expect(stories.map((s) => [s.slug, s.position, s.terms])).toEqual([
    ['effective-altruism', 0, ['effective altruism', 'ea']],
    ['ai-math', 1, ['ai math', 'math']],
  ])
  expect(stories[1].lane).toBe('rising')
  // Duplicate and out-of-range indices are dropped.
  expect(stories[1].tweets.map((t) => t.id)).toEqual(['2', '1'])
  expect(stories[0].stats.terms[0]).toMatchObject({
    term: 'effective altruism',
    changePct: null,
  })
})

test('rejects unknown, duplicated, or missing terms', () => {
  expect(() =>
    parseTrendStoryOutput(
      {
        stories: [story(['effective altruism', 'ea', 'ai math', 'cats'], 'x')],
      },
      input,
    ),
  ).toThrow(/unknown term/)
  expect(() =>
    parseTrendStoryOutput(
      {
        stories: [
          story(['effective altruism', 'ea', 'math'], 'x'),
          story(['ai math', 'math'], 'y'),
        ],
      },
      input,
    ),
  ).toThrow(/used twice/)
  expect(() =>
    parseTrendStoryOutput(
      { stories: [story(['effective altruism', 'ea'], 'x')] },
      input,
    ),
  ).toThrow(/missing terms "ai math", "math"/)
})

test('slugs are url-safe and unique', () => {
  expect(slugifyTrend('Claude 5 / Opus!')).toBe('claude-5-opus')
  expect(slugifyTrend('???')).toBe('story')
  const stories = parseTrendStoryOutput(
    {
      stories: [
        story(['effective altruism', 'ea'], 'Same'),
        story(['ai math', 'math'], 'same'),
      ],
    },
    input,
  )
  expect(stories.map((s) => s.slug)).toEqual(['same', 'same-2'])
})

test('evidence is ranked by likes and de-duplicated across terms', () => {
  const indexed = indexEvidence(
    ['a', 'b'],
    new Map([
      ['a', [tweet('1', 1), tweet('2', 50)]],
      ['b', [tweet('2', 50), tweet('3', 7)]],
    ]),
  )
  expect(indexed.tweets.map((t) => t.id)).toEqual(['2', '1', '3'])
  expect(indexed.byTerm.get('b')).toEqual([0, 2])
})

test('rows round-trip', () => {
  const [first] = parseTrendStoryOutput(
    {
      stories: [
        story(['effective altruism', 'ea'], 'ea'),
        story(['ai math', 'math'], 'math'),
      ],
    },
    input,
  )
  expect(trendStoryFromRow(trendStoryToRow(first))).toEqual(first)
})

test('homepage chips collapse merged terms and keep unstoried ones', () => {
  const stories = parseTrendStoryOutput(
    {
      stories: [
        story(['ea', 'effective altruism'], 'EA'),
        story(['ai math'], 'ai math'),
        story(['math'], 'math'),
      ],
    },
    input,
  ).filter((s) => s.slug !== 'math')
  const chips = groupTermsByStory(terms, stories)
  expect(chips.map((c) => [c.term.term, c.story?.slug ?? null])).toEqual([
    ['ea', 'ea'],
    ['ai math', 'ai-math'],
    ['math', null],
  ])
})

test('generation retries once with the validation error', async () => {
  const calls: string[] = []
  const stories = await generateTrendStories({
    terms,
    fetchEvidence: async (t) => [tweet(t.term.length.toString(), 3)],
    callModel: async ({ user }) => {
      calls.push(user)
      return {
        model: 'test/model',
        output: {
          stories:
            calls.length === 1
              ? [story(['ea'], 'ea')]
              : [
                  story(['ea', 'effective altruism'], 'ea'),
                  story(['ai math', 'math'], 'math'),
                ],
        },
      }
    },
  })
  expect(calls).toHaveLength(2)
  expect(calls[1]).toMatch(/previous answer was rejected: .*missing terms/)
  expect(stories).toHaveLength(2)
  expect(stories[0].trendDate).toBe('2026-11-06')
})
