import { DELETE, GET } from './route'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { buildRunParts } from '@/lib/agentSearch/history'
import { fetchConversationTweets } from '@/lib/agentSearch/historyTweets'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'

jest.mock('@/lib/agentSearch/eligibility', () => ({
  getAgentSearchViewer: jest.fn(),
}))
jest.mock('@/lib/agentSearch/runStore', () => ({
  getAgentSearchRunStore: jest.fn(),
}))
jest.mock('@/lib/agentSearch/historyTweets', () => ({
  ...jest.requireActual('@/lib/agentSearch/historyTweets'),
  fetchConversationTweets: jest.fn(async () => ({
    tweets: new Map(),
    failed: [],
  })),
}))
// The scorer and providers are ESM-only; these routes never call them.
jest.mock('@/lib/agentSearch/classifier', () => ({
  agentSearchScorer: () => 'decisions',
}))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

const store = { listConversation: jest.fn(), deleteConversation: jest.fn() }
const ID = 'conv-12345678'
const call = (id = ID) =>
  DELETE(new Request(`http://localhost/x/${id}`, { method: 'DELETE' }), {
    params: { conversationId: id },
  })
const get = (id = ID) =>
  GET(new Request(`http://localhost/x/${id}`), {
    params: { conversationId: id },
  })
const run = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  accountId: 'acct-1',
  status: 'completed',
  startedAt: '2026-10-09T10:00:00.000Z',
  ...overrides,
})
const tweet = (id: string) => ({ id, text: `Post ${id}`, username: 'u' })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAgentSearchRunStore).mockReturnValue(store as never)
  jest.mocked(getAgentSearchViewer).mockResolvedValue({
    ok: true,
    viewer: { accountId: 'acct-1' },
  } as never)
  store.deleteConversation.mockResolvedValue(1)
})

describe('GET', () => {
  // The searches returned 1 to 5. The prose cites 1, quotes 2 and cites 5;
  // the list names a workspace file holding 3; 4 is only in the sources.
  const answer =
    'Said [[t:1]], [[q:2 | words]] and [[t:5]]\n[[posts: All | lists/a.jsonl]]'
  const stored = () =>
    run({
      question: 'Who?',
      answer,
      parts: buildRunParts(
        [
          {
            toolCalls: [{ toolCallId: 'c1', toolName: 'bash', input: {} }],
            toolResults: [
              {
                toolCallId: 'c1',
                output: {
                  summary: 's',
                  exitCode: 0,
                  files: { 'lists/a.jsonl': ['3'] },
                  tweets: ['1', '2', '3', '4', '5'].map(tweet),
                },
              },
            ],
          },
        ],
        answer,
      ),
    })

  test('answers at once with the tweets as references, the cited ones it had time for, and the rest to fetch in priority order', async () => {
    store.listConversation.mockResolvedValue([
      stored(),
      run({ id: 'r2', question: 'More?', status: 'running' }),
    ])
    // The budgeted fetch got 1, lost 2 to a timeout, and found nothing for 5.
    jest.mocked(fetchConversationTweets).mockResolvedValue({
      tweets: new Map([['1', tweet('1') as never]]),
      failed: ['2'],
    })
    const before = Date.now()
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await response.json()
    expect(body.runningRunId).toBe('r2')
    expect(body.tweets).toEqual([tweet('1')])
    expect(body.pendingTweetIds).toEqual(['2', '3', '4'])
    expect(body.unavailableTweetIds).toEqual(['5'])
    // The messages keep their references for the page to resolve.
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual([
      'r1-question',
      'r1',
      'r2-question',
    ])
    expect(body.messages[1].parts[0].output.tweets).toEqual(
      ['1', '2', '3', '4', '5'].map((id) => ({ $t: id })),
    )
    // Only the prose-cited tweets were tried, as full cards, briefly.
    const [ids, cited, limits] = jest.mocked(fetchConversationTweets).mock
      .calls[0]
    expect(ids).toEqual(['1', '2', '5'])
    expect(Array.from(cited)).toEqual(['1', '2', '5'])
    expect(limits?.deadlineAt).toBeGreaterThanOrEqual(before + 1_500)
    expect(limits?.deadlineAt).toBeLessThanOrEqual(Date.now() + 1_500)
  })

  test('another member’s conversation, a missing one and a bad id look the same', async () => {
    store.listConversation.mockResolvedValue([run({ accountId: 'acct-2' })])
    expect((await get()).status).toBe(404)
    store.listConversation.mockResolvedValue([])
    expect((await get()).status).toBe(404)
    expect((await get('../x')).status).toBe(404)
    expect(fetchConversationTweets).not.toHaveBeenCalled()
  })
})

test('deletes the viewer’s own conversation', async () => {
  store.listConversation.mockResolvedValue([run()])
  const response = await call()
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ deleted: 1 })
  expect(store.deleteConversation).toHaveBeenCalledWith('acct-1', ID)
})

test('another member’s conversation, a missing one and a bad id look the same', async () => {
  store.listConversation.mockResolvedValue([run({ accountId: 'acct-2' })])
  expect((await call()).status).toBe(404)
  store.listConversation.mockResolvedValue([])
  expect((await call()).status).toBe(404)
  expect((await call('../x')).status).toBe(404)
  expect(store.deleteConversation).not.toHaveBeenCalled()
})

test('is refused while its answer is being written', async () => {
  store.listConversation.mockResolvedValue([
    run({ status: 'running', startedAt: new Date().toISOString() }),
  ])
  const response = await call()
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'run_in_progress' })
  expect(store.deleteConversation).not.toHaveBeenCalled()
})
