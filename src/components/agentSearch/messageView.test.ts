import type { UIMessage } from 'ai'
import type { AgentTweet, ScoredTweet } from '@/lib/agentSearch/types'
import {
  NOT_SEARCHED_LINE,
  answerText,
  buildAnswer,
  buildCoverage,
  buildTurnView,
  collectToolTweets,
  describeChatError,
  formatElapsed,
  progressLines,
  receiptSegments,
  searchSubject,
  toolCalls,
} from './messageView'

const tweet = (id: string, extra: Partial<AgentTweet> = {}): AgentTweet => ({
  id,
  username: `user${id}`,
  name: `User ${id}`,
  avatar: null,
  text: `Post ${id}`,
  observedAt: '2025-01-02T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  likes: 0,
  rts: 0,
  replyToTweetId: null,
  replyToUsername: null,
  quoteTweetId: null,
  ...extra,
})

const scored = (id: string, p: number): ScoredTweet => ({ ...tweet(id), p })

const toolPart = (
  name: string,
  input: Record<string, unknown>,
  output?: unknown,
  state = output === undefined ? 'input-available' : 'output-available',
) =>
  ({
    type: `tool-${name}`,
    toolCallId: `call-${name}-${JSON.stringify(input).length}`,
    state,
    input,
    ...(output === undefined ? {} : { output }),
    ...(state === 'output-error' ? { errorText: 'boom' } : {}),
  }) as unknown as UIMessage['parts'][number]

const text = (value: string) =>
  ({ type: 'text', text: value }) as UIMessage['parts'][number]

const assistant = (id: string, parts: UIMessage['parts']): UIMessage => ({
  id,
  role: 'assistant',
  parts,
})

const user = (id: string, value: string): UIMessage => ({
  id,
  role: 'user',
  parts: [text(value)],
})

describe('progressLines', () => {
  test('describes each tool call from its input and output', () => {
    const message = assistant('a1', [
      { type: 'step-start' } as UIMessage['parts'][number],
      toolPart(
        'search_tweets',
        { query: 'community archive', fromUser: 'alice' },
        {
          query: 'community archive',
          tweets: [tweet('1'), tweet('2')],
          nextOffset: null,
        },
      ),
      toolPart(
        'collect_and_score',
        { terms: ['archive', 'CA'], criterion: 'Is this a complaint?' },
        {
          terms: ['archive', 'CA'],
          collected: 412,
          limit: 1000,
          capped: false,
          scored: 412,
          keptCount: 31,
          kept: [scored('3', 0.9)],
          borderline: [],
          scorer: 'llm',
          costUsd: 0.01,
        },
      ),
      toolPart(
        'score_tweets',
        { criterion: 'x', tweetIds: ['1', '2'] },
        { criterion: 'x', scored: [scored('1', 0.7), scored('2', 0.2)] },
      ),
      toolPart(
        'get_thread',
        { tweetId: '1' },
        { tweet: tweet('1'), conversation: [tweet('1'), tweet('4')] },
      ),
      toolPart(
        'get_quote_posts',
        { tweetId: '1' },
        { tweetId: '1', total: 1, tweets: [tweet('5')] },
      ),
      toolPart('get_tweets', { tweetIds: ['9'] }, undefined, 'output-error'),
      toolPart('find_people', { query: 'visa' }),
    ])

    expect(
      progressLines(message).map((line) => [line.status, line.text]),
    ).toEqual([
      ['done', 'Searched “community archive” from @alice · 2 tweets'],
      ['done', 'Checked 412 posts matching “archive”, “CA” · 31 kept'],
      ['done', 'Scored 2 posts · 1 kept'],
      ['done', 'Read thread · 2 posts'],
      ['done', 'Read quotes · 1 post'],
      ['error', 'Could not fetch posts'],
      ['running', 'Looking up “visa”'],
    ])
  })

  test('says what collect_and_score checks and when it hit the limit', () => {
    const input = {
      terms: ['book'],
      fromUser: 'patio11',
      criterion: 'Does this tweet recommend a book?',
    }
    const running = assistant('a1', [toolPart('collect_and_score', input)])
    expect(progressLines(running)[0].text).toBe(
      'Checking up to 300 posts matching “book” from @patio11 against “Does this tweet recommend a book?”',
    )
    const done = assistant('a2', [
      toolPart('collect_and_score', input, {
        collected: 300,
        limit: 300,
        capped: true,
        scored: 300,
        keptCount: 12,
        kept: [],
        borderline: [],
      }),
    ])
    expect(progressLines(done)[0].text).toBe(
      'Checked 300 posts matching “book” from @patio11 · 12 kept · stopped at the 300-post limit',
    )
  })

  test('reads dynamic tool parts by toolName', () => {
    const message = assistant('a1', [
      {
        type: 'dynamic-tool',
        toolName: 'get_thread',
        toolCallId: 'c1',
        state: 'output-available',
        input: { tweetId: '1' },
        output: { notFound: true },
      } as UIMessage['parts'][number],
    ])
    expect(toolCalls(message)[0].name).toBe('get_thread')
    expect(progressLines(message)[0].text).toBe('Thread not found')
  })
})

