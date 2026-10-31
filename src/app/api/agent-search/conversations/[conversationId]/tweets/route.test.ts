import { POST } from './route'
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
  fetchConversationTweets: jest.fn(),
}))
// The scorer and providers are ESM-only; this route never calls them.
jest.mock('@/lib/agentSearch/classifier', () => ({
  agentSearchScorer: () => 'decisions',
}))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

const store = { listConversation: jest.fn() }
const ID = 'conv-12345678'
const tweet = (id: string) => ({ id, text: `Post ${id}`, username: 'u' })
const call = (body: unknown, id = ID) =>
  POST(
    new Request(`http://localhost/x/${id}/tweets`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ conversationId: id }) },
  )
// A stored run whose searches returned 1, 2, 3 and 4; the prose cites 1.
const run = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  accountId: 'acct-1',
  status: 'completed',
  startedAt: '2026-10-09T10:00:00.000Z',
  answer: 'Said [[t:1]]\n[[posts: All | 2, 3]]',
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
              files: {},
              tweets: [tweet('1'), tweet('2'), tweet('3'), tweet('4')],
            },
          },
        ],
      },
    ],
    'Said [[t:1]]',
  ),
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAgentSearchRunStore).mockReturnValue(store as never)
  jest.mocked(getAgentSearchViewer).mockResolvedValue({
    ok: true,
    viewer: { accountId: 'acct-1' },
  } as never)
  store.listConversation.mockResolvedValue([run()])
  jest.mocked(fetchConversationTweets).mockImplementation(async (ids) => ({
    tweets: new Map(
      ids.filter((id) => id !== '4').map((id) => [id, tweet(id) as never]),
    ),
    failed: ids.includes('4') ? ['4'] : [],
  }))
})

test('returns the conversation’s tweets, full cards for the cited ones, and what failed', async () => {
  const response = await call({ ids: ['1', '3', '4'] })
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({
    tweets: [tweet('1'), tweet('3')],
    failed: ['4'],
  })
  const [ids, cited] = jest.mocked(fetchConversationTweets).mock.calls[0]
  expect(ids).toEqual(['1', '3', '4'])
  expect(Array.from(cited)).toEqual(['1'])
})

test('only ids the conversation’s stored runs hold; it is not a tweet lookup', async () => {
  const response = await call({ ids: ['1', '999'] })
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'unknown_ids' })
  expect(fetchConversationTweets).not.toHaveBeenCalled()
})

test('refuses a malformed request', async () => {
  for (const body of [
    'not json',
    {},
    { ids: [] },
    { ids: ['x'] },
    { ids: [1] },
    { ids: Array.from({ length: 101 }, () => '1') },
  ]) {
    expect((await call(body)).status).toBe(400)
  }
  expect(fetchConversationTweets).not.toHaveBeenCalled()
})

test('another member’s conversation, a deleted one and a bad id look the same', async () => {
  store.listConversation.mockResolvedValue([run({ accountId: 'acct-2' })])
  expect((await call({ ids: ['1'] })).status).toBe(404)
  // Deleted runs are not listed, so a deleted conversation is gone.
  store.listConversation.mockResolvedValue([])
  expect((await call({ ids: ['1'] })).status).toBe(404)
  expect((await call({ ids: ['1'] }, '../x')).status).toBe(404)
  expect(fetchConversationTweets).not.toHaveBeenCalled()
})

test('needs a signed-in, eligible member', async () => {
  jest.mocked(getAgentSearchViewer).mockResolvedValue({
    ok: false,
    reason: 'signed_out',
  } as never)
  expect((await call({ ids: ['1'] })).status).toBe(401)
  jest.mocked(getAgentSearchViewer).mockResolvedValue({
    ok: false,
    reason: 'not_eligible',
  } as never)
  expect((await call({ ids: ['1'] })).status).toBe(403)
  expect(store.listConversation).not.toHaveBeenCalled()
})
