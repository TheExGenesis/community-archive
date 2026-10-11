// ai is ESM-only. A small stand-in for convertToModelMessages keeps what
// these tests check: tools are passed, toModelOutput compacts outputs,
// incomplete calls are ignored, and step boundaries split the answer.
const mockConvert = jest.fn()
jest.mock('ai', () => ({
  tool: (definition: unknown) => definition,
  convertToModelMessages: (...args: unknown[]) => mockConvert(...args),
}))
jest.mock('./toolImpl', () => ({ AGENT_SEARCH_TOOL_EXECUTORS: {} }))
jest.mock('./historyTweets', () => ({ loadConversationTweets: jest.fn() }))

import { buildConversationContext, MAX_CONTEXT_TURNS, priorRuns } from './context'
import { buildRunParts } from './history'
import type { AgentSearchRun, AgentTweet } from './types'

const tweet = (id: string): AgentTweet =>
  ({
    id,
    username: 'alice',
    name: 'Alice',
    avatar: null,
    text: `post ${id} `.repeat(200),
    createdAt: '2025-01-01T00:00:00.000Z',
    likes: 3,
    rts: 0,
    replyToTweetId: null,
    replyToUsername: null,
    quoteTweetId: null,
  }) as unknown as AgentTweet

const run = (
  id: string,
  overrides: Partial<AgentSearchRun> = {},
): AgentSearchRun => ({
  id,
  accountId: '42',
  conversationId: 'conv-1234',
  question: `Question ${id}`,
  status: 'completed',
  model: 'openai:gpt-6.1-sol',
  startedAt: `2026-10-08T10:0${id.slice(-1)}:00.000Z`,
  completedAt: null,
  answer: null,
  citedTweetIds: [],
  invalidCitationIds: [],
  toolCalls: [],
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  error: null,
  parts: buildRunParts(
    [
      {
        toolCalls: [
          { toolCallId: `c${id}`, toolName: 'search_tweets', input: {} },
        ],
        toolResults: [
          {
            toolCallId: `c${id}`,
            output: { query: 'q', tweets: [tweet(`1${id.slice(-1)}`)] },
          },
        ],
      },
    ],
    `Answer ${id} [[t:1${id.slice(-1)}]]`,
  ),
  ...overrides,
})

describe('buildConversationContext', () => {
  beforeEach(() => {
    mockConvert.mockReset().mockImplementation(async (messages, options) =>
      messages.map((message: { role: string; parts: unknown[] }) => ({
        role: message.role,
        parts: message.parts,
        options,
      })),
    )
  })

  const loadTweets = async (runs: AgentSearchRun[]) =>
    new Map(
      runs.map((r) => {
        const id = `1${r.id.slice(-1)}`
        return [id, tweet(id)]
      }),
    )

  test('skips the current and still-running runs, oldest first', () => {
    const runs = [
      run('r3'),
      run('r1'),
      run('r2', { status: 'running' }),
      run('r4'),
    ]
    expect(priorRuns(runs, 'r4').map((r) => r.id)).toEqual(['r1', 'r3'])
  })

  test('a first question has no earlier turns', async () => {
    const context = await buildConversationContext([run('r1')], 'r1', loadTweets)
    expect(context).toEqual({ messages: [], priorTweetIds: [] })
    expect(mockConvert).not.toHaveBeenCalled()
  })

  test('rebuilds the last few turns with tools, marking incomplete calls ignorable', async () => {
    const runs = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => run(id))
    const context = await buildConversationContext(runs, 'r5', loadTweets)

    // Only the last MAX_CONTEXT_TURNS earlier turns reach the model...
    const questions = context.messages
      .filter((m: any) => m.role === 'user')
      .map((m: any) => m.parts[0].text)
    expect(questions).toEqual(['Question r2', 'Question r3', 'Question r4'])
    expect(MAX_CONTEXT_TURNS).toBe(3)
    // ...but citations may use any earlier turn's tweets.
    expect(context.priorTweetIds.sort()).toEqual(['11', '12', '13', '14'])

    const options = mockConvert.mock.calls[0][1]
    expect(options.ignoreIncompleteToolCalls).toBe(true)
    // The real tool set, so toModelOutput compacts old outputs.
    const search = options.tools.search_tweets
    const compact = search.toModelOutput({
      output: { query: 'q', tweets: [tweet('12')], nextOffset: null },
    })
    expect(compact.value.tweets[0].text.length).toBeLessThanOrEqual(501)
  })

  test('puts a step boundary between tool results and the answer', async () => {
    const context = await buildConversationContext(
      [run('r1'), run('r2')],
      'r2',
      loadTweets,
    )
    const assistant = context.messages.find(
      (m: any) => m.role === 'assistant',
    ) as any
    expect(assistant.parts.map((p: { type: string }) => p.type)).toEqual([
      'tool-search_tweets',
      'step-start',
      'text',
    ])
  })

  test('falls back to text when a stored turn cannot be converted', async () => {
    mockConvert.mockRejectedValueOnce(new Error('MissingToolResultsError'))
    const context = await buildConversationContext(
      [run('r1'), run('r2')],
      'r2',
      loadTweets,
    )
    const assistant = context.messages.find(
      (m: any) => m.role === 'assistant',
    ) as any
    expect(assistant.parts).toEqual([{ type: 'text', text: 'Answer r1 [[t:11]]' }])
  })
})
