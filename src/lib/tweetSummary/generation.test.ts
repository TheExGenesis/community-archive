import {
  hasGenreOpener,
  parseSummaryOutput,
  precheckEligibility,
  stripGenreOpener,
} from './generation'
import type { TweetPageSubject } from './subject'

const subjectWith = (...texts: string[]): TweetPageSubject => ({
  kind: texts.length > 1 ? 'thread' : 'tweet',
  key: 'k',
  highlightId: '1',
  chain: texts.map((text, i) => ({
    tweet_id: String(i + 1),
    account_id: 'a',
    username: 'alice',
    display_name: 'Alice',
    created_at: '2026-01-01T00:00:00Z',
    text,
  })),
  context: [],
  author: { username: 'alice', displayName: 'Alice' },
})

const description =
  'A reflection on how trust is rebuilt gradually through repeated experiences of reliability, using the metaphor of strengthening a muscle to describe learning to trust others again.'

describe('precheckEligibility', () => {
  it.each([
    'lol',
    'gm frens ☀️',
    'yes exactly this',
    '@bob wow 🔥',
    'https://t.co/abc',
  ])('skips low-content post %p', (text) =>
    expect(precheckEligibility(subjectWith(text)).eligible).toBe(false),
  )

  it('lets a terse but substantive line through to the model', () => {
    expect(
      precheckEligibility(subjectWith('beauty is attention')).eligible,
    ).toBe(true)
  })

  it("does not count a quoted tweet as the post's own content", () => {
    const subject = subjectWith('lol')
    subject.chain[0]!.quoted = {
      username: 'bob',
      text: 'Trust is a muscle you rebuild by repetition',
    }
    expect(precheckEligibility(subject).eligible).toBe(false)
  })

  it('judges a thread by its whole chain, not the short linked reply', () => {
    expect(
      precheckEligibility(
        subjectWith('Trust is a muscle you rebuild by repetition', 'lol'),
      ).eligible,
    ).toBe(true)
  })
})

describe('parseSummaryOutput', () => {
  it('accepts a well-formed summary and cleans the title', () => {
    expect(
      parseSummaryOutput(
        JSON.stringify({
          eligible: true,
          title: '"Rebuilding trust one rep at a time."',
          description,
        }),
      ),
    ).toEqual({
      eligible: true,
      title: 'Rebuilding trust one rep at a time',
      description,
    })
  })

  it('records a model ineligibility verdict', () => {
    expect(
      parseSummaryOutput({ eligible: false, title: '', description: '' }),
    ).toEqual({
      eligible: false,
      reason: 'model',
    })
  })

  it.each([
    ['malformed JSON', '{"eligible": true'],
    [
      'missing eligibility',
      { title: 'A fine title for the page', description },
    ],
    ['too-short title', { eligible: true, title: 'Trust', description }],
    [
      'too-short description',
      {
        eligible: true,
        title: 'Rebuilding trust through practice',
        description: 'Too short.',
      },
    ],
    [
      'hashtag title',
      { eligible: true, title: 'Rebuilding trust #selfhelp now', description },
    ],
    [
      'echoed example',
      {
        eligible: true,
        title: 'Rebuilding trust through repetition',
        description,
      },
    ],
    [
      '"This tweet" opener',
      {
        eligible: true,
        title: 'Rebuilding trust through practice',
        description: `This tweet is ${description}`,
      },
    ],
  ])('rejects %s', (_label, raw) => expect(parseSummaryOutput(raw)).toBeNull())
})

describe('genre openers', () => {
  it('detects titles that frame instead of stating', () => {
    expect(hasGenreOpener('A defense of using precise probabilities')).toBe(
      true,
    )
    expect(hasGenreOpener('A satirical critique of doom forecasting')).toBe(
      true,
    )
    expect(hasGenreOpener('Arguing for probability in existential risk')).toBe(
      false,
    )
    expect(
      hasGenreOpener('A familiar pattern in reactions to new movements'),
    ).toBe(false)
  })

  it('strips the framing as a last resort', () => {
    expect(stripGenreOpener('A defense of using precise probabilities')).toBe(
      'Using precise probabilities',
    )
  })
})
