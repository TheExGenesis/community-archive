import type { PortalTweet } from '@/lib/portal/types'
import {
  assembleDigestEditionContent,
  buildDigestPromptCorpus,
  renderDigestPrompt,
  selectDailyDigestBangers,
  type EnrichedDigestCandidate,
} from './generation'

const tweet = (id: string, text: string, quoteCount = 3): PortalTweet => ({
  id,
  accountId: `9${id}`,
  username: `user_${id}`,
  name: `User ${id}`,
  avatar: null,
  text,
  observedAt: '2026-08-12T12:00:00.000Z',
  createdAt: `2026-08-12T1${id}:00:00.000Z`,
  likes: Number(id) * 10,
  rts: Number(id),
  quoteCount,
  media: [],
})

const candidates: EnrichedDigestCandidate[] = [
  {
    candidate: {
      tweet: tweet('1', 'taste benchmarks are becoming public rituals', 9),
      sourceRank: 1,
      selected: true,
    },
    commentary: [tweet('11', 'taste is not the same thing as prediction')],
    totalReplyCount: 12,
  },
  {
    candidate: {
      tweet: tweet(
        '2',
        'the group house kitchen whiteboard deserves an archive',
      ),
      sourceRank: 2,
      selected: true,
    },
    commentary: [tweet('22', 'group house memories live in shared objects')],
    totalReplyCount: 7,
  },
  {
    candidate: {
      tweet: tweet('3', 'the parquet release now contains reply graphs'),
      sourceRank: 3,
      selected: true,
    },
    commentary: [tweet('33', 'parquet makes the reply graph easy to study')],
    totalReplyCount: 4,
  },
]

const modelOutput = {
  executive_summary: [
    'A taste benchmark became a public disagreement about prediction and endorsement.',
    'A group-house whiteboard prompted a conversation about memory carried by shared objects.',
    'Researchers began discussing how a new parquet release could support reply-graph analysis.',
  ],
  representative_tweet_index: 0,
  stories: [
    {
      category: 'AI news',
      title: 'taste benchmarks are becoming public rituals',
      subtitle:
        'A forecasting claim turned into a disagreement about prediction, endorsement, and embarrassment.',
      bullets: ['The strongest counterpoint separated prediction from taste.'],
      editorial_note:
        'The disagreement matters more than treating one post as a settled verdict.',
      tweet_indices: [0, 3],
    },
    {
      category: 'Culture',
      title: 'the group house kitchen whiteboard deserves an archive',
      subtitle:
        'A small shared object carried the day’s larger conversation about communal memory.',
      bullets: ['Posts used shared objects to tell the story of a house.'],
      editorial_note:
        'The object is useful because it anchors a broader conversation in something concrete.',
      tweet_indices: [1, 4],
    },
    {
      category: 'News',
      title: 'the parquet release now contains reply graphs',
      subtitle:
        'Researchers immediately connected the release format to new ways of studying archived conversations.',
      bullets: ['The release made reply-graph analysis easier to begin.'],
      editorial_note:
        'This is a release story, with the surrounding posts showing how researchers might use it.',
      tweet_indices: [2, 5],
    },
  ],
  keywords: ['taste', 'group house', 'parquet'],
}

