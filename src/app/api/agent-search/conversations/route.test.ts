import { GET } from './route'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { getAgentSearchRunStore } from '@/lib/agentSearch/runStore'

jest.mock('@/lib/agentSearch/eligibility', () => ({
  getAgentSearchViewer: jest.fn(),
}))
jest.mock('@/lib/agentSearch/runStore', () => ({
  getAgentSearchRunStore: jest.fn(),
}))
jest.mock('@/lib/agentSearch/history', () => ({
  summarizeConversations: () => [],
}))

const store = { listRecent: jest.fn(), countSince: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
  // Only the clock is faked; Response bodies need real timers and ticks.
  jest.useFakeTimers({
    now: new Date('2026-10-09T15:30:00.000Z'),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'queueMicrotask',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
    ],
  })
  delete process.env.AGENT_SEARCH_DAILY_LIMIT
  jest.mocked(getAgentSearchRunStore).mockReturnValue(store as never)
  jest.mocked(getAgentSearchViewer).mockResolvedValue({
    ok: true,
    viewer: { accountId: 'acct-1' },
  } as never)
  store.listRecent.mockResolvedValue([])
})

afterEach(() => jest.useRealTimers())

test('reports questions left today, counted from UTC midnight', async () => {
  store.countSince.mockResolvedValue(3)
  const body = await (await GET()).json()
  expect(store.countSince).toHaveBeenCalledWith(
    'acct-1',
    '2026-10-09T00:00:00.000Z',
  )
  expect(body).toMatchObject({
    conversations: [],
    dailyLimit: 10,
    remainingToday: 7,
    resetsAt: '2026-10-10T00:00:00.000Z',
  })
})

test('never reports a negative count and follows the configured limit', async () => {
  process.env.AGENT_SEARCH_DAILY_LIMIT = '2'
  store.countSince.mockResolvedValue(5)
  const body = await (await GET()).json()
  expect(body.dailyLimit).toBe(2)
  expect(body.remainingToday).toBe(0)
})

test('refuses a viewer who may not ask', async () => {
  jest
    .mocked(getAgentSearchViewer)
    .mockResolvedValue({ ok: false, reason: 'signed_out' } as never)
  const response = await GET()
  expect(response.status).toBe(401)
  expect(store.countSince).not.toHaveBeenCalled()
})
