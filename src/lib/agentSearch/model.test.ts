// The providers are ESM-only; these tests never build a provider model.
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))

import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import {
  EnvLanguageModel,
  MODEL_PRICES_USD_PER_MTOK,
  REASONING_DETAILS_KEY,
  agentSearchReasoningEffort,
  createProviderModel,
  estimateModelCostUsd,
  liftReasoningDetails,
  mergeReasoningDetails,
  parseModelSpec,
  plannerRouting,
  readModelCallUsage,
  resolveModelPrice,
  setModelUsageRecorder,
  withStepReasoning,
} from './model'
import { sealOwnKey } from './ownKey'

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
      expect.objectContaining({ finishReason: 'stop', reasoningTokens: 0 }),
    )
  })

  test('times a streamed call to its first output and its first action', async () => {
    providerStreaming([
      { type: 'stream-start', warnings: [] },
      { type: 'reasoning-delta', delta: 'thinking' },
      { type: 'tool-input-start', id: 'c1', toolName: 'bash' },
      {
        type: 'finish',
        usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
        finishReason: 'tool-calls',
      },
    ])
    const model = new EnvLanguageModel('openai:gpt-6.1-sol', 'wrun_1')
    await drain((await model.doStream({})).stream)
    const detail = mockRecordModelUsage.mock.calls[0][3]
    expect(Date.parse(detail.startedAt)).not.toBeNaN()
    expect(detail.firstOutputMs).toEqual(expect.any(Number))
    expect(detail.firstActionMs).toBeGreaterThanOrEqual(detail.firstOutputMs)
  })

  test('reads who served an OpenRouter call and what it cost, then drops the raw chunks', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const doStream = jest.fn().mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'raw',
            rawValue: { provider: 'DeepInfra' },
          })
          controller.enqueue({ type: 'text-delta', delta: 'hi' })
          controller.enqueue({
            type: 'raw',
            rawValue: { provider: 'DeepInfra', usage: { cost: 0.00042 } },
          })
          controller.enqueue({
            type: 'finish',
            usage: {
              inputTokens: { total: 1000, cacheRead: 0 },
              outputTokens: { total: 80, reasoning: 30 },
            },
            finishReason: { unified: 'stop', raw: 'stop' },
          })
          controller.close()
        },
      }),
    })
    ;(createOpenAICompatible as jest.Mock).mockReturnValue(() => ({ doStream }))
    const model = new EnvLanguageModel(
      'openrouter:deepseek/deepseek-v4.1-flash',
      'wrun_1',
    )
    const parts = await drain((await model.doStream({})).stream)
    expect(doStream).toHaveBeenCalledWith({ includeRawChunks: true })
    expect(parts.map((part: any) => part.type)).toEqual([
      'text-delta',
      'finish',
    ])
    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'wrun_1',
      'openrouter:deepseek/deepseek-v4.1-flash',
      { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 80 },
      expect.objectContaining({
        finishReason: 'stop',
        reasoningTokens: 30,
        servedBy: 'DeepInfra',
        providerCostUsd: 0.00042,
      }),
    )
    delete process.env.OPENROUTER_API_KEY
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

test('the usage recorder survives this module being evaluated again', async () => {
  const recorder = jest.fn().mockResolvedValue(undefined)
  setModelUsageRecorder(recorder)
  let fresh: typeof import('./model') | undefined
  jest.isolateModules(() => {
    fresh = jest.requireActual('./model') as typeof import('./model')
  })
  const doStream = jest.fn().mockResolvedValue({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'finish', usage: {}, finishReason: 'stop' })
        controller.close()
      },
    }),
  })
  ;(createOpenAI as jest.Mock).mockReturnValue(() => ({ doStream }))
  process.env.OPENAI_API_KEY = 'test-key'
  const model = new fresh!.EnvLanguageModel('openai:gpt-6.1-sol', 'wrun_1')
  const reader = (await model.doStream({})).stream.getReader()
  while (!(await reader.read()).done);
  expect(recorder).toHaveBeenCalled()
  setModelUsageRecorder(null)
  delete process.env.OPENAI_API_KEY
})

