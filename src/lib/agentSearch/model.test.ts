// The providers are ESM-only; these tests never build a provider model.
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

import { EnvLanguageModel, estimateModelCostUsd, parseModelSpec } from './model'

describe('agent search model', () => {
  test('parses provider:model specs', () => {
    expect(parseModelSpec('openrouter:anthropic/claude-sonnet-5.5')).toEqual({
      provider: 'openrouter',
      modelId: 'anthropic/claude-sonnet-5.5',
    })
    expect(() => parseModelSpec('gpt-6.1-sol')).toThrow()
    expect(() => parseModelSpec('anthropic:claude')).toThrow()
  })

  test('serializes as its spec only, never provider config or keys', () => {
    const serialize = (EnvLanguageModel as any)[
      Symbol.for('workflow-serialize')
    ]
    const deserialize = (EnvLanguageModel as any)[
      Symbol.for('workflow-deserialize')
    ]
    const data = serialize(new EnvLanguageModel('openai:gpt-6.1-sol'))
    expect(data).toEqual({ spec: 'openai:gpt-6.1-sol' })
    expect(deserialize(data)).toBeInstanceOf(EnvLanguageModel)
  })

  test('prices listed models, with cached input at the cached rate', () => {
    expect(
      estimateModelCostUsd('openai:gpt-6.1-sol', {
        inputTokens: 1_000_000,
        cachedInputTokens: 500_000,
        outputTokens: 100_000,
      }),
    ).toBeCloseTo(0.5 * 2 + 0.5 * 0.1 + 0.1 * 10)
  })

  test('unknown models cost nothing unless priced by env', () => {
    expect(estimateModelCostUsd('openrouter:x/y', { inputTokens: 1e6 })).toBe(0)
    expect(
      estimateModelCostUsd(
        'openrouter:x/y',
        { inputTokens: 1e6 },
        { input: '3' },
      ),
    ).toBe(3)
  })
})
