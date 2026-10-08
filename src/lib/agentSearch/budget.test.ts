import { checkAgentSearchBudget, startOfUtcDay } from './budget'

const ENV_KEYS = [
  'AGENT_SEARCH_DAILY_LIMIT',
  'AGENT_SEARCH_GLOBAL_DAILY_USD',
  'AGENT_SEARCH_STALE_RUN_MS',
] as const

function fakeStore({
  count = 0,
  running = false,
  cost = 0,
}: { count?: number; running?: boolean; cost?: number } = {}) {
  return {
    countSince: jest.fn().mockResolvedValue(count),
    hasRunning: jest.fn().mockResolvedValue(running),
    costSince: jest.fn().mockResolvedValue(cost),
  }
}

describe('checkAgentSearchBudget', () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}
  const now = new Date('2026-10-08T15:30:00.000Z')

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  test('counts from UTC midnight with the default stale window', async () => {
    const store = fakeStore({ count: 9, cost: 24.99 })
    await expect(checkAgentSearchBudget(store, '42', now)).resolves.toEqual({
      ok: true,
    })
    expect(store.countSince).toHaveBeenCalledWith(
      '42',
      '2026-10-08T00:00:00.000Z',
    )
    expect(store.costSince).toHaveBeenCalledWith('2026-10-08T00:00:00.000Z')
    expect(store.hasRunning).toHaveBeenCalledWith('42', 600_000, now)
  })

  test('stops the eleventh question of the day', async () => {
    await expect(
      checkAgentSearchBudget(fakeStore({ count: 10 }), '42', now),
    ).resolves.toEqual({ ok: false, reason: 'daily_limit' })
  })

  test('allows one running question at a time', async () => {
    await expect(
      checkAgentSearchBudget(fakeStore({ running: true }), '42', now),
    ).resolves.toEqual({ ok: false, reason: 'run_in_progress' })
  })

  test('trips the global kill switch at the daily USD limit', async () => {
    await expect(
      checkAgentSearchBudget(fakeStore({ cost: 25 }), '42', now),
    ).resolves.toEqual({ ok: false, reason: 'global_budget' })
  })

  test('applies the same limits to the preview account', async () => {
    await expect(
      checkAgentSearchBudget(fakeStore({ count: 10 }), 'dev', now),
    ).resolves.toEqual({ ok: false, reason: 'daily_limit' })
  })

  test('reads limits from the environment and ignores bad values', async () => {
    process.env.AGENT_SEARCH_DAILY_LIMIT = '2'
    process.env.AGENT_SEARCH_GLOBAL_DAILY_USD = 'lots'
    process.env.AGENT_SEARCH_STALE_RUN_MS = '1000'
    const store = fakeStore({ count: 2, cost: 24 })
    await expect(checkAgentSearchBudget(store, '42', now)).resolves.toEqual({
      ok: false,
      reason: 'daily_limit',
    })
    expect(store.hasRunning).toHaveBeenCalledWith('42', 1000, now)

    // The bad USD value falls back to $25, so $24 is still under budget.
    await expect(
      checkAgentSearchBudget(fakeStore({ count: 1, cost: 24 }), '42', now),
    ).resolves.toEqual({ ok: true })
  })
})

describe('startOfUtcDay', () => {
  test('uses UTC, not the local clock', () => {
    expect(startOfUtcDay(new Date('2026-10-08T23:59:59.999-07:00'))).toBe(
      '2026-10-09T00:00:00.000Z',
    )
  })
})
