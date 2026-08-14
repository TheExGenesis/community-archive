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
  executive_summary:
    'The archive debated taste, remembered a group house, and started mining a new parquet release.',
  stories: [
    {
      category: 'AI',
      keyword: 'taste',
      title: 'Taste became a benchmark and a public argument',
      subtitle:
        'A forecasting claim turned into a disagreement about prediction, endorsement, and embarrassment.',
      bullets: ['The strongest counterpoint separated prediction from taste.'],
      banger_tweet_ids: ['1'],
      commentary_tweet_ids: ['11'],
    },
    {
      category: 'culture',
      keyword: 'group house',
      title: 'A kitchen whiteboard became the group-house memorial',
      subtitle:
        'A small shared object carried the day’s larger conversation about communal memory.',
      bullets: ['Posts used shared objects to tell the story of a house.'],
      banger_tweet_ids: ['2'],
      commentary_tweet_ids: ['22'],
    },
    {
      category: 'science',
      keyword: 'parquet',
      title: 'Reply graphs arrived in the new parquet release',
      subtitle:
        'Researchers immediately connected the release format to new ways of studying archived conversations.',
      bullets: ['The release made reply-graph analysis easier to begin.'],
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
    expect(edition.stories).toHaveLength(3)
    expect(edition.stories[0]).toMatchObject({
      slug: 'taste',
      category: 'AI',
      keyword: 'taste',
      replyCount: 12,
    })
    expect(edition.stories[0].commentary[0].id).toBe('11')
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
})
