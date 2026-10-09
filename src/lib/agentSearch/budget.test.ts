// ai and the providers are ESM-only; budget checks need neither.
jest.mock('ai', () => ({}))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

import {
  agentSearchPricingProblem,
  checkAgentSearchBudget,
  startOfUtcDay,
} from './budget'

const env = (vars: Record<string, string>) =>
  vars as unknown as NodeJS.ProcessEnv

describe('agentSearchPricingProblem', () => {
  test('allows listed models with the Decisions scorer', () => {
    expect(
      agentSearchPricingProblem(
        'openai:gpt-6.1-sol',
        env({ OPENAI_API_KEY: 'k' }),
      ),
    ).toBeNull()
  })

  test('refuses an unpriced planner, such as any OpenRouter model', () => {
    expect(
      agentSearchPricingProblem(
        'openrouter:anthropic/claude-sonnet-5.5',
        env({ OPENAI_API_KEY: 'k' }),
      ),
    ).toMatch('No price configured for planner')
    expect(
      agentSearchPricingProblem(
        'openrouter:anthropic/claude-sonnet-5.5',
        env({
          OPENAI_API_KEY: 'k',
          AGENT_SEARCH_INPUT_USD_PER_MTOK: '3',
          AGENT_SEARCH_OUTPUT_USD_PER_MTOK: '15',
        }),
      ),
    ).toBeNull()
  })

  test('refuses a malformed price instead of counting $0', () => {
    expect(
      agentSearchPricingProblem(
        'openai:gpt-6.1-sol',
        env({ OPENAI_API_KEY: 'k', AGENT_SEARCH_OUTPUT_USD_PER_MTOK: '-1' }),
      ),
    ).toMatch('Invalid output price')
  })

  test('requires a price for the LLM scorer only when it is the scorer', () => {
    const openRouterOnly = {
      OPENROUTER_API_KEY: 'k',
      AGENT_SEARCH_SCORER: 'llm',
      AGENT_SEARCH_SCORER_MODEL: 'openrouter:x/y',
    }
    expect(
      agentSearchPricingProblem('openai:gpt-6.1-sol', env(openRouterOnly)),
    ).toMatch('No price configured for scorer model openrouter:x/y')
    expect(
      agentSearchPricingProblem(
        'openai:gpt-6.1-sol',
        env({
          ...openRouterOnly,
          AGENT_SEARCH_SCORER_INPUT_USD_PER_MTOK: '0.2',
          AGENT_SEARCH_SCORER_OUTPUT_USD_PER_MTOK: '1',
        }),
      ),
    ).toBeNull()
    // Jev reports its own cost.
    expect(
      agentSearchPricingProblem(
        'openai:gpt-6.1-sol',
        env({ OPENROUTER_API_KEY: 'k' }),
      ),
    ).toBeNull()
  })
})

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
