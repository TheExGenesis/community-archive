import { DELETE } from './route'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'

jest.mock('@/lib/agentSearch/eligibility', () => ({
  getAgentSearchViewer: jest.fn(),
}))
jest.mock('@/lib/agentSearch/runStore', () => ({
  getAgentSearchRunStore: jest.fn(),
}))
jest.mock('@/lib/agentSearch/history', () => ({
  conversationMessages: () => [],
}))
jest.mock('@/lib/agentSearch/historyTweets', () => ({
  loadConversationTweets: async () => new Map(),
}))
// The scorer and providers are ESM-only; deleting never calls them.
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
const run = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  accountId: 'acct-1',
  status: 'completed',
  startedAt: '2026-10-09T10:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAgentSearchRunStore).mockReturnValue(store as never)
  jest.mocked(getAgentSearchViewer).mockResolvedValue({
    ok: true,
    viewer: { accountId: 'acct-1' },
  } as never)
  store.deleteConversation.mockResolvedValue(1)
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
