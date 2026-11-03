// The providers are ESM-only; ownKeysEnabled only parses the model spec.
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

import { checkOpenRouterKey, ownKeysEnabled } from './openRouterKey'

const KEY = `sk-or-v1-${'b2'.repeat(32)}`

const answering = (status: number, data?: unknown) =>
  jest.fn().mockResolvedValue(
    new Response(JSON.stringify(data === undefined ? {} : { data }), {
      status,
    }),
  )

const info = (overrides: Record<string, unknown> = {}) => ({
  label: 'sk-or-v1-b2b…2b2',
  limit: null,
  limit_remaining: null,
  is_free_tier: false,
  is_management_key: false,
  effective_budget: null,
  ...overrides,
})

describe('checking an OpenRouter key', () => {
  test('a usable key passes, with what is left under its limit', async () => {
    const fetchImpl = answering(200, info({ limit_remaining: 4.5 }))
    await expect(checkOpenRouterKey(KEY, fetchImpl)).resolves.toEqual({
      ok: true,
      limitRemaining: 4.5,
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/key')
    expect(init.headers).toEqual({ Authorization: `Bearer ${KEY}` })
  })

  test('says why a key cannot pay for a question', async () => {
    const reason = async (fetchImpl: jest.Mock) =>
      ((await checkOpenRouterKey(KEY, fetchImpl)) as { reason?: string }).reason
    expect(await reason(answering(401))).toBe('own_key_invalid')
    expect(await reason(answering(429))).toBe('own_key_rate_limited')
    expect(await reason(answering(500))).toBe('own_key_unchecked')
    expect(await reason(answering(200, info({ is_free_tier: true })))).toBe(
      'own_key_no_credit',
    )
    expect(await reason(answering(200, info({ limit_remaining: 0 })))).toBe(
      'own_key_no_credit',
    )
    expect(
      await reason(
        answering(200, info({ effective_budget: { remaining_usd: -1 } })),
      ),
    ).toBe('own_key_no_credit')
    expect(
      await reason(answering(200, info({ is_management_key: true }))),
    ).toBe('own_key_invalid')
    expect(
      await reason(jest.fn().mockRejectedValue(new Error('offline'))),
    ).toBe('own_key_unchecked')
  })

  test('own keys need the sealing secret and an OpenRouter planner', () => {
    const secret = 'x'.repeat(40)
    expect(ownKeysEnabled({ AGENT_SEARCH_KEY_SECRET: secret })).toBe(true)
    expect(ownKeysEnabled({})).toBe(false)
    expect(
      ownKeysEnabled({
        AGENT_SEARCH_KEY_SECRET: secret,
        AGENT_SEARCH_MODEL: 'openai:gpt-6.1-sol',
      }),
    ).toBe(false)
  })
})