describe('searchSubject', () => {
  test('includes date range, order and paging so repeated searches differ', () => {
    expect(
      searchSubject({ query: 'bluesky', since: '2023-01-01', until: '2023-12-31' }),
    ).toBe('“bluesky”, 2023')
    expect(
      searchSubject({ query: 'bluesky', since: '2023-01-01', until: '2024-01-01' }),
    ).toBe('“bluesky”, 2023')
    expect(searchSubject({ query: 'bluesky', sort: 'oldest' })).toBe(
      '“bluesky”, oldest first',
    )
    expect(
      searchSubject({
        query: 'bluesky',
        anyOf: ['bsky', 'bluesky'],
        fromUser: '@x',
        since: '2024-03-05',
        sort: 'likes',
        offset: 50,
      }),
    ).toBe('“bluesky”, “bsky” from @x, since 5 Mar 2024, most liked, more results')
    expect(
      searchSubject({ query: 'a', since: '2024-03-05', until: '2024-06-01' }),
    ).toBe('“a”, 5 Mar 2024 to 1 Jun 2024')
    expect(searchSubject({ query: 'a', sort: 'newest' })).toBe('“a”')
    expect(searchSubject({ fromUser: 'x' })).toBe('posts from @x')
    expect(searchSubject({})).toBeNull()
  })

  test('names a search with no words or people as browsing', () => {
    const message = assistant('a1', [
      toolPart('search_tweets', {}, { tweets: [tweet('1')] }),
      toolPart('search_tweets', { until: '2020-01-01' }),
    ])
    expect(progressLines(message).map((line) => line.text)).toEqual([
      'Browsed recent posts · 1 tweet',
      'Browsing posts, before 1 Jan 2020',
    ])
  })

  test('formats elapsed time as minutes and seconds', () => {
    expect(formatElapsed(7_400)).toBe('0:07')
    expect(formatElapsed(92_000)).toBe('1:32')
  })
})

describe('collectToolTweets', () => {
  test('keeps full tweets over quoted embeds and skips embeds as results', () => {
    const quoted = {
      id: '7',
      username: 'q',
      name: 'Q',
      avatar: null,
      text: 'quoted text',
      createdAt: '2024-01-01T00:00:00.000Z',
      likes: 0,
      rts: 0,
      media: [],
    }
    const found = collectToolTweets([
      { tweets: [tweet('1', { quotedTweet: quoted }), scored('2', 0.4)] },
      { scored: [scored('2', 0.8)] },
    ])
    expect(found.results).toEqual(['1', '2'])
    expect(found.byId.get('7')?.observedAt).toBe(quoted.createdAt)
    expect(found.scores.get('2')).toBe(0.8)
  })

  test('keeps find_people top tweets out of results and gives them an author', () => {
    const peopleOutput = {
      members: [{ username: 'patio11', displayName: 'Patrick' }],
      user: {
        accountId: '1',
        username: 'patio11',
        displayName: 'Patrick',
        bio: null,
        followers: 10,
        tweets: 20,
        topTweets: [
          { id: '501', createdAt: '2020-01-01T00:00:00.000Z', text: 'Top', likes: 9 },
          { id: '502', createdAt: '2020-01-02T00:00:00.000Z', text: 'Next', likes: 3 },
        ],
      },
    }
    const messages: UIMessage[] = [
      assistant('a1', [
        toolPart('find_people', { query: 'patio11' }, peopleOutput),
        toolPart('search_tweets', { query: 'x' }, { tweets: [tweet('1')] }),
        text('Answer [[t:501]] and [[t:1]]'),
      ]),
    ]
    const found = collectToolTweets([peopleOutput, { tweets: [tweet('1')] }])
    expect(found.results).toEqual(['1'])
    expect(found.byId.get('501')?.username).toBe('patio11')

    const view = buildTurnView(messages, 0)
    expect(view.relevant).toEqual([])
    expect(view.otherMatches).toEqual([])
    expect(view.answer.citations.map((c) => c.id)).toEqual(['501', '1'])
    expect(view.answer.unverified).toEqual([])
  })

  test('ignores tweet-like objects without a username', () => {
    const found = collectToolTweets([
      { tweets: [{ id: '9', text: 'no author' }, tweet('1')] },
    ])
    expect(found.results).toEqual(['1'])
    expect(found.byId.has('9')).toBe(false)
  })
})

