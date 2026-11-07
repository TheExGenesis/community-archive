import type { PortalTweet } from '@/lib/portal/types'
import type { DigestEditionContent, DigestStory } from './types'
import {
  assembleWeeklyDigestContent,
  priorWeeksFor,
  renderWeeklyDigestPrompt,
  weekDates,
  weekStartFor,
  weeklyDigestToMarkdown,
  type WeeklyDigestContent,
  type WeeklySourceEdition,
} from './weekly'

const tweet = (id: string): PortalTweet => ({
  id,
  username: `user_${id}`,
  name: `User ${id}`,
  avatar: null,
  text: `tweet ${id}`,
  observedAt: '2026-10-27T12:00:00.000Z',
  createdAt: '2026-10-27T10:00:00.000Z',
  likes: 100,
  rts: 1,
  quoteCount: 4,
})

const story = (slug: string, title: string, tweetId: string): DigestStory => ({
  slug,
  category: 'AI news',
  keyword: 'neuron',
  title,
  subtitle: 'A subtitle long enough to be a real subtitle for the story.',
  bullets: ['Something happened.'],
  bangers: [tweet(tweetId)],
  commentary: [],
  replyCount: 2,
  peakedAt: null,
})

const edition = (
  digestDate: string,
  stories: DigestStory[],
): WeeklySourceEdition => ({
  digestDate,
  issueNumber: 1,
  content: {
    digestDate,
    windowStart: `${digestDate}T06:00:00.000Z`,
    windowEnd: `${digestDate}T06:00:00.000Z`,
    generatedAt: `${digestDate}T07:00:00.000Z`,
    executiveSummary: ['a', 'b', 'c'],
    topBanger: stories[0].bangers[0],
    stories,
    keywords: [],
    source: { candidateCount: 1, selectedCount: 1, runId: 'run' },
  } as DigestEditionContent,
})

const WEEK = '2026-10-26'
const editions = [
  edition('2026-10-26', [
    story('green-neuron', 'I found a green neuron', '1'),
    story('swarm', 'A good guy with a swarm', '2'),
  ]),
  edition('2026-10-28', [story('persona-neurons', 'Persona neurons', '3')]),
  edition('2026-10-30', [story('binance', 'Binance hacked', '4')]),
]

const priorWeek: WeeklyDigestContent = {
  weekStart: '2026-10-12',
  weekEnd: '2026-10-18',
  generatedAt: '2026-10-19T00:00:00.000Z',
  executiveSummary: ['x', 'y', 'z'],
  stories: [
    {
      slug: 'neurons-are-clean',
      kind: 'ongoing',
      title: 'Neurons are already clean',
      subtitle: 'subtitle',
      bullets: ['b'],
      connection: '',
      continuityNote: '',
      continuesFrom: [],
      dailyStories: [],
      days: ['2026-10-13', '2026-10-15'],
      tweets: [],
    },
  ],
  alsoNotable: [],
  source: {
    editionDates: [],
    missingDates: [],
    dailyStoryCount: 0,
    priorWeekStarts: [],
  },
}

const summary = [
  'Community researchers spent the week reading single neurons in open models.',
  'Binance was reportedly hacked for $5.6 billion on Friday.',
  'A defender argued that only a swarm of good agents can stop a bad one.',
]

const validOutput = {
  executive_summary: summary,
  stories: [
    {
      kind: 'ongoing',
      title: 'From a green neuron to a persona-neuron library',
      subtitle:
        'Researchers built on one another across the week, from a joke find to a searchable library.',
      bullets: ['Mon: a green neuron.', 'Wed: a persona library.'],
      connection:
        'The persona library author credits the green-neuron post as the inspiration.',
      daily_refs: ['2026-10-26#1', '2026-10-28#1'],
      continues_from: ['W2026-10-12#1'],
      continuity_note:
        'Two weeks ago the debate was whether neurons are legible; now there are tools.',
    },
    {
      kind: 'major',
      title: 'Binance reportedly hacked for $5.6 billion',
      subtitle:
        'The largest reported theft of the week drew questions about exchange custody.',
      bullets: ['Fri: the hack was reported.'],
      connection: '',
      daily_refs: ['2026-10-30#1'],
      continues_from: [],
      continuity_note: '',
    },
    {
      kind: 'major',
      title: 'Only a good guy with a swarm can stop a bad guy with one',
      subtitle:
        'A defensive-security argument that agents must defend against agents.',
      bullets: ['Mon: the argument went viral.'],
      connection: 'ignored for one source',
      daily_refs: ['2026-10-26#2'],
      continues_from: [],
      continuity_note: '',
    },
  ],
  also_notable: [] as { daily_ref: string; line: string }[],
}