describe('EnvLanguageModel on a member’s own key', () => {
  const KEY = `sk-or-v1-${'c3'.repeat(32)}`
  const SECRET = 'a server secret that is long enough to use'
  const SPEC = 'openrouter:deepseek/deepseek-v4.1-flash'
  const serialize = (EnvLanguageModel as any)[Symbol.for('workflow-serialize')]
  const deserialize = (EnvLanguageModel as any)[
    Symbol.for('workflow-deserialize')
  ]
  const recorder = jest.fn()

  beforeEach(() => {
    recorder.mockReset().mockResolvedValue(undefined)
    setModelUsageRecorder(recorder)
    ;(createOpenAICompatible as jest.Mock).mockReset()
    process.env.AGENT_SEARCH_KEY_SECRET = SECRET
    process.env.OPENROUTER_API_KEY = 'house-key'
  })

  afterEach(() => {
    setModelUsageRecorder(null)
    delete process.env.AGENT_SEARCH_KEY_SECRET
    delete process.env.OPENROUTER_API_KEY
  })

  const streamOf = (parts: unknown[]) =>
    new ReadableStream({
      start(controller) {
        parts.forEach((part) => controller.enqueue(part))
        controller.close()
      },
    })

  test('crosses steps sealed, and calls OpenRouter with the member’s key, not the house’s', async () => {
    const sealed = await sealOwnKey(KEY, 'asr_1', SECRET)
    const data = serialize(new EnvLanguageModel(SPEC, 'asr_1', sealed))
    expect(data).toEqual({ spec: SPEC, runId: 'asr_1', sealedKey: sealed })
    expect(JSON.stringify(data)).not.toContain(KEY)

    const doStream = jest.fn().mockResolvedValue({
      stream: streamOf([
        {
          type: 'finish',
          usage: { inputTokens: { total: 10 }, outputTokens: { total: 2 } },
          finishReason: 'stop',
        },
      ]),
    })
    ;(createOpenAICompatible as jest.Mock).mockReturnValue(() => ({ doStream }))
    const model = deserialize(data)
    const reader = (await model.doStream({})).stream.getReader()
    while (!(await reader.read()).done);
    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: KEY }),
    )
    // Its usage is recorded as the member's, which keeps it off house spend.
    expect(recorder).toHaveBeenCalledWith(
      'asr_1',
      SPEC,
      expect.anything(),
      expect.objectContaining({ ownKey: true }),
    )
  })

  test('a refusal by OpenRouter says what is wrong with the key', async () => {
    const sealed = await sealOwnKey(KEY, 'asr_1', SECRET)
    const refusal = Object.assign(new Error('Payment Required'), {
      statusCode: 402,
    })
    ;(createOpenAICompatible as jest.Mock).mockReturnValue(() => ({
      doStream: jest.fn().mockRejectedValue(refusal),
    }))
    await expect(
      new EnvLanguageModel(SPEC, 'asr_1', sealed).doStream({}),
    ).rejects.toThrow('Your OpenRouter key has no credit left.')
  })

  test('without the sealing secret, nothing is called at all', async () => {
    const sealed = await sealOwnKey(KEY, 'asr_1', SECRET)
    delete process.env.AGENT_SEARCH_KEY_SECRET
    await expect(
      new EnvLanguageModel(SPEC, 'asr_1', sealed).doStream({}),
    ).rejects.toThrow('Using your own key is not available right now.')
    expect(createOpenAICompatible).not.toHaveBeenCalled()
  })
})