describe('buildAnswer', () => {
  const found = collectToolTweets([{ tweets: [tweet('10'), tweet('20')] }])

  test('numbers citations by first appearance and rewrites markers as chips', () => {
    const answer = buildAnswer(
      'People complained [[t:20]]. Others agreed [[t:10]][[t:20]].',
      found,
      'm1',
    )
    expect(answer.citations.map((c) => [c.n, c.id])).toEqual([
      [1, '20'],
      [2, '10'],
    ])
    expect(answer.citations[0].tweet.text).toBe('Post 20')
    expect(answer.markdown).toBe(
      'People complained [1](#ask-m1-tweet-20). Others agreed [2](#ask-m1-tweet-10) [1](#ask-m1-tweet-20).',
    )
    expect(answer.unverified).toEqual([])
  })

  test('marks ids that no tool returned as unverified', () => {
    const answer = buildAnswer('Claim [[t:99]] and [[t:10]]', found, 'm1')
    expect(answer.unverified).toEqual(['99'])
    expect(answer.citations.map((c) => c.id)).toEqual(['10'])
    expect(answer.markdown).toContain('[unverified](#ask-unverified-99)')
  })

  test('hides a half-streamed marker', () => {
    expect(
      buildAnswer('Claim [[t:12', found, 'm1', { streaming: true }).markdown,
    ).toBe('Claim ')
  })
})

describe('buildCoverage', () => {
  test('lists searches and totals scored and kept posts', () => {
    const message = assistant('a1', [
      toolPart('search_tweets', { query: 'archive' }, { tweets: [tweet('1')] }),
      toolPart(
        'collect_and_score',
        { terms: ['archive'], criterion: 'c' },
        {
          collected: 1000,
          capped: true,
          scored: 1000,
          keptCount: 70,
          kept: [],
        },
      ),
      toolPart(
        'score_tweets',
        { criterion: 'c', tweetIds: ['1'] },
        { scored: [scored('1', 0.6)] },
      ),
      toolPart(
        'get_thread',
        { tweetId: '1' },
        { tweet: tweet('1'), conversation: [] },
      ),
      toolPart('search_tweets', { query: 'pending' }),
    ])
    expect(buildCoverage(toolCalls(message))).toEqual({
      searches: [
        { label: '“archive”', detail: '1 tweet' },
        {
          label: '“archive”',
          detail:
            '1,000 posts checked (stopped at the limit, more exist), 70 kept',
        },
      ],
      scored: 1001,
      kept: 71,
      threadsRead: 1,
      quotesRead: 0,
    })
    expect(NOT_SEARCHED_LINE).toMatch(/^Not searched: live X/)
  })
})