const assemble = (modelOutput: unknown) =>
  assembleWeeklyDigestContent({
    weekStart: WEEK,
    editions,
    priorWeeks: [priorWeek],
    modelOutput,
    generatedAt: '2026-11-02T00:00:00.000Z',
  })

describe('week arithmetic', () => {
  it('maps any date to its Monday and lists seven days', () => {
    expect(weekStartFor('2026-11-01')).toBe('2026-10-26')
    expect(weekStartFor('2026-10-26')).toBe('2026-10-26')
    expect(weekDates('2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
    expect(() => weekDates('2026-10-27')).toThrow('not a Monday')
  })

  it('keeps at most the two immediately previous weeks, newest first', () => {
    const week = (weekStart: string) => ({ ...priorWeek, weekStart })
    const result = priorWeeksFor('2026-10-26', [
      week('2026-10-05'),
      week('2026-10-12'),
      week('2026-10-19'),
    ])
    expect(result.map(({ weekStart }) => weekStart)).toEqual([
      '2026-10-19',
      '2026-10-12',
    ])
  })
})

describe('renderWeeklyDigestPrompt', () => {
  it('lists daily refs, missing days and prior weekly refs', () => {
    const prompt = renderWeeklyDigestPrompt({
      weekStart: WEEK,
      editions,
      priorWeeks: [priorWeek],
    })
    expect(prompt).toContain('"ref": "2026-10-26#2"')
    expect(prompt).toContain('"ref": "W2026-10-12#1"')
    expect(prompt).toContain('2026-10-27, 2026-10-29, 2026-10-31, 2026-11-01')
  })

  it('ignores editions outside the week', () => {
    const prompt = renderWeeklyDigestPrompt({
      weekStart: WEEK,
      editions: [
        ...editions,
        edition('2026-11-02', [story('x', 'Next week', '9')]),
      ],
      priorWeeks: [],
    })
    expect(prompt).not.toContain('2026-11-02#1')
    expect(prompt).toContain('Leave every continues_from empty')
  })
})

describe('assembleWeeklyDigestContent', () => {
  it('resolves daily and weekly refs into stored content', () => {
    const content = assemble(validOutput)
    expect(content.weekEnd).toBe('2026-11-01')
    expect(content.source.missingDates).toHaveLength(4)
    expect(content.source.priorWeekStarts).toEqual(['2026-10-12'])
    const [ongoing, major, single] = content.stories
    expect(ongoing.days).toEqual(['2026-10-26', '2026-10-28'])
    expect(ongoing.dailyStories.map(({ slug }) => slug)).toEqual([
      'green-neuron',
      'persona-neurons',
    ])
    expect(ongoing.tweets.map(({ id }) => id)).toEqual(['1', '3'])
    expect(ongoing.continuesFrom).toEqual([
      {
        weekStart: '2026-10-12',
        slug: 'neurons-are-clean',
        title: 'Neurons are already clean',
      },
    ])
    expect(major.slug).toBe('binance-reportedly-hacked-for-5-6-billion')
    expect(single.connection).toBe('')
    expect(weeklyDigestToMarkdown(content)).toContain(
      '/digest/2026-10-28/persona-neurons',
    )
  })

  it('rejects unknown refs, reused refs and single-day ongoing stories', () => {
    const output = structuredClone(validOutput)
    output.stories[1].daily_refs = ['2026-10-26#1', '2026-10-27#1']
    output.stories[1].kind = 'ongoing'
    expect(() => assemble(output)).toThrow(
      /used by both stories\[0\] and stories\[1\].*unknown ref 2026-10-27#1/,
    )
    const singleDay = structuredClone(validOutput)
    singleDay.stories[2].kind = 'ongoing'
    expect(() => assemble(singleDay)).toThrow('only one date')
  })

  it('requires an explicit connection when bundling daily stories', () => {
    const output = structuredClone(validOutput)
    output.stories[0].connection = ''
    expect(() => assemble(output)).toThrow('must explain concretely')
  })

  it('requires a continuity note and a real prior weekly ref', () => {
    const output = structuredClone(validOutput)
    output.stories[0].continuity_note = ''
    expect(() => assemble(output)).toThrow('what is new this week')
    const unknown = structuredClone(validOutput)
    unknown.stories[1].continues_from = ['W2026-10-19#1']
    expect(() => assemble(unknown)).toThrow('unknown weekly ref W2026-10-19#1')
  })

  it('rejects overlong summary bullets and also-notable duplicates', () => {
    const long = structuredClone(validOutput)
    long.executive_summary[2] = 'x'.repeat(201)
    expect(() => assemble(long)).toThrow(
      'executive_summary[2] is 201 characters',
    )
    const dup = structuredClone(validOutput)
    dup.also_notable = [
      { daily_ref: '2026-10-30#1', line: 'Binance again here' },
    ]
    expect(() => assemble(dup)).toThrow('already in a weekly story')
  })
})