describe('planner reasoning effort', () => {
  test('uses the model’s entry, the env override, or nothing', () => {
    const deepseek = 'openrouter:deepseek/deepseek-v4.1-flash'
    expect(agentSearchReasoningEffort(deepseek, undefined)).toBe('high')
    expect(agentSearchReasoningEffort('openai:gpt-6.1-sol', undefined)).toBe(
      'medium',
    )
    expect(agentSearchReasoningEffort(deepseek, ' LOW ')).toBe('low')
    expect(agentSearchReasoningEffort(deepseek, 'default')).toBeNull()
    expect(agentSearchReasoningEffort('openrouter:x/unlisted', '')).toBeNull()
    expect(() => agentSearchReasoningEffort(deepseek, 'loud')).toThrow(
      'Invalid AGENT_SEARCH_REASONING_EFFORT',
    )
  })

  test('OpenRouter calls carry the effort in the request body', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    ;(createOpenAICompatible as jest.Mock)
      .mockReset()
      .mockReturnValue(() => ({ doGenerate: jest.fn() }))
    const realFetch = global.fetch
    const sent = jest.fn().mockResolvedValue(new Response('{}'))
    global.fetch = sent as any
    try {
      await new EnvLanguageModel(
        'openrouter:google/gemini-4-hydrogen',
      ).doGenerate({})
      const { fetch } = (createOpenAICompatible as jest.Mock).mock.calls[0][0]
      await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'google/gemini-4-hydrogen' }),
      })
      const body = JSON.parse(sent.mock.calls[0][1].body)
      expect(body.reasoning).toEqual({ effort: 'medium' })
      expect(body.provider).toEqual({
        preferred_max_latency: { p90: 2 },
        data_collection: 'deny',
        zdr: true,
      })
    } finally {
      global.fetch = realFetch
      delete process.env.OPENROUTER_API_KEY
    }
  })

  test('OpenAI calls ask for the effort unless the caller chose one', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const doGenerate = jest.fn().mockResolvedValue({ content: [] })
    ;(createOpenAI as jest.Mock).mockReset().mockReturnValue(() => ({
      doGenerate,
    }))
    const model = new EnvLanguageModel('openai:gpt-6.1-sol')
    await model.doGenerate({ prompt: [] })
    await model.doGenerate({
      providerOptions: { openai: { reasoningEffort: 'low' } },
    })
    expect(doGenerate.mock.calls[0][0].providerOptions).toEqual({
      openai: { reasoningEffort: 'medium' },
    })
    expect(doGenerate.mock.calls[1][0].providerOptions).toEqual({
      openai: { reasoningEffort: 'low' },
    })
    delete process.env.OPENAI_API_KEY
  })
})