describe('buildTurnView', () => {
  test('uses text after the last tool call and resolves follow-up citations from earlier turns', () => {
    const messages: UIMessage[] = [
      user('u1', 'Who complained?'),
      assistant('a1', [
        toolPart(
          'search_tweets',
          { query: 'archive' },
          { tweets: [tweet('1'), tweet('2')] },
        ),
        text('First answer [[t:1]]'),
      ]),
      user('u2', 'More?'),
      assistant('a2', [
        text('Let me look.'),
        toolPart(
          'search_tweets',
          { query: 'ca' },
          { tweets: [tweet('3'), scored('4', 0.9)] },
        ),
        text('Also [[t:3]] and earlier [[t:2]].'),
      ]),
    ]
    const view = buildTurnView(messages, 3)
    expect(answerText(messages[3])).toBe('Also [[t:3]] and earlier [[t:2]].')
    expect(view.answer.citations.map((c) => c.id)).toEqual(['3', '2'])
    expect(view.answer.unverified).toEqual([])
    expect(view.relevant.map((t) => t.id)).toEqual(['4'])
    expect(view.otherMatches).toEqual([])
    expect(view.progress).toHaveLength(1)
  })

  test('splits uncited results into relevant and other matches by score', () => {
    const messages: UIMessage[] = [
      assistant('a1', [
        toolPart(
          'search_tweets',
          { query: 'archive' },
          {
            tweets: [
              scored('1', 0.9),
              scored('2', 0.6),
              scored('3', 0.2),
              tweet('4'),
              tweet('5'),
              tweet('6'),
            ],
          },
        ),
        text('Answer [[t:6]]'),
      ]),
    ]
    const view = buildTurnView(messages, 0)
    expect(view.answer.citations.map((c) => c.id)).toEqual(['6'])
    expect(view.relevant.map((t) => t.id)).toEqual(['1', '2'])
    expect(view.otherMatches.map((t) => t.id)).toEqual(['3', '4', '5'])
    expect(view.receipt).toEqual({
      cited: 1,
      relevant: 2,
      other: 3,
      searches: 1,
      scorerRan: true,
      cappedAt: null,
    })
  })

  test('counts relevant posts a capped check did not return', () => {
    const messages: UIMessage[] = [
      assistant('a1', [
        toolPart(
          'collect_and_score',
          { terms: ['bluesky'], criterion: 'c' },
          {
            collected: 300,
            limit: 300,
            capped: true,
            scored: 300,
            keptCount: 5,
            kept: [scored('1', 0.9), scored('2', 0.8)],
          },
        ),
        text('Answer [[t:1]]'),
      ]),
    ]
    const view = buildTurnView(messages, 0)
    expect(view.relevant.map((t) => t.id)).toEqual(['2'])
    expect(view.relevantNotShown).toBe(3)
    expect(receiptSegments(view.receipt).map((s) => s.text)).toEqual([
      'Based on 1 cited post',
      '4 more judged relevant',
      'stopped at the 300-post limit',
    ])
  })

  test('describes coverage without a scorer as matches from searches', () => {
    expect(
      receiptSegments({
        cited: 22,
        relevant: 0,
        other: 130,
        searches: 4,
        scorerRan: false,
        cappedAt: null,
      }),
    ).toEqual([
      { text: 'Based on 22 cited posts', target: 'cited' },
      { text: '130 other matches from 4 searches', target: 'other' },
    ])
  })

  test('reads a saved stopped or failed run as an outcome, not as answer text', () => {
    const stoppedTurn = assistant('a1', [
      toolPart('search_tweets', { query: 'x' }, { tweets: [tweet('1')] }),
      text('_This answer was stopped before it finished._'),
    ])
    const view = buildTurnView([stoppedTurn], 0)
    expect(view.outcome).toBe('stopped')
    expect(view.answer.markdown).toBe('')
    expect(view.foundSoFar).toBe(1)
    expect(
      buildTurnView(
        [assistant('a2', [text('_This answer failed before it finished._')])],
        0,
      ).outcome,
    ).toBe('failed')
    expect(buildTurnView([assistant('a3', [text('Answer')])], 0).outcome).toBe(
      'done',
    )
  })

  test('reads agent-chosen groups from message metadata', () => {
    const messages: UIMessage[] = [
      {
        ...assistant('a1', [
          toolPart('search_tweets', { query: 'x' }, { tweets: [tweet('1'), tweet('2')] }),
          text('Answer'),
        ]),
        metadata: {
          groups: [
            { label: 'Moved early', tweetIds: ['1', '999'] },
            { label: 'Unknown', tweetIds: ['998'] },
          ],
        },
      },
    ]
    const view = buildTurnView(messages, 0)
    expect(view.groups).toEqual([
      { label: 'Moved early', tweets: [expect.objectContaining({ id: '1' })] },
    ])
    expect(buildTurnView([assistant('a2', [text('x')])], 0).groups).toBeNull()
  })
})

describe('describeChatError', () => {
  const failed = (status: number, body: string) =>
    new Error(`Failed to fetch chat: ${status} ${body}`)

  test('maps refusal codes to plain messages', () => {
    expect(describeChatError(failed(429, '{"error":"daily_limit"}'))).toBe(
      "You've used today's 10 questions. You can ask again after midnight UTC.",
    )
    expect(
      describeChatError(failed(429, '{"error":"run_in_progress"}')),
    ).toMatch(/still running/)
    expect(describeChatError(failed(429, '{"error":"global_budget"}'))).toMatch(
      /spending limit/,
    )
    expect(describeChatError(failed(403, '{"error":"not_eligible"}'))).toMatch(
      /uploaded their archive/,
    )
    expect(describeChatError(failed(503, 'upstream'))).toMatch(/not responding/)
    expect(describeChatError(undefined)).toBeNull()
  })

  test('names the configured limit and reset time when the page knows them', () => {
    expect(
      describeChatError(failed(429, '{"error":"daily_limit"}'), {
        limit: 4,
        resetLabel: '4:00 AM',
      }),
    ).toBe('You’ve used today’s 4 questions. You can ask again at 4:00 AM.')
  })
})
