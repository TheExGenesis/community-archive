import type { UIMessage } from 'ai'
import type { AgentTweet, ScoredTweet } from '@/lib/agentSearch/types'
import {
  NOT_SEARCHED_LINE,
  answerText,
  archiveSearchHref,
  bashSearchHref,
  buildAnswer,
  buildCoverage,
  buildTurnView,
  citesSomeoneElse,
  collectToolTweets,
  describeChatError,
  formatElapsed,
  latestThought,
  timelineFor,
  logSummary,
  namedBeforeChip,
  describeCommand,
  progressLine,
  progressLines,
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
      ['done', 'Checked 412 tweets matching “archive”, “CA” · 31 relevant'],
      ['done', 'Checked 2 tweets against your question · 1 relevant'],
      ['done', 'Read thread · 2 tweets'],
      ['done', 'Read quotes · 1 tweet'],
      ['error', 'Could not fetch tweets'],
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
      'Checking up to 300 tweets matching “book” from @patio11 against “Does this tweet recommend a book?”',
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
      'Checked 300 tweets matching “book” from @patio11 · 12 relevant · stopped at the 300-tweet limit',
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
      searchSubject({
        query: 'bluesky',
        since: '2023-01-01',
        until: '2023-12-31',
      }),
    ).toBe('“bluesky”, 2023')
    expect(
      searchSubject({
        query: 'bluesky',
        since: '2023-01-01',
        until: '2024-01-01',
      }),
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
    ).toBe(
      '“bluesky”, “bsky” from @x, since 5 Mar 2024, most liked, more results',
    )
    expect(
      searchSubject({ query: 'a', since: '2024-03-05', until: '2024-06-01' }),
    ).toBe('“a”, 5 Mar 2024 to 1 Jun 2024')
    expect(searchSubject({ query: 'a', sort: 'newest' })).toBe('“a”')
    expect(searchSubject({ fromUser: 'x' })).toBe('tweets from @x')
    expect(searchSubject({})).toBeNull()
  })

  test('names a search with no words or people as browsing', () => {
    const message = assistant('a1', [
      toolPart('search_tweets', {}, { tweets: [tweet('1')] }),
      toolPart('search_tweets', { until: '2020-01-01' }),
    ])
    expect(progressLines(message).map((line) => line.text)).toEqual([
      'Browsed recent tweets · 1 tweet',
      'Browsing tweets, before 1 Jan 2020',
    ])
  })

  test('formats elapsed time as minutes and seconds', () => {
    expect(formatElapsed(7_400)).toBe('0:07')
    expect(formatElapsed(92_000)).toBe('1:32')
  })
})

describe('collectToolTweets', () => {
  test("a command's scores give relevance, later commands replacing earlier ones", () => {
    const found = collectToolTweets([
      { tweets: [tweet('1'), tweet('2')], scores: { '1': 0.4, '2': 0.9 } },
      // A later command re-scored 1 and sent it as an id only.
      { tweets: [], scores: { '1': 0.7 } },
    ])
    expect(found.scores.get('1')).toBe(0.7)
    expect(found.scores.get('2')).toBe(0.9)
    expect(found.byId.has('1')).toBe(true)
  })

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
          {
            id: '501',
            createdAt: '2020-01-01T00:00:00.000Z',
            text: 'Top',
            likes: 9,
          },
          {
            id: '502',
            createdAt: '2020-01-02T00:00:00.000Z',
            text: 'Next',
            likes: 3,
          },
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
    expect(answer.citations[0].tweet?.text).toBe('Post 20')
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
    expect(
      buildAnswer('Says [[q:10 | Pos', found, 'm1', { streaming: true })
        .markdown,
    ).toBe('Says ')
  })

  test('a quote the tweet has is shown as a quote; one it lacks, as plain words', () => {
    const answer = buildAnswer(
      'They wrote [[q:10 | post 10]], later [[q:20 | something else]].',
      found,
      'm1',
    )
    expect(answer.markdown).toBe(
      'They wrote [post 10](#quote-ask-m1-tweet-10) [1](#ask-m1-tweet-10), later something else [2](#ask-m1-tweet-20).',
    )
    expect(answer.citations.map((c) => c.id)).toEqual(['10', '20'])
    expect(buildAnswer('Said [[q:99 | hi]]', found, 'm1').unverified).toEqual([
      '99',
    ])
  })

  test('a citation alone on its line shows the whole tweet there', () => {
    const answer = buildAnswer(
      'It is this one:\n[[t:20]]\nAnd it cites [[t:10]] inline.',
      found,
      'm1',
    )
    expect(answer.blocks.map((block) => block.kind)).toEqual([
      'text',
      'tweet',
      'text',
    ])
    const embed = answer.blocks[1]
    expect(embed.kind === 'tweet' && embed.citation.n).toBe(1)
    expect(answer.citations.map((c) => c.id)).toEqual(['20', '10'])
  })
})