describe('reasoning details across tool calls', () => {
  const SPEC = 'openrouter:google/gemini-3.5-flash-lite'
  const encrypted = {
    type: 'reasoning.encrypted',
    data: 'c2lnbmF0dXJl',
    format: 'google-gemini-v1',
    index: 0,
  }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    ;(createOpenAICompatible as jest.Mock).mockReset()
  })
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
  })

  test('streamed pieces of one detail join; a new index starts another', () => {
    let details = mergeReasoningDetails(
      [],
      [{ type: 'reasoning.text', text: 'Let me ', index: 0, signature: null }],
    )
    details = mergeReasoningDetails(details, [
      { type: 'reasoning.text', text: 'think.', index: 0, signature: 'sig' },
      { ...encrypted, index: 1 },
    ])
    details = mergeReasoningDetails(details, undefined)
    expect(details).toEqual([
      {
        type: 'reasoning.text',
        text: 'Let me think.',
        index: 0,
        signature: 'sig',
      },
      { ...encrypted, index: 1 },
    ])
  })

  test('a step’s details ride on its first tool call only', () => {
    const parts = [
      { type: 'text', text: 'checking' },
      {
        type: 'tool-call',
        toolCallId: 'a',
        providerMetadata: { other: { x: 1 } },
      },
      { type: 'tool-call', toolCallId: 'b' },
    ]
    const out = withStepReasoning(parts, [encrypted])
    expect(out[0]).toBe(parts[0])
    expect(out[1]).toEqual({
      ...parts[1],
      providerMetadata: {
        other: { x: 1 },
        [REASONING_DETAILS_KEY]: { reasoning_details: [encrypted] },
      },
    })
    expect(out[2]).toBe(parts[2])
    expect(withStepReasoning(parts, [])).toBe(parts)
  })

  test('details on a tool call go back on its message before the next call', () => {
    const prompt = [
      { role: 'user', content: [{ type: 'text', text: 'q' }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'a',
            providerOptions: {
              [REASONING_DETAILS_KEY]: { reasoning_details: [encrypted] },
            },
          },
        ],
        providerOptions: { openaiCompatible: { name: 'x' } },
      },
      { role: 'tool', content: [] },
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    ]
    const lifted = liftReasoningDetails(prompt)
    expect(lifted[0]).toBe(prompt[0])
    expect(lifted[1].providerOptions).toEqual({
      openaiCompatible: { name: 'x', reasoning_details: [encrypted] },
    })
    expect(lifted[2]).toBe(prompt[2])
    expect(lifted[3]).toBe(prompt[3])
  })

  test('a streamed call holds its tool calls until the end, with the reasoning streamed after them', async () => {
    const doStream = jest.fn().mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'a',
            input: '{}',
          })
          controller.enqueue({
            type: 'raw',
            rawValue: {
              choices: [{ delta: { reasoning_details: [encrypted] } }],
            },
          })
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'b',
            input: '{}',
          })
          controller.enqueue({
            type: 'finish',
            usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
            finishReason: 'tool-calls',
          })
          controller.close()
        },
      }),
    })
    ;(createOpenAICompatible as jest.Mock).mockReturnValue(() => ({ doStream }))
    const earlier = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'z',
            providerOptions: {
              [REASONING_DETAILS_KEY]: { reasoning_details: [encrypted] },
            },
          },
        ],
      },
    ]
    const result = await new EnvLanguageModel(SPEC).doStream({
      prompt: earlier,
    })
    const parts: any[] = []
    const reader = result.stream.getReader()
    for (let r = await reader.read(); !r.done; r = await reader.read())
      parts.push(r.value)
    expect(parts.map((part) => part.type)).toEqual([
      'tool-call',
      'tool-call',
      'finish',
    ])
    expect(parts[0].providerMetadata).toEqual({
      [REASONING_DETAILS_KEY]: { reasoning_details: [encrypted] },
    })
    expect(parts[1].providerMetadata).toBeUndefined()
    const sent = doStream.mock.calls[0][0]
    expect(sent.includeRawChunks).toBe(true)
    expect(sent.prompt[0].providerOptions.openaiCompatible).toEqual({
      reasoning_details: [encrypted],
    })
  })

  test('a generated call puts the response’s details on its first tool call', async () => {
    const doGenerate = jest.fn().mockResolvedValue({
      content: [{ type: 'tool-call', toolCallId: 'a', input: '{}' }],
      response: {
        body: { choices: [{ message: { reasoning_details: [encrypted] } }] },
      },
    })
    ;(createOpenAICompatible as jest.Mock).mockReturnValue(() => ({
      doGenerate,
    }))
    const result = await new EnvLanguageModel(SPEC).doGenerate({})
    expect(result.content[0].providerMetadata).toEqual({
      [REASONING_DETAILS_KEY]: { reasoning_details: [encrypted] },
    })
  })
})

