import { getAgentSearchRunStore } from './runStore'
import { sharedConversationRuns } from './sharedConversation'

jest.mock('./runStore', () => ({ getAgentSearchRunStore: jest.fn() }))

const store = { getShare: jest.fn(), listConversation: jest.fn() }
const ID = 'conv-12345678'
const run = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  accountId: 'acct-1',
  status: 'completed',
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAgentSearchRunStore).mockReturnValue(store as never)
  store.getShare.mockResolvedValue({ conversationId: ID, accountId: 'acct-1' })
  store.listConversation.mockResolvedValue([run()])
})

test('a shared conversation’s finished runs, for anyone', async () => {
  store.listConversation.mockResolvedValue([
    run(),
    run({ id: 'r2', status: 'running' }),
    run({ id: 'r3', status: 'failed' }),
  ])
  expect((await sharedConversationRuns(ID))?.map((r) => r.id)).toEqual([
    'r1',
    'r3',
  ])
})

test('nothing when it is not shared, empty, still answering, or not all the sharer’s', async () => {
  store.getShare.mockResolvedValueOnce(null)
  expect(await sharedConversationRuns(ID)).toBeNull()
  expect(store.listConversation).not.toHaveBeenCalled()

  store.listConversation.mockResolvedValueOnce([])
  expect(await sharedConversationRuns(ID)).toBeNull()

  store.listConversation.mockResolvedValueOnce([run({ status: 'running' })])
  expect(await sharedConversationRuns(ID)).toBeNull()

  store.listConversation.mockResolvedValueOnce([
    run(),
    run({ id: 'r2', accountId: 'acct-2' }),
  ])
  expect(await sharedConversationRuns(ID)).toBeNull()

  expect(await sharedConversationRuns('../x')).toBeNull()
})
