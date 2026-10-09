import {
  buildRunParts,
  collectRefs,
  conversationMessages,
  dehydrate,
  rehydrate,
  summarizeConversations,
} from './history'
import type { AgentSearchRun, AgentTweet } from './types'

const tweet = (id: string): AgentTweet => ({
  id,
  username: `user${id}`,
  name: `User ${id}`,
  avatar: null,
  text: `Post ${id}`,
  observedAt: '2025-01-01T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  likes: 3,
  rts: 0,
  replyToTweetId: null,
  replyToUsername: null,
  quoteTweetId: null,
})

const run = (overrides: Partial<AgentSearchRun>): AgentSearchRun => ({
  id: 'wrun_1',
  accountId: '42',
  conversationId: 'conv-1234',
  question: 'Who complained?',
  status: 'completed',
  model: 'openai:gpt-6.1-sol',
  startedAt: '2026-10-08T10:00:00.000Z',
  completedAt: '2026-10-08T10:01:00.000Z',
  answer: null,
  parts: null,
  citedTweetIds: [],
  invalidCitationIds: [],
  toolCalls: [],
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  error: null,
  ...overrides,
})

describe('dehydrate and rehydrate', () => {
  test('stores tweets as ids, keeps scores, and restores them', () => {
    const output = {
      kept: [{ ...tweet('1'), p: 0.9 }, tweet('2')],
      thread: { tweet: tweet('3') },
      collected: 2,
    }
    const stored = dehydrate(output)
    expect(JSON.stringify(stored)).not.toContain('Post 1')
    expect(stored).toEqual({
      kept: [{ $t: '1', p: 0.9 }, { $t: '2' }],
      thread: { tweet: { $t: '3' } },
      collected: 2,
    })
    expect(Array.from(collectRefs(stored)).sort()).toEqual(['1', '2', '3'])

    const all = new Map(['1', '2', '3'].map((id) => [id, tweet(id)]))
    expect(rehydrate(stored, all)).toEqual(output)
  })

  test('drops tweets that are gone from arrays and nulls them elsewhere', () => {
    const stored = dehydrate({
      kept: [tweet('1'), tweet('2')],
      tweet: tweet('2'),
    })
    expect(rehydrate(stored, new Map([['1', tweet('1')]]))).toEqual({
      kept: [tweet('1')],
      tweet: null,
    })
  })
})

describe('buildRunParts', () => {
  test('makes one tool part per call, then the answer, without tweet text', () => {
    const parts = buildRunParts(
      [
        {
          toolCalls: [
            {
              toolCallId: 'c1',
              toolName: 'search_tweets',
              input: { query: 'x' },
            },
            {
              toolCallId: 'c2',
              toolName: 'get_thread',
              input: { tweetId: '1' },
            },
          ],
          toolResults: [{ toolCallId: 'c1', output: { tweets: [tweet('1')] } }],
        },
      ],
      'Answer [[t:1]]',
    )
    expect(parts).toEqual([
      {
        type: 'tool-search_tweets',
        toolCallId: 'c1',
        state: 'output-available',
        input: { query: 'x' },
        output: { tweets: [{ $t: '1' }] },
      },
      {
        type: 'tool-get_thread',
        toolCallId: 'c2',
        state: 'output-error',
        input: { tweetId: '1' },
        errorText: 'Tool call failed',
      },
      { type: 'text', text: 'Answer [[t:1]]' },
    ])
  })
})

test('people lookups keep only handles', () => {
  const [part] = buildRunParts(
    [
      {
        toolCalls: [
          { toolCallId: 'c1', toolName: 'find_people', input: { query: 'a' } },
        ],
        toolResults: [
          {
            toolCallId: 'c1',
            output: {
              query: 'a',
              members: [{ accountId: '1', username: 'a', displayName: 'A' }],
              user: {
                accountId: '1',
                username: 'a',
                bio: 'secret',
                topTweets: [tweet('9')],
              },
            },
          },
        ],
      },
    ],
    '',
  ) as Array<{ output: unknown }>
  expect(part.output).toEqual({
    query: 'a',
    members: [{ accountId: '1', username: 'a' }],
    user: { accountId: '1', username: 'a' },
  })
})

describe('summarizeConversations', () => {
  test('groups runs by conversation, titled by the first question', () => {
    const summaries = summarizeConversations([
      run({
        id: 'b',
        conversationId: 'conv-b',
        question: 'B?',
        startedAt: '2026-10-08T12:00:00.000Z',
      }),
      run({
        id: 'a2',
        question: 'Follow-up',
        startedAt: '2026-10-08T11:00:00.000Z',
        status: 'running',
      }),
      run({
        id: 'a1',
        question: 'First',
        startedAt: '2026-10-08T10:00:00.000Z',
      }),
      run({ id: 'old', conversationId: null }),
    ])
    expect(summaries).toEqual([
      expect.objectContaining({ id: 'conv-b', title: 'B?', turns: 1 }),
      expect.objectContaining({
        id: 'conv-1234',
        title: 'First',
        turns: 2,
        status: 'running',
        updatedAt: '2026-10-08T11:00:00.000Z',
      }),
    ])
  })
})

describe('conversationMessages', () => {
  test('rebuilds question and answer messages from stored runs', () => {
    const parts = buildRunParts(
      [
        {
          toolCalls: [
            { toolCallId: 'c1', toolName: 'search_tweets', input: {} },
          ],
          toolResults: [{ toolCallId: 'c1', output: { tweets: [tweet('1')] } }],
        },
      ],
      'Answer [[t:1]]',
    )
    const messages = conversationMessages(
      [
        run({ id: 'r1', parts }),
        run({
          id: 'r2',
          question: 'Stopped one',
          status: 'failed',
          error: 'Stopped by the member',
        }),
        run({ id: 'r3', question: 'Still going', status: 'running' }),
      ],
      new Map([['1', tweet('1')]]),
    )
    expect(messages.map((m) => [m.role, m.id])).toEqual([
      ['user', 'r1-question'],
      ['assistant', 'r1'],
      ['user', 'r2-question'],
      ['assistant', 'r2'],
      ['user', 'r3-question'],
    ])
    expect(messages[1].parts[0]).toMatchObject({
      type: 'tool-search_tweets',
      output: { tweets: [tweet('1')] },
    })
    expect(messages[3].parts).toEqual([
      { type: 'text', text: '_This answer was stopped before it finished._' },
    ])
  })

  test('marks a failed run’s partial answer as unfinished', () => {
    const [, answer] = conversationMessages(
      [
        run({
          answer: 'Half an answer',
          status: 'failed',
          error: 'The answer was cut off at the output token limit',
        }),
      ],
      new Map(),
    )
    expect(answer.parts).toEqual([
      { type: 'text', text: 'Half an answer' },
      { type: 'text', text: '\n\n_This answer failed before it finished._' },
    ])
  })

  test('falls back to the stored answer text for runs without parts', () => {
    const [, answer] = conversationMessages(
      [run({ answer: 'Plain answer' })],
      new Map(),
    )
    expect(answer.parts).toEqual([{ type: 'text', text: 'Plain answer' }])
  })
})
