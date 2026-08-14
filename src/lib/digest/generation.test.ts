import type { PortalTweet } from '@/lib/portal/types'
import {
  assembleDigestEditionContent,
  renderDigestPrompt,
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
  stories: [
    {
      category: 'AI news',
      keyword: 'taste',
      title: 'taste benchmarks are becoming public rituals',
      subtitle:
        'A forecasting claim turned into a disagreement about prediction, endorsement, and embarrassment.',
      bullets: ['The strongest counterpoint separated prediction from taste.'],
      editorial_note:
        'The disagreement matters more than treating one post as a settled verdict.',
      banger_tweet_ids: ['1'],
      commentary_tweet_ids: ['11'],
    },
    {
      category: 'Culture',
      keyword: 'group house',
      title: 'the group house kitchen whiteboard deserves an archive',
      subtitle:
        'A small shared object carried the day’s larger conversation about communal memory.',
      bullets: ['Posts used shared objects to tell the story of a house.'],
      editorial_note:
        'The object is useful because it anchors a broader conversation in something concrete.',
      banger_tweet_ids: ['2'],
      commentary_tweet_ids: ['22'],
    },
    {
      category: 'News',
      keyword: 'parquet',
      title: 'the parquet release now contains reply graphs',
      subtitle:
        'Researchers immediately connected the release format to new ways of studying archived conversations.',
      bullets: ['The release made reply-graph analysis easier to begin.'],
      editorial_note:
        'This is a release story, with the surrounding posts showing how researchers might use it.',
      banger_tweet_ids: ['3'],
      commentary_tweet_ids: ['33'],
    },
  ],
  trending_keywords: ['taste', 'group house', 'parquet'],
}

describe('daily digest generation contract', () => {
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
    expect(prompt).toContain('"archived_reply_count": 12')
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
      slug: 'taste',
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

  test('rejects AI-derived topic labels that do not occur in the posts', () => {
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
            { ...modelOutput.stories[0], keyword: 'agentic discourse' },
            ...modelOutput.stories.slice(1),
          ],
        },
      }),
    ).toThrow('does not occur in the posts')
  })

  test('rejects an abstract that is not a three- to five-item bullet list', () => {
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
    ).toThrow('three to five summary bullets')
  })

  test('rejects subtitles too short to explain the quoted title', () => {
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
            { ...modelOutput.stories[0], subtitle: 'People discussed taste.' },
            ...modelOutput.stories.slice(1),
          ],
        },
      }),
    ).toThrow('at least twelve words of explanatory context')
  })

  test('rejects fabricated tweet IDs before publication', () => {
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
            { ...modelOutput.stories[0], banger_tweet_ids: ['999'] },
            ...modelOutput.stories.slice(1),
          ],
        },
      }),
    ).toThrow('unknown banger tweet ID')
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

  test('rejects generated headlines that are not excerpts from a supplied post', () => {
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
            {
              ...modelOutput.stories[0],
              title: 'Taste became the benchmark of the day',
            },
            ...modelOutput.stories.slice(1),
          ],
        },
      }),
    ).toThrow('title must be a three- to eighteen-word excerpt')
  })
})
