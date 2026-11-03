import { DELETE, POST } from './route'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'

jest.mock('@/lib/agentSearch/eligibility', () => ({
  getAgentSearchViewer: jest.fn(),
}))
jest.mock('@/lib/agentSearch/runStore', () => ({
  getAgentSearchRunStore: jest.fn(),
}))

const store = {
  listConversation: jest.fn(),
  shareConversation: jest.fn(),
  unshareConversation: jest.fn(),
}
const ID = 'conv-12345678'
const share = (id = ID) =>
  POST(new Request(`http://localhost/x/${id}/share`, { method: 'POST' }), {
    params: Promise.resolve({ conversationId: id }),
  })
const unshare = (id = ID) =>
  DELETE(new Request(`http://localhost/x/${id}/share`, { method: 'DELETE' }), {
    params: Promise.resolve({ conversationId: id }),
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
  store.listConversation.mockResolvedValue([run()])
  store.shareConversation.mockResolvedValue(undefined)
  store.unshareConversation.mockResolvedValue(undefined)
})

test('the asker shares their conversation and stops sharing it', async () => {
  const shared = await share()
  expect(shared.status).toBe(200)
  expect(shared.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await shared.json()).toEqual({ shared: true })
  expect(store.shareConversation).toHaveBeenCalledWith('acct-1', ID)

  const stopped = await unshare()
  expect(stopped.status).toBe(200)
  expect(await stopped.json()).toEqual({ shared: false })
  expect(store.unshareConversation).toHaveBeenCalledWith('acct-1', ID)
})

test('nothing is shared until an answer is stored', async () => {
  store.listConversation.mockResolvedValue([run({ status: 'running' })])
  const response = await share()
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'no_answer_yet' })
  expect(store.shareConversation).not.toHaveBeenCalled()
})

test('another member’s conversation, a missing one and a bad id look the same', async () => {
  store.listConversation.mockResolvedValue([run({ accountId: 'acct-2' })])
  expect((await share()).status).toBe(404)
  expect((await unshare()).status).toBe(404)
  store.listConversation.mockResolvedValue([])
  expect((await share()).status).toBe(404)
  expect((await share('../x')).status).toBe(404)
  expect(store.shareConversation).not.toHaveBeenCalled()
  expect(store.unshareConversation).not.toHaveBeenCalled()
})

test('only a member who may ask can share', async () => {
  jest
    .mocked(getAgentSearchViewer)
    .mockResolvedValue({ ok: false, reason: 'signed_out' } as never)
  expect((await share()).status).toBe(401)
  expect((await unshare()).status).toBe(401)
  jest
    .mocked(getAgentSearchViewer)
    .mockResolvedValue({ ok: false, reason: 'not_eligible' } as never)
  expect((await share()).status).toBe(403)
  expect(store.shareConversation).not.toHaveBeenCalled()
})
