import { DELETE, GET } from './route'
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
// The scorer and providers are ESM-only; the quota route never calls them.
jest.mock('@/lib/agentSearch/classifier', () => ({
  agentSearchScorer: () => 'decisions',
}))
jest.mock('@/lib/agentSearch/openRouterKey', () => ({
  ownKeysEnabled: () => true,
}))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

const store = {
  listRecent: jest.fn(),
  countSince: jest.fn(),
  listRunning: jest.fn(),
  deleteAllConversations: jest.fn(),
}

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
  delete process.env.AGENT_SEARCH_MONTHLY_LIMIT
  jest.mocked(getAgentSearchRunStore).mockReturnValue(store as never)
  jest.mocked(getAgentSearchViewer).mockResolvedValue({
    ok: true,
    viewer: { accountId: 'acct-1' },
  } as never)
  store.listRecent.mockResolvedValue([])
})

afterEach(() => jest.useRealTimers())

test('reports questions left today, counted from UTC midnight', async () => {
  // 3 house questions today, and 2 more on the member's own key.
  store.countSince.mockImplementation(
    async (_account: string, _since: string, keySource?: string) =>
      keySource === 'house' ? 3 : 5,
  )
  const body = await (await GET()).json()
  expect(store.countSince).toHaveBeenCalledWith(
    'acct-1',
    '2026-10-09T00:00:00.000Z',
    'house',
  )
  expect(body).toMatchObject({
    conversations: [],
    dailyLimit: 10,
    remainingToday: 7,
    // On their own key: ten times the limit, every question today counted.
    ownKeyEnabled: true,
    ownKeyDailyLimit: 100,
    ownKeyRemainingToday: 95,
    resetsAt: '2026-10-10T00:00:00.000Z',
  })
})

test('reports questions left this month, counted from the start of the UTC month', async () => {
  // Today: 3 house, 5 in all. This month: 20 house, 40 in all.
  store.countSince.mockImplementation(
    async (_account: string, since: string, keySource?: string) =>
      since.startsWith('2026-10-01')
        ? keySource === 'house'
          ? 20
          : 40
        : keySource === 'house'
          ? 3
          : 5,
  )
  const body = await (await GET()).json()
  expect(store.countSince).toHaveBeenCalledWith(
    'acct-1',
    '2026-10-01T00:00:00.000Z',
    'house',
  )
  expect(body).toMatchObject({
    monthlyLimit: 30,
    remainingThisMonth: 10,
    ownKeyMonthlyLimit: 300,
    ownKeyRemainingThisMonth: 260,
    monthResetsAt: '2026-11-01T00:00:00.000Z',
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

describe('deleting all history', () => {
  test('deletes the viewer’s runs, not anyone else’s', async () => {
    store.listRunning.mockResolvedValue([])
    store.deleteAllConversations.mockResolvedValue(4)
    const response = await DELETE()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ deleted: 4 })
    expect(store.deleteAllConversations).toHaveBeenCalledWith('acct-1')
  })

  test('is refused while an answer is being written, not for a stale run', async () => {
    store.listRunning.mockResolvedValue([
      { status: 'running', startedAt: '2026-10-09T15:29:00.000Z' },
    ])
    expect((await DELETE()).status).toBe(409)
    expect(store.deleteAllConversations).not.toHaveBeenCalled()

    // A run marked running hours ago never recorded its end.
    store.listRunning.mockResolvedValue([
      { status: 'running', startedAt: '2026-10-09T09:00:00.000Z' },
    ])
    store.deleteAllConversations.mockResolvedValue(1)
    expect((await DELETE()).status).toBe(200)
  })

  test('needs a signed-in member', async () => {
    jest.mocked(getAgentSearchViewer).mockResolvedValue({
      ok: false,
      reason: 'signed_out',
    } as never)
    expect((await DELETE()).status).toBe(401)
    expect(store.deleteAllConversations).not.toHaveBeenCalled()
  })
})
