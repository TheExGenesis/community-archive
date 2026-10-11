// ai and the providers are ESM-only; budget checks need neither.
jest.mock('ai', () => ({}))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

import {
  admitAgentSearchRun,
  agentSearchBudgetLimits,
  agentSearchPricingProblem,
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

describe('admitAgentSearchRun', () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}
  const request = {
    runId: 'asr_1',
    accountId: '42',
    conversationId: 'conv-1234',
    question: 'Who?',
    model: 'openai:gpt-6.1-sol',
  }
  const storeAnswering = (result: string) => ({
    admit: jest.fn().mockResolvedValue(result),
  })

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

  test('admits with the default limits', async () => {
    const store = storeAnswering('ok')
    await expect(admitAgentSearchRun(store, request)).resolves.toEqual({
      ok: true,
    })
    expect(store.admit).toHaveBeenCalledWith({
      ...request,
      dailyLimit: 10,
      globalDailyUsd: 25,
      staleRunMs: 600_000,
    })
  })

  test.each(['not_found', 'daily_limit', 'run_in_progress', 'global_budget'])(
    'passes on the refusal %s',
    async (reason) => {
      await expect(
        admitAgentSearchRun(storeAnswering(reason), request),
      ).resolves.toEqual({ ok: false, reason })
    },
  )

  test('fails closed when the store cannot answer', async () => {
    const store = { admit: jest.fn().mockRejectedValue(new Error('down')) }
    await expect(admitAgentSearchRun(store, request)).rejects.toThrow('down')
  })

  test('reads limits from the environment and ignores bad values', async () => {
    process.env.AGENT_SEARCH_DAILY_LIMIT = '2'
    process.env.AGENT_SEARCH_GLOBAL_DAILY_USD = 'lots'
    process.env.AGENT_SEARCH_STALE_RUN_MS = '900000'
    const store = storeAnswering('ok')
    await admitAgentSearchRun(store, request)
    // The bad USD value falls back to $25 rather than disabling the cap.
    expect(store.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        dailyLimit: 2,
        globalDailyUsd: 25,
        staleRunMs: 900_000,
      }),
    )
  })

  test('a running run blocks at least until its deadline has passed', () => {
    expect(
      agentSearchBudgetLimits(
        env({
          AGENT_SEARCH_STALE_RUN_MS: '1000',
          AGENT_SEARCH_RUN_DEADLINE_MS: '300000',
        }),
      ).staleRunMs,
    ).toBe(420_000)
  })
})

describe('startOfUtcDay', () => {
  test('uses UTC, not the local clock', () => {
    expect(startOfUtcDay(new Date('2026-10-08T23:59:59.999-07:00'))).toBe(
      '2026-10-09T00:00:00.000Z',
    )
  })
})
