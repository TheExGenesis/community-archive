// The providers are ESM-only; these tests never build a provider model.
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

import { createOpenAI } from '@ai-sdk/openai'
import {
  EnvLanguageModel,
  MODEL_PRICES_USD_PER_MTOK,
  estimateModelCostUsd,
  parseModelSpec,
  readModelCallUsage,
  resolveModelPrice,
  setModelUsageRecorder,
} from './model'

const mockRecordModelUsage = jest.fn()

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

  test('an unpriced model has no price and cannot be estimated', () => {
    expect(resolveModelPrice('openrouter:x/y')).toBeNull()
    // Both input and output are needed.
    expect(resolveModelPrice('openrouter:x/y', { input: '3' })).toBeNull()
    expect(() =>
      estimateModelCostUsd('openrouter:x/y', { inputTokens: 1e6 }),
    ).toThrow('No price')
    expect(
      estimateModelCostUsd(
        'openrouter:x/y',
        { inputTokens: 1e6, cachedInputTokens: 5e5, outputTokens: 1e6 },
        { input: '3', output: '15' },
      ),
    ).toBeCloseTo(1.5 + 1.5 + 15)
  })

  test('rejects malformed, negative or non-finite env prices', () => {
    for (const bad of ['abc', '-1', 'Infinity', 'NaN']) {
      expect(() =>
        resolveModelPrice('openai:gpt-6.1-sol', { input: bad }),
      ).toThrow('Invalid input price')
    }
    expect(() =>
      resolveModelPrice('openai:gpt-6.1-sol', { output: '-0.5' }),
    ).toThrow('Invalid output price')
    // Blank means unset.
    expect(resolveModelPrice('openai:gpt-6.1-sol', { input: ' ' })).toEqual(
      MODEL_PRICES_USD_PER_MTOK['openai:gpt-6.1-sol'],
    )
  })

  test('an input override also prices cached input unless that is set', () => {
    expect(resolveModelPrice('openai:gpt-6.1-sol', { input: '4' })).toEqual({
      input: 4,
      cachedInput: 4,
      output: 10,
    })
    expect(
      resolveModelPrice('openai:gpt-6.1-sol', {
        input: '4',
        cachedInput: '0.4',
      }),
    ).toEqual({ input: 4, cachedInput: 0.4, output: 10 })
  })

  test('reads V4 nested and older flat usage', () => {
    expect(
      readModelCallUsage({
        inputTokens: { total: 100, noCache: 60, cacheRead: 40 },
        outputTokens: { total: 7, text: 5, reasoning: 2 },
      }),
    ).toEqual({ inputTokens: 100, cachedInputTokens: 40, outputTokens: 7 })
    expect(
      readModelCallUsage({
        inputTokens: 10,
        cachedInputTokens: 3,
        outputTokens: 2,
      }),
    ).toEqual({ inputTokens: 10, cachedInputTokens: 3, outputTokens: 2 })
    expect(readModelCallUsage(undefined)).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
    })
  })
})

describe('EnvLanguageModel usage recording', () => {
  const serialize = (EnvLanguageModel as any)[Symbol.for('workflow-serialize')]
  const deserialize = (EnvLanguageModel as any)[
    Symbol.for('workflow-deserialize')
  ]

  beforeEach(() => {
    mockRecordModelUsage.mockReset().mockResolvedValue(undefined)
    setModelUsageRecorder(mockRecordModelUsage)
    ;(createOpenAI as jest.Mock).mockReset()
    process.env.OPENAI_API_KEY = 'test-key'
  })

  afterEach(() => {
    setModelUsageRecorder(null)
    delete process.env.OPENAI_API_KEY
  })

  const providerStreaming = (parts: unknown[]) => {
    const doStream = jest.fn().mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          parts.forEach((part) => controller.enqueue(part))
          controller.close()
        },
      }),
    })
    ;(createOpenAI as jest.Mock).mockReturnValue(() => ({ doStream }))
  }

  const drain = async (stream: ReadableStream<unknown>) => {
    const parts: unknown[] = []
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return parts
      parts.push(value)
    }
  }

  test('carries the run id across steps, still without keys', () => {
    const data = serialize(new EnvLanguageModel('openai:gpt-6.1-sol', 'wrun_1'))
    expect(data).toEqual({ spec: 'openai:gpt-6.1-sol', runId: 'wrun_1' })
    expect(deserialize(data).runId).toBe('wrun_1')
  })

  test('records a streamed call’s usage on its run when the call finishes', async () => {
    const usage = {
      inputTokens: { total: 1000, cacheRead: 200 },
      outputTokens: { total: 50 },
    }
    providerStreaming([
      { type: 'text-delta', delta: 'hi' },
      { type: 'finish', usage, finishReason: 'stop' },
    ])
    const model = new EnvLanguageModel('openai:gpt-6.1-sol', 'wrun_1')
    const result = await model.doStream({})
    const parts = await drain(result.stream)
    expect(parts).toHaveLength(2)
    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'wrun_1',
      'openai:gpt-6.1-sol',
      { inputTokens: 1000, cachedInputTokens: 200, outputTokens: 50 },
    )
  })

  test('records nothing without a run id', async () => {
    providerStreaming([{ type: 'finish', usage: {}, finishReason: 'stop' }])
    const model = new EnvLanguageModel('openai:gpt-6.1-sol')
    await drain((await model.doStream({})).stream)
    expect(mockRecordModelUsage).not.toHaveBeenCalled()
  })

  test('fails closed when no recorder is registered', async () => {
    setModelUsageRecorder(null)
    providerStreaming([{ type: 'finish', usage: {}, finishReason: 'stop' }])
    const model = new EnvLanguageModel('openai:gpt-6.1-sol', 'wrun_1')
    await expect(drain((await model.doStream({})).stream)).rejects.toThrow(
      'not registered',
    )
  })

  test('a failed usage write fails the call', async () => {
    mockRecordModelUsage.mockRejectedValue(new Error('store down'))
    providerStreaming([{ type: 'finish', usage: {}, finishReason: 'stop' }])
    const model = new EnvLanguageModel('openai:gpt-6.1-sol', 'wrun_1')
    await expect(drain((await model.doStream({})).stream)).rejects.toThrow(
      'store down',
    )
  })
})