describe('planner provider routing', () => {
  const ENV_KEYS = [
    'OPENROUTER_API_KEY',
    'AGENT_SEARCH_PROVIDER_ONLY',
    'AGENT_SEARCH_PROVIDER_IGNORE',
    'AGENT_SEARCH_PROVIDER_MAX_LATENCY_P90',
  ]
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
  })

  // The body the fetch wrapper sends for a request with `provider` already set.
  async function sentBody(
    build: () => unknown,
    request: Record<string, unknown> = {},
  ) {
    process.env.OPENROUTER_API_KEY = 'test-key'
    ;(createOpenAICompatible as jest.Mock)
      .mockReset()
      .mockReturnValue(() => ({ doGenerate: jest.fn() }))
    const realFetch = global.fetch
    const sent = jest.fn().mockResolvedValue(new Response('{}'))
    global.fetch = sent as any
    try {
      await build()
      const { fetch } = (createOpenAICompatible as jest.Mock).mock.calls[0][0]
      await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'x', ...request }),
      })
      return JSON.parse(sent.mock.calls[0][1].body)
    } finally {
      global.fetch = realFetch
    }
  }

  test('reads the session, latency preference and slugs', () => {
    expect(plannerRouting('asr_1', {})).toEqual({
      sessionId: 'asr_1',
      maxLatencyP90: 2,
    })
    expect(
      plannerRouting(null, {
        AGENT_SEARCH_PROVIDER_MAX_LATENCY_P90: ' 1.5 ',
        AGENT_SEARCH_PROVIDER_ONLY: 'together, baseten/fast,',
        AGENT_SEARCH_PROVIDER_IGNORE: 'decart',
      }),
    ).toEqual({
      maxLatencyP90: 1.5,
      only: ['together', 'baseten/fast'],
      ignore: ['decart'],
    })
    expect(
      plannerRouting(null, { AGENT_SEARCH_PROVIDER_MAX_LATENCY_P90: 'OFF' }),
    ).toEqual({ maxLatencyP90: null })
    for (const bad of ['0', '-1', 'fast']) {
      expect(() =>
        plannerRouting(null, { AGENT_SEARCH_PROVIDER_MAX_LATENCY_P90: bad }),
      ).toThrow('Invalid AGENT_SEARCH_PROVIDER_MAX_LATENCY_P90')
    }
  })

  test('a run’s calls carry its id as the session and no usage flag', async () => {
    setModelUsageRecorder(jest.fn().mockResolvedValue(undefined))
    const body = await sentBody(() =>
      new EnvLanguageModel(
        'openrouter:deepseek/deepseek-v4.1-flash-1017',
        'asr_abc',
      ).doGenerate({}),
    ).finally(() => setModelUsageRecorder(null))
    expect(body.session_id).toBe('asr_abc')
    expect(body.usage).toBeUndefined()
    expect(body.reasoning).toEqual({ effort: 'high' })
    expect(body.provider).toEqual({
      preferred_max_latency: { p90: 2 },
      data_collection: 'deny',
      zdr: true,
    })
  })

  test('without a run, the session id is the one given (the eval)', async () => {
    const body = await sentBody(() =>
      new EnvLanguageModel(
        'openrouter:z-ai/glm-5.3-flash',
        null,
        null,
        'eval-1',
      ).doGenerate({}),
    )
    expect(body.session_id).toBe('eval-1')
    expect(body.reasoning).toEqual({ effort: 'high' })
  })

  test('pins and skips hosts, and never loses the no-retention flags', async () => {
    process.env.AGENT_SEARCH_PROVIDER_ONLY = 'baseten/fast'
    process.env.AGENT_SEARCH_PROVIDER_IGNORE = 'decart'
    process.env.AGENT_SEARCH_PROVIDER_MAX_LATENCY_P90 = 'off'
    const body = await sentBody(
      () =>
        new EnvLanguageModel(
          'openrouter:deepseek/deepseek-v4.1-flash-1017',
        ).doGenerate({}),
      { provider: { zdr: false, data_collection: 'allow' } },
    )
    expect(body.session_id).toBeUndefined()
    expect(body.provider).toEqual({
      only: ['baseten/fast'],
      ignore: ['decart'],
      data_collection: 'deny',
      zdr: true,
    })
  })

  test('the scorer’s calls carry only the no-retention flags', async () => {
    process.env.AGENT_SEARCH_PROVIDER_ONLY = 'together'
    const body = await sentBody(() =>
      (createProviderModel('openrouter:typesafe/jev-1') as any).doGenerate({}),
    )
    expect(body.provider).toEqual({ data_collection: 'deny', zdr: true })
    expect(body.session_id).toBeUndefined()
  })

  test('the session id survives the workflow step boundary', () => {
    const SERIALIZE = Symbol.for('workflow-serialize')
    const DESERIALIZE = Symbol.for('workflow-deserialize')
    const model = new EnvLanguageModel('openrouter:x/y', null, null, 'eval-2')
    const data = (EnvLanguageModel as any)[SERIALIZE](model)
    expect(data).toEqual({ spec: 'openrouter:x/y', sessionId: 'eval-2' })
    const back = (EnvLanguageModel as any)[DESERIALIZE](data)
    expect(back.sessionId).toBe('eval-2')
  })

  test('prices and efforts exist for the strict-ZDR pilot models', () => {
    for (const spec of [
      'openrouter:deepseek/deepseek-v4.1-flash-1017',
      'openrouter:z-ai/glm-5.3-flash',
    ]) {
      expect(MODEL_PRICES_USD_PER_MTOK[spec]).toBeDefined()
      expect(agentSearchReasoningEffort(spec, undefined)).toBe('high')
    }
  })
})