describe('daily digest generation contract', () => {
  test('selects at most 50 posts with a banger score of at least two', () => {
    const ranked = Array.from({ length: 60 }, (_, index) =>
      tweet(
        String(index + 100),
        `rank ${index}`,
        index < 49 ? 3 : index < 55 ? 2 : 1,
      ),
    )

    const selected = selectDailyDigestBangers(ranked)

    expect(selected).toHaveLength(50)
    expect(selected.every((item) => (item.quoteCount ?? 0) >= 2)).toBe(true)
    expect(selected[0].id).toBe('100')
    expect(selected.at(-1)?.id).toBe('149')
    expect(selected.at(-1)?.quoteCount).toBe(2)
  })

  test('renders a reproducible prompt from the frozen candidate snapshot', () => {
    const prompt = renderDigestPrompt(
      '{{digest_date}}|{{window_start}}|{{window_end}}|{{candidate_json}}',
      {
        digestDate: '2026-08-12',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        candidates,
      },
    )

    expect(prompt).toContain('2026-08-12|2026-08-11T12:00:00.000Z')
    expect(prompt).toContain('taste benchmarks are becoming public rituals')
    expect(prompt).toContain('"index": 0')
    expect(prompt).toContain('"archived_ca_quote_count": 9')
    expect(prompt).toContain('"kind": "quote"')
    expect(prompt).toContain('"tweet_id": "1"')
  })

  test('adds bounded published history for continuity without changing the current corpus', () => {
    const prompt = renderDigestPrompt('{{candidate_json}}', {
      digestDate: '2026-08-12',
      windowStart: '2026-08-11T12:00:00.000Z',
      windowEnd: '2026-08-12T12:00:00.000Z',
      candidates,
      priorDigests: [
        {
          digestDate: '2026-08-11',
          executiveSummary: ['The community compared model taste.'],
          storyTitles: ['Taste benchmarks became public rituals'],
          keywords: ['taste'],
        },
      ],
    })

    expect(prompt).toContain('PAST PUBLISHED DIGESTS')
    expect(prompt).toContain('"digest_date": "2026-08-11"')
    expect(prompt).toContain('TODAY\'S CURRENT CANDIDATE CORPUS')
    expect(prompt.match(/"tweet_id": "1"/g)).toHaveLength(1)
  })

  test('indexes all bangers before reply and quote context', () => {
    const corpus = buildDigestPromptCorpus([
      { ...candidates[0], replyTweetIds: ['11'] },
      ...candidates.slice(1),
    ])

    expect(corpus.map(({ tweetId }) => tweetId)).toEqual([
      '1',
      '2',
      '3',
      '11',
      '22',
      '33',
    ])
    expect(corpus[3]).toMatchObject({
      index: 3,
      kind: 'reply',
      parentBangerIndex: 0,
    })
  })

  test('assembles validated story and tweet snapshots for publication', () => {
    const edition = assembleDigestEditionContent({
      runId: 'run-1',
      digestDate: '2026-08-12',
      windowStart: '2026-08-11T12:00:00.000Z',
      windowEnd: '2026-08-12T12:00:00.000Z',
      allCandidateCount: 12,
      enrichedCandidates: candidates,
      modelOutput,
      generatedAt: '2026-08-12T12:01:00.000Z',
    })

    expect(edition.topBanger.id).toBe('1')
    expect(edition.executiveSummary).toHaveLength(3)
    expect(edition.stories).toHaveLength(3)
    expect(edition.stories[0]).toMatchObject({
      slug: 'taste-benchmarks-are-becoming-public-rituals',
      category: 'AI news',
      keyword: 'taste',
      replyCount: 12,
    })
    expect(edition.stories[0].commentary[0].id).toBe('11')
    expect(edition.stories[0].editorialNote).toContain('settled verdict')
    expect(edition.source).toEqual({
      candidateCount: 12,
      selectedCount: 3,
      runId: 'run-1',
    })
  })

  test('rejects generated keywords that do not occur in the posts', () => {
    expect(() =>
      assembleDigestEditionContent({
        runId: 'run-1',
        digestDate: '2026-08-12',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        allCandidateCount: 3,
        enrichedCandidates: candidates,
        modelOutput: {
          ...modelOutput,
          keywords: ['agentic discourse', 'invented label', 'fake topic'],
        },
      }),
    ).toThrow('Fewer than three generated keywords occur in the posts')
  })

  test('rejects an abstract that is not exactly a three-item bullet list', () => {
    expect(() =>
      assembleDigestEditionContent({
        runId: 'run-1',
        digestDate: '2026-08-12',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        allCandidateCount: 3,
        enrichedCandidates: candidates,
        modelOutput: {
          ...modelOutput,
          executive_summary: ['Only one summary item.'],
        },
      }),
    ).toThrow('exactly three summary bullets')
  })

  test('keeps a short subtitle as a non-fatal editorial warning', () => {
    const edition = assembleDigestEditionContent({
      runId: 'run-1',
      digestDate: '2026-08-12',
      windowStart: '2026-08-11T12:00:00.000Z',
      windowEnd: '2026-08-12T12:00:00.000Z',
      allCandidateCount: 3,
      enrichedCandidates: candidates,
      modelOutput: {
        ...modelOutput,
        stories: [
          { ...modelOutput.stories[0], subtitle: 'People discussed taste.' },
          ...modelOutput.stories.slice(1),
        ],
      },
    })

    expect(edition.editorialWarnings).toContain(
      'Story 1 subtitle is outside the 60–320 character target.',
    )
  })

  test('preserves a complete subtitle beyond the old 150-character schema cap', () => {
    const subtitle =
      'Thebes argued that image and video labs optimized their models to replace artists rather than collaborate with them, framing the newest releases as evidence that the same incentive pattern is continuing.'
    expect(subtitle.length).toBeGreaterThan(150)

    const edition = assembleDigestEditionContent({
      runId: 'run-1',
      digestDate: '2026-08-12',
      windowStart: '2026-08-11T12:00:00.000Z',
      windowEnd: '2026-08-12T12:00:00.000Z',
      allCandidateCount: 3,
      enrichedCandidates: candidates,
      modelOutput: {
        ...modelOutput,
        stories: [
          { ...modelOutput.stories[0], subtitle },
          ...modelOutput.stories.slice(1),
        ],
      },
    })

    expect(edition.stories[0].subtitle).toBe(subtitle)
    expect(edition.editorialWarnings).not.toContain(
      'Story 1 subtitle is outside the 60–320 character target.',
    )
  })

  test('rejects fabricated tweet indices before publication', () => {
    expect(() =>
      assembleDigestEditionContent({
        runId: 'run-1',
        digestDate: '2026-08-12',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        allCandidateCount: 3,
        enrichedCandidates: candidates,
        modelOutput: {
          ...modelOutput,
          stories: [
            { ...modelOutput.stories[0], tweet_indices: [999] },
            ...modelOutput.stories.slice(1),
          ],
        },
      }),
    ).toThrow('unknown tweet index')
  })

  test('requires each story to select at least one indexed banger', () => {
    expect(() =>
      assembleDigestEditionContent({
        runId: 'run-1',
        digestDate: '2026-08-12',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        allCandidateCount: 3,
        enrichedCandidates: candidates,
        modelOutput: {
          ...modelOutput,
          stories: [
            { ...modelOutput.stories[0], tweet_indices: [3] },
            ...modelOutput.stories.slice(1),
          ],
        },
      }),
    ).toThrow('must include at least one banger index')
  })

  test('rejects repeated indices and non-numeric representative references', () => {
    expect(() =>
      assembleDigestEditionContent({
        runId: 'run-1',
        digestDate: '2026-08-12',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        allCandidateCount: 3,
        enrichedCandidates: candidates,
        modelOutput: {
          ...modelOutput,
          stories: [
            { ...modelOutput.stories[0], tweet_indices: [0, 0] },
            ...modelOutput.stories.slice(1),
          ],
        },
      }),
    ).toThrow('repeated a tweet index')

    expect(() =>
      assembleDigestEditionContent({
        runId: 'run-1',
        digestDate: '2026-08-12',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        allCandidateCount: 3,
        enrichedCandidates: candidates,
        modelOutput: { ...modelOutput, representative_tweet_index: '0' },
      }),
    ).toThrow('representative tweet index')
  })

  test('rejects categories outside the editorial taxonomy', () => {
    expect(() =>
      assembleDigestEditionContent({
        runId: 'run-1',
        digestDate: '2026-08-12',
        windowStart: '2026-08-11T12:00:00.000Z',
        windowEnd: '2026-08-12T12:00:00.000Z',
        allCandidateCount: 3,
        enrichedCandidates: candidates,
        modelOutput: {
          ...modelOutput,
          stories: [
            { ...modelOutput.stories[0], category: 'AI discourse' },
            ...modelOutput.stories.slice(1),
          ],
        },
      }),
    ).toThrow('Story 1 is incomplete')
  })

  test('accepts a concise paraphrased title and marks it as unquoted', () => {
    const edition = assembleDigestEditionContent({
      runId: 'run-1',
      digestDate: '2026-08-12',
      windowStart: '2026-08-11T12:00:00.000Z',
      windowEnd: '2026-08-12T12:00:00.000Z',
      allCandidateCount: 3,
      enrichedCandidates: candidates,
      modelOutput: {
        ...modelOutput,
        stories: [
          {
            ...modelOutput.stories[0],
            title: 'Taste became the benchmark of the day',
          },
          ...modelOutput.stories.slice(1),
        ],
      },
    })

    expect(edition.stories[0]).toMatchObject({
      title: 'Taste became the benchmark of the day',
      titleIsQuote: false,
    })
    expect(edition.editorialWarnings).toContain(
      'Story 1 title is a paraphrase rather than an exact tweet excerpt.',
    )
  })

  test('uses the model-selected representative tweet instead of forcing rank one', () => {
    const edition = assembleDigestEditionContent({
      runId: 'run-1',
      digestDate: '2026-08-12',
      windowStart: '2026-08-11T12:00:00.000Z',
      windowEnd: '2026-08-12T12:00:00.000Z',
      allCandidateCount: 3,
      enrichedCandidates: candidates,
      modelOutput: { ...modelOutput, representative_tweet_index: 3 },
    })

    expect(edition.topBanger.id).toBe('11')
  })
})