describe('citations of someone other than the person named', () => {
  // The real case: a bullet about @SurenVynn cited a tweet by @sharanvkaur.
  const found = collectToolTweets([
    {
      tweets: [
        tweet('1', {
          username: 'sharanvkaur',
          text: 'singaporeans stupid but not that stupid',
        }),
        tweet('2', {
          username: 'pachabelcanon',
          text: 'Being Singaporean my mind lumps S and E Asians together',
        }),
        tweet('3', {
          username: 'tszzl',
          text: '@andrewho03 I was a big fan of Lee kuan yew',
        }),
        tweet('4', { username: 'bob', text: '@SurenVynn exactly this' }),
      ],
    },
  ])

  test('a clause naming one person and citing another’s tweet gets a warning on its chip', () => {
    const answer = buildAnswer(
      '- @SurenVynn: Singapore elections, NS, food [[t:1]]\n- @pachabelcanon: Singaporean identity [[t:2]]',
      found,
      'm1',
    )
    expect(answer.authorMismatches).toEqual([
      { id: '1', n: 1, named: 'SurenVynn', author: 'sharanvkaur' },
    ])
    expect(answer.markdown).toContain(
      '[1](#ask-m1-tweet-1 "This tweet is by @sharanvkaur, not @SurenVynn")',
    )
    expect(answer.markdown).toContain('[2](#ask-m1-tweet-2)')
    expect(answer.markdown).not.toContain('[2](#ask-m1-tweet-2 "')
  })

  test('no warning when the clause names several people, none, or the tweet replies to the person named', () => {
    const answer = buildAnswer(
      '@tszzl and @Paul_Melman disagree [[t:3]]. Some say so [[t:2]]. @SurenVynn got a reply [[t:4]].',
      found,
      'm1',
    )
    expect(answer.authorMismatches).toEqual([])
  })

  test('each chip judges its own clause, starting after the previous chip', () => {
    const answer = buildAnswer(
      '@pachabelcanon on identity [[t:2]] and @SurenVynn on elections [[t:1]]',
      found,
      'm1',
    )
    expect(answer.authorMismatches.map((m) => m.id)).toEqual(['1'])
  })

  test('the clause and author rules', () => {
    expect(namedBeforeChip('Line one @a.\n- @b talks about it ')).toBe('b')
    expect(namedBeforeChip('@a and @b both ')).toBeNull()
    expect(namedBeforeChip('mail me at x@a.com ')).toBeNull()
    expect(namedBeforeChip('@a said [1](#ask-x) and later ')).toBeNull()
    const t = tweet('9', { username: 'alice', text: 'hi' })
    expect(citesSomeoneElse('Alice', t)).toBe(false)
    expect(citesSomeoneElse('bob', t)).toBe(true)
    expect(citesSomeoneElse('bob', { ...t, text: '@bob hi' })).toBe(false)
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
      toolPart('find_people', { query: 'patio11' }, { members: [] }),
      toolPart(
        'search_tweets',
        { query: 'archive', offset: 50 },
        { tweets: [tweet('2'), tweet('3')] },
      ),
    ])
    expect(buildCoverage(toolCalls(message))).toEqual({
      searches: [
        { label: '“archive”', detail: '3 tweets from 2 searches' },
        {
          label: '“archive”',
          detail: '1,000 tweets checked, 70 relevant, stopped at the limit',
        },
      ],
      scored: 1001,
      kept: 71,
      capped: true,
      threadsRead: 1,
      quotesRead: 0,
      people: ['patio11'],
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
    expect(view.receipt).toMatchObject({ cited: 1, relevant: 4, cappedAt: 300 })
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

  test('the side column shows the latest matches, then the most relevant once scored', () => {
    const searches = [
      toolPart(
        'search_tweets',
        { query: 'singapore' },
        { tweets: [tweet('1'), tweet('2')] },
      ),
      toolPart(
        'search_tweets',
        { query: 'singaporean life' },
        { tweets: [tweet('3'), tweet('4')] },
      ),
    ]
    const before = buildTurnView([assistant('a1', searches)], 0, {
      streaming: true,
    })
    expect(before.foundPhase).toMatchObject({ kind: 'latest' })
    expect(
      before.foundPhase.kind === 'latest' && before.foundPhase.source,
    ).toContain('singaporean life')
    // The newest command's matches lead; earlier ones fill the column.
    expect(before.topFound.map((item) => item.tweet.id)).toEqual([
      '3',
      '4',
      '1',
      '2',
    ])
    expect(before.topFound[0].score).toBeUndefined()

    const after = buildTurnView(
      [
        assistant('a1', [
          ...searches,
          toolPart(
            'bash',
            { command: 'score s1.jsonl "Lives there?" > c1.jsonl' },
            {
              summary: 'Checked 3 tweets · 1 relevant',
              exitCode: 0,
              files: {},
              tweets: [tweet('5')],
              scores: { '5': 0.9, '3': 0.4 },
            },
          ),
        ]),
      ],
      0,
      { streaming: true },
    )
    expect(after.foundPhase).toEqual({ kind: 'relevant', relevant: 1 })
    expect(after.topFound.map((item) => [item.tweet.id, item.score])).toEqual([
      ['5', 0.9],
      ['3', 0.4],
      ['1', undefined],
      ['2', undefined],
      ['4', undefined],
    ])
  })

  test('reads agent-chosen groups from message metadata', () => {
    const messages: UIMessage[] = [
      {
        ...assistant('a1', [
          toolPart(
            'search_tweets',
            { query: 'x' },
            { tweets: [tweet('1'), tweet('2')] },
          ),
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
      "You've used today's questions. You can ask again tomorrow.",
    )
    expect(describeChatError(failed(429, '{"error":"monthly_limit"}'))).toBe(
      "You've used this month's questions. You can ask again next month.",
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
    expect(
      describeChatError(failed(429, '{"error":"monthly_limit"}'), {
        limit: 10,
        resetLabel: '8:00 AM',
        month: { limit: 30, resetLabel: '1 Nov' },
      }),
    ).toBe('You’ve used this month’s 30 questions. You can ask again on 1 Nov.')
  })
})

describe('progress and answers with lists', () => {
  test('shows a retried call once: its result, or how often it failed', () => {
    const failed = (query: string) =>
      toolPart(
        'search_tweets',
        { query, fromUser: '' },
        undefined,
        'output-error',
      )
    const lines = buildTurnView(
      [
        assistant('a1', [
          failed('singapore'),
          toolPart(
            'search_tweets',
            { query: 'singapore', anyOf: [] },
            undefined,
            'output-error',
          ),
          failed('sg'),
          toolPart('search_tweets', { query: 'sg' }, { tweets: [tweet('1')] }),
        ]),
      ],
      0,
    ).progress
    expect(lines.map((line) => [line.status, line.text])).toEqual([
      ['error', 'Could not search “singapore” · tried twice'],
      ['done', 'Searched “sg” · 1 tweet'],
    ])
  })

  test('a finished turn whose every call failed is the archive being down', () => {
    const view = buildTurnView(
      [
        assistant('a1', [
          text('I will look for people.'),
          toolPart('search_tweets', { query: 'x' }, undefined, 'output-error'),
        ]),
      ],
      0,
    )
    expect(view.outcome).toBe('failed')
    expect(view.unavailable).toBe(true)
    expect(view.answer.markdown).toBe('')
  })

  test('builds answer blocks from lists of ids and workspace files', () => {
    const view = buildTurnView(
      [
        assistant('a1', [
          toolPart(
            'search_tweets',
            { query: 'x' },
            {
              tweets: [tweet('1'), tweet('2'), tweet('3')],
              files: { 'lists/a.jsonl': ['2', '3'] },
            },
          ),
          text(
            'Some [[t:1]]\n[[posts: Group | lists/a.jsonl]]\n[[posts: Ids | 1, 99]]\n[[posts: Gone | lists/none.jsonl]]',
          ),
        ]),
      ],
      0,
    )
    const { answer } = view
    expect(answer.blocks.map((block) => block.kind)).toEqual([
      'text',
      'list',
      'list',
    ])
    expect(
      answer.blocks.flatMap((block) =>
        block.kind === 'list' ? [block.tweets.map((t) => t.id)] : [],
      ),
    ).toEqual([['2', '3'], ['1']])
    expect(answer.listed).toEqual(['2', '3', '1'])
    expect(answer.unverified).toEqual(['99'])
    expect(answer.missingLists).toEqual(['lists/none.jsonl'])
    // Listed and cited tweets are not repeated below the answer.
    expect(view.otherMatches).toEqual([])
  })

  test('hides an unfinished list marker while streaming', () => {
    const view = buildTurnView(
      [assistant('a1', [text('Here [[posts: Liv')])],
      0,
      { streaming: true },
    )
    expect(view.answer.markdown).toBe('Here ')
  })
})

describe('workspace steps and the folded log line', () => {
  test('a bash step says what ran and what it reported', () => {
    const long = `jq -c 'select(.author=="@member_a" or .author=="@member_b")' c1.jsonl > lists/living.jsonl && wc -l lists/living.jsonl`
    const lines = progressLines(
      assistant('a1', [
        toolPart('bash', { command: 'search "Singapore" > s1.jsonl' }),
        toolPart(
          'bash',
          { command: long },
          { stdout: '\n12 lists/living.jsonl\n', exitCode: 0 },
        ),
        toolPart(
          'bash',
          { command: 'score s1.jsonl "lives there?" > c1.jsonl' },
          { stdout: '', exitCode: 0, summary: 'c1.jsonl: 23 of 200 kept' },
        ),
        toolPart('bash', { command: 'jq bad' }, { stdout: '', exitCode: 2 }),
      ]),
    )
    expect(lines.map((line) => [line.status, line.text])).toEqual([
      ['running', 'Searching “Singapore”'],
      ['done', '12 lists/living.jsonl'],
      ['done', 'c1.jsonl: 23 of 200 kept'],
      ['error', 'Could not finish: looking through the results'],
    ])
    expect(
      progressLines(assistant('a2', [toolPart('bash', { command: long })]))[0]
        .text,
    ).toBe('Looking through the results')
  })

  test('describes a running shell command in words, never the shell', () => {
    expect(
      describeCommand(
        "search singapore --limit 1000 > s2.jsonl; wc -l s2.jsonl; jq -r '.author' s2.jsonl | sort",
      ),
    ).toBe('Searching “singapore”')
    expect(
      describeCommand(
        'semantic "moved to Singapore for work" --k 200 > v1.jsonl',
      ),
    ).toBe('Searching by meaning “moved to Singapore for work”')
    expect(describeCommand('people visakanv; people singapore')).toBe(
      'Looking up “visakanv”',
    )
    expect(
      describeCommand(
        'score s1.jsonl "Does this tweet talk about living there?" > c1.jsonl',
      ),
    ).toBe('Checking tweets against “Does this tweet talk about living there?”')
    expect(
      describeCommand('mkdir -p lists && jq -c . c1.jsonl > lists/a.jsonl'),
    ).toBe('Looking through the results')
  })

  test('sums up steps, what the answer rests on, and what else was found', () => {
    const search = toolPart(
      'search_tweets',
      { query: 'x' },
      { tweets: [tweet('1'), tweet('2'), tweet('3')] },
    )
    const cited = buildTurnView(
      [assistant('a1', [search, text('A [[t:1]]')])],
      0,
    )
    expect(logSummary(cited)).toBe('1 step · 1 tweet cited · 2 more found')
    expect(logSummary(cited, { writing: true })).toBe(
      '1 step · writing the answer',
    )
    const listed = buildTurnView(
      [assistant('a2', [search, text('A [[t:1]]\n[[posts: All | 1, 2]]')])],
      0,
    )
    expect(logSummary(listed)).toBe(
      '1 step · 2 tweets in the answer · 1 more found',
    )
    const empty = buildTurnView(
      [
        assistant('a3', [
          toolPart('search_tweets', { query: 'y' }, { tweets: [] }),
          text('Nothing turned up.'),
        ]),
      ],
      0,
    )
    expect(logSummary(empty)).toBe('1 step · nothing found')
    const followUp = buildTurnView([assistant('a4', [text('From before.')])], 0)
    expect(logSummary(followUp)).toBe(
      'No new searches, used the earlier tweets',
    )
  })
})

describe('semantic search steps', () => {
  test('describes a search by meaning, and treats its tweets as results', () => {
    const lines = progressLines(
      assistant('a1', [
        toolPart('semantic_search', { query: 'moving abroad' }),
        toolPart(
          'semantic_search',
          { query: 'living in SG', fromUser: '@member_a', k: 20 },
          { tweets: [tweet('1'), tweet('2')] },
        ),
        toolPart(
          'semantic_search',
          { query: 'expat life' },
          undefined,
          'output-error',
        ),
      ]),
    )
    expect(lines.map((line) => [line.status, line.text])).toEqual([
      ['running', 'Searching by meaning “moving abroad”'],
      ['done', 'Searched by meaning “living in SG” from @member_a · 2 tweets'],
      ['error', 'Could not search by meaning “expat life”'],
    ])
    const view = buildTurnView(
      [
        assistant('a2', [
          toolPart(
            'semantic_search',
            { query: 'living in SG' },
            { tweets: [{ ...tweet('3'), distance: 0.21 }, tweet('4')] },
          ),
          text('Some [[t:3]]'),
        ]),
      ],
      0,
    )
    expect(view.answer.citations.map((citation) => citation.id)).toEqual(['3'])
    expect(view.otherMatches.map((t) => t.id)).toEqual(['4'])
    expect(view.receipt.searches).toBe(1)
    expect(view.coverage.searches).toEqual([
      { label: '“living in SG”, by meaning', detail: '2 tweets' },
    ])
  })
})

describe('reasoning', () => {
  const reasoning = (value: string) =>
    ({
      type: 'reasoning',
      text: value,
    }) as unknown as UIMessage['parts'][number]

  test('reasoning is its own entry, between the steps, in stream order', () => {
    const message = assistant('a1', [
      reasoning('Start broad.'),
      reasoning('Singapore first.'),
      toolPart('search_tweets', { query: 'singapore' }, { tweets: [] }),
      toolPart('search_tweets', { query: 'sg' }, { tweets: [] }),
      reasoning('Too few. Try a semantic search.'),
      toolPart('semantic_search', { query: 'living in singapore' }),
      reasoning('Enough to answer.'),
    ])
    const timeline = timelineFor(message)
    expect(
      timeline.map((entry) =>
        entry.kind === 'thinking'
          ? `think: ${entry.text}${entry.latest ? ' (latest)' : ''}`
          : `step: ${entry.line.text}`,
      ),
    ).toEqual([
      'think: Start broad.\n\nSingapore first.',
      'step: Searched “singapore” · 0 tweets',
      'step: Searched “sg” · 0 tweets',
      'think: Too few. Try a semantic search.',
      'step: Searching by meaning “living in singapore”',
      'think: Enough to answer. (latest)',
    ])
    expect(buildTurnView([message], 0, { streaming: true }).timeline).toEqual(
      timeline,
    )
  })

  test('a retried call keeps its place at its first attempt', () => {
    const message = assistant('a1', [
      toolPart('search_tweets', { query: 'x' }, undefined, 'output-error'),
      reasoning('That failed. Try again.'),
      toolPart('search_tweets', { query: 'x' }, { tweets: [] }),
    ])
    expect(timelineFor(message).map((entry) => entry.kind)).toEqual([
      'step',
      'thinking',
    ])
  })

  test('a message without reasoning is only its steps', () => {
    const message = assistant('a1', [
      toolPart('search_tweets', { query: 'x' }, { tweets: [] }),
    ])
    expect(timelineFor(message).map((entry) => entry.kind)).toEqual(['step'])
  })

  test('the live line is the newest sentence, even one still being written', () => {
    expect(
      latestThought(
        'The question asks who. tpot means this part of Twitter. So search',
      ),
    ).toBe('tpot means this part of Twitter.')
    expect(
      latestThought('First idea. Then search for people who live there'),
    ).toBe('Then search for people who live there')
    expect(latestThought('  ')).toBe('')
  })
})

describe('opening a step in archive search', () => {
  test('a plain search maps to the same query', () => {
    expect(
      bashSearchHref('search singapore --limit 300 > s1.jsonl; wc -l s1.jsonl'),
    ).toBe('/search?q=singapore')
  })

  test('author, reply, date and sort options become search page filters', () => {
    expect(
      bashSearchHref(
        'search "great movie" --from @patio11 --reply-to visakanv --since 2023-01-01 --until=2023-12-31 --sort likes',
      ),
    ).toBe(
      '/search?q=great+movie&fromUser=patio11&replyToUser=visakanv&sinceDate=2023-01-01&untilDate=2023-12-31&sort=likes',
    )
  })

  test('an OR list has no equivalent; a later expressible search is used', () => {
    expect(
      bashSearchHref('search sg --any singaporean,changi > s2.jsonl'),
    ).toBeNull()
    expect(
      bashSearchHref(
        'search sg --any singaporean > a.jsonl && search changi > b.jsonl',
      ),
    ).toBe('/search?q=changi')
  })

  test('semantic search, scoring and people lookups get no link', () => {
    expect(
      bashSearchHref('semantic "moving to singapore for work" > m1.jsonl'),
    ).toBeNull()
    expect(
      bashSearchHref('score s1.jsonl "Is this about Singapore?" > c1.jsonl'),
    ).toBeNull()
    expect(bashSearchHref('people visakanv')).toBeNull()
  })

  test('a malformed date gives no link rather than a wrong one', () => {
    expect(archiveSearchHref({ query: 'x', since: 'yesterday' })).toBeNull()
  })

  test('step lines carry the link for bash and typed searches', () => {
    const bash = progressLine({
      id: 'b',
      name: 'bash',
      state: 'output-available',
      input: { command: 'search singapore --from visakanv > s1.jsonl' },
      output: { summary: 'Searched “singapore” · 300 tweets', exitCode: 0 },
    })
    expect(bash.searchHref).toBe('/search?q=singapore&fromUser=visakanv')
    const typed = progressLine({
      id: 't',
      name: 'search_tweets',
      state: 'output-available',
      input: { query: 'bluesky', since: '2024-01-01' },
      output: { tweets: [] },
    })
    expect(typed.searchHref).toBe('/search?q=bluesky&sinceDate=2024-01-01')
    const orList = progressLine({
      id: 'o',
      name: 'search_tweets',
      state: 'output-available',
      input: { query: 'bluesky', anyOf: ['bsky'] },
      output: { tweets: [] },
    })
    expect(orList.searchHref).toBeUndefined()
  })
})

describe('a reopened conversation (tweets as references)', () => {
  const ref = (id: string, p?: number) =>
    p === undefined ? { $t: id } : { $t: id, p }
  // The searches returned 1 to 6 (6 scored); the answer cites 1, quotes 2,
  // embeds 3, lists 4 to 6, and cites 777, which no tool returned.
  const messages: UIMessage[] = [
    user('u1', 'Who?'),
    assistant('a1', [
      toolPart(
        'bash',
        { command: 'search x' },
        {
          summary: 'Searched “x” · 6 tweets',
          exitCode: 0,
          files: { 'lists/all.jsonl': ['4', '5', '6'] },
          tweets: [
            ref('1'),
            ref('2'),
            ref('3'),
            ref('4', 0.2),
            ref('5', 0.9),
            ref('6', 0.7),
          ],
        },
      ),
      text(
        'Said [[t:1]] and [[q:2 | Post 2]] [[t:777]].\n[[t:3]]\n[[posts: All | lists/all.jsonl]]',
      ),
    ]),
  ]
  const supply = (
    ids: string[],
    states: Record<string, 'failed' | 'unavailable'> = {},
  ) => ({
    tweets: new Map(ids.map((id) => [id, tweet(id)])),
    states: new Map(Object.entries(states)),
  })

  test('before any tweet arrives, every reference holds its place; only 777 is unverified', () => {
    const view = buildTurnView(messages, 1, { supply: supply([]) })
    // Quotes are numbered before the chips of their block (buildAnswer).
    expect(
      view.answer.citations.map((c) => [c.n, c.id, c.state, c.tweet]),
    ).toEqual([
      [1, '2', 'loading', null],
      [2, '1', 'loading', null],
      [3, '3', 'loading', null],
    ])
    expect(view.answer.unverified).toEqual(['777'])
    expect(view.answer.loading).toEqual(['2', '1', '3', '4', '5', '6'])
    expect(view.answer.failed).toEqual([])
    expect(view.answer.unavailable).toEqual([])
    // The chips are numbered; the quote cannot be checked yet, so it is
    // plain words with the chip.
    expect(view.answer.markdown.trim()).toBe(
      'Said [2](#ask-a1-tweet-1) and Post 2 [1](#ask-a1-tweet-2) [unverified](#ask-unverified-777).',
    )
    const list = view.answer.blocks.find((b) => b.kind === 'list')
    expect(list).toMatchObject({
      tweets: [],
      pending: [
        { id: '4', state: 'loading' },
        { id: '5', state: 'loading' },
        { id: '6', state: 'loading' },
      ],
    })
    expect(view.answer.listed).toEqual(['4', '5', '6'])
    expect(view.tweets).toEqual({ loading: 6, failed: 0, unavailable: 0 })
    expect(view.foundSoFar).toBe(0)
    expect(logSummary(view)).toBe('1 step · 6 tweets in the answer')
  })

  test('as batches land the view fills in place: numbering holds, lists sort by score, counts settle', () => {
    const partial = buildTurnView(messages, 1, {
      supply: supply(['1', '2', '5']),
    })
    expect(partial.answer.citations.map((c) => [c.n, c.state])).toEqual([
      [1, 'loaded'],
      [2, 'loaded'],
      [3, 'loading'],
    ])
    // The quote now checks out against the tweet's words.
    expect(partial.answer.markdown).toContain(
      '[Post 2](#quote-ask-a1-tweet-2) [1](#ask-a1-tweet-2)',
    )
    let list = partial.answer.blocks.find((b) => b.kind === 'list')
    expect(list).toMatchObject({
      tweets: [tweet('5')],
      pending: [
        { id: '4', state: 'loading' },
        { id: '6', state: 'loading' },
      ],
    })
    expect(partial.tweets).toEqual({ loading: 3, failed: 0, unavailable: 0 })

    const full = buildTurnView(messages, 1, {
      supply: supply(['1', '2', '3', '4', '5', '6']),
    })
    expect(full.answer.citations.map((c) => [c.n, c.id, c.state])).toEqual([
      [1, '2', 'loaded'],
      [2, '1', 'loaded'],
      [3, '3', 'loaded'],
    ])
    expect(full.answer.blocks.map((b) => b.kind)).toEqual([
      'text',
      'tweet',
      'list',
    ])
    list = full.answer.blocks.find((b) => b.kind === 'list')
    expect(list).toMatchObject({ pending: [] })
    expect(
      list && list.kind === 'list' && list.tweets.map((t) => t.id),
    ).toEqual(['4', '5', '6'])
    // Scores come from the references, so the list can sort by relevance.
    expect(list && list.kind === 'list' && Array.from(list.scores)).toEqual([
      ['4', 0.2],
      ['5', 0.9],
      ['6', 0.7],
    ])
    expect(full.answer.loading).toEqual([])
    expect(full.tweets).toEqual({ loading: 0, failed: 0, unavailable: 0 })
    expect(full.foundSoFar).toBe(6)
    expect(full.receipt).toMatchObject({ cited: 3, relevant: 0, other: 0 })
    expect(full.answer.unverified).toEqual(['777'])
  })

  test('a failed fetch and a listed tweet the gateway no longer has are told apart from unverified', () => {
    const view = buildTurnView(messages, 1, {
      supply: supply(['2', '3', '4'], {
        '1': 'failed',
        '5': 'unavailable',
        '6': 'failed',
      }),
    })
    expect(view.answer.withheld).toBe(false)
    expect(view.answer.citations.map((c) => [c.id, c.state])).toEqual([
      ['2', 'loaded'],
      ['1', 'failed'],
      ['3', 'loaded'],
    ])
    expect(view.answer.failed).toEqual(['1', '6'])
    expect(view.answer.unavailable).toEqual(['5'])
    expect(view.answer.unverified).toEqual(['777'])
    // A listed tweet that is gone drops out of the list, as before; a
    // failed one keeps its place for a retry.
    const list = view.answer.blocks.find((b) => b.kind === 'list')
    expect(list).toMatchObject({
      tweets: [tweet('4')],
      pending: [{ id: '6', state: 'failed' }],
    })
    expect(view.answer.listed).toEqual(['4', '6'])
    expect(view.tweets).toEqual({ loading: 0, failed: 2, unavailable: 1 })
  })

  test('when a tweet the prose cites is no longer available, the prose is withheld and the lists stay', () => {
    const view = buildTurnView(messages, 1, {
      supply: supply(['1', '2', '4', '6'], {
        '3': 'unavailable',
        '5': 'unavailable',
      }),
    })
    // Opt-out wins over the stored answer: no prose, no chips, no embeds.
    expect(view.answer.withheld).toBe(true)
    expect(view.answer.markdown).toBe('')
    expect(view.answer.citations).toEqual([])
    expect(view.answer.unverified).toEqual([])
    expect(view.answer.blocks.map((b) => b.kind)).toEqual(['list'])
    const list = view.answer.blocks[0]
    expect(list.kind === 'list' && list.tweets.map((t) => t.id)).toEqual([
      '4',
      '6',
    ])
    expect(view.answer.unavailable).toEqual(['3', '5'])
    // A live answer is never withheld: its tweets arrive with it.
    const live = buildTurnView(messages, 1, {
      supply: supply(['1', '2', '4', '6'], { '3': 'unavailable' }),
      streaming: true,
    })
    expect(live.answer.withheld).toBe(false)
  })

  test('a reopened answer holds its prose until every cited tweet is confirmed', () => {
    // Nothing loaded yet: the prose waits (it may name someone who opted out).
    expect(
      buildTurnView(messages, 1, { supply: supply([], {}) }).answer.checking,
    ).toBe(true)
    // A cited tweet failed to load: still held, so it can be retried.
    expect(
      buildTurnView(messages, 1, {
        supply: supply(['2', '3', '4'], { '1': 'failed' }),
      }).answer.checking,
    ).toBe(true)
    // Every cited tweet in: shown.
    expect(
      buildTurnView(messages, 1, { supply: supply(['1', '2', '3'], {}) }).answer
        .checking,
    ).toBe(false)
    // A live answer is never held.
    expect(
      buildTurnView(messages, 1, { supply: supply([], {}), streaming: true })
        .answer.checking,
    ).toBe(false)
  })

  test('a follow-up resolves an earlier turn’s references through the same supply', () => {
    const thread: UIMessage[] = [
      ...messages,
      user('u2', 'More?'),
      assistant('a2', [text('Earlier [[t:4]] again.')]),
    ]
    const waiting = buildTurnView(thread, 3, { supply: supply([]) })
    expect(waiting.answer.citations.map((c) => [c.id, c.state])).toEqual([
      ['4', 'loading'],
    ])
    const loaded = buildTurnView(thread, 3, { supply: supply(['4']) })
    expect(loaded.answer.citations[0].tweet?.text).toBe('Post 4')
    // Sources count only this turn's own results.
    expect(loaded.tweets).toEqual({ loading: 0, failed: 0, unavailable: 0 })
  })

  test('without a supply, references are still verified but not in hand', () => {
    const view = buildTurnView(messages, 1)
    expect(view.answer.citations.map((c) => c.state)).toEqual([
      'loading',
      'loading',
      'loading',
    ])
    expect(view.answer.unverified).toEqual(['777'])
  })
})
