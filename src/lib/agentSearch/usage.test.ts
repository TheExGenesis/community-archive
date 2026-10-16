// ai and the providers are ESM-only; these tests use neither for real.
jest.mock('ai', () => ({}))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(),
}))
const mockAddUsage = jest.fn()
const mockLogModelCall = jest.fn()
jest.mock('./runStore', () => ({
  getAgentSearchRunStore: () => ({
    addUsage: mockAddUsage,
    logModelCall: mockLogModelCall,
  }),
}))

import { ScoringError } from './classifier'
import { EnvLanguageModel } from './model'
import { recordModelUsage, recordRunUsage, withRecordedCost } from './usage'

describe('agent search usage recording', () => {
  beforeEach(() => {
    mockAddUsage.mockReset().mockResolvedValue(undefined)
    mockLogModelCall.mockReset().mockResolvedValue(undefined)
  })

  test('a paid tool adds its cost to the run before returning', async () => {
    const result = await withRecordedCost('wrun_1', async () => ({
      kept: [],
      costUsd: 0.04,
    }))
    expect(result.costUsd).toBe(0.04)
    expect(mockAddUsage).toHaveBeenCalledWith('wrun_1', { costUsd: 0.04 })
  })

  test('a paid tool that throws still adds what it spent', async () => {
    await expect(
      withRecordedCost('wrun_1', async () => {
        throw new ScoringError('Decisions scoring failed for 30 of 100', 0.02)
      }),
    ).rejects.toThrow('Decisions scoring failed')
    expect(mockAddUsage).toHaveBeenCalledWith('wrun_1', { costUsd: 0.02 })
  })

  test('free results and plain errors write nothing', async () => {
    await withRecordedCost('wrun_1', async () => ({ tweets: [] }))
    await expect(
      withRecordedCost('wrun_1', async () => {
        throw new Error('gateway down')
      }),
    ).rejects.toThrow('gateway down')
    expect(mockAddUsage).not.toHaveBeenCalled()
  })

  test('retries one failed write, then gives up loudly', async () => {
    mockAddUsage.mockRejectedValueOnce(new Error('blip'))
    await recordRunUsage('wrun_1', { costUsd: 0.1 })
    expect(mockAddUsage).toHaveBeenCalledTimes(2)

    mockAddUsage.mockReset().mockRejectedValue(new Error('down'))
    await expect(recordRunUsage('wrun_1', { costUsd: 0.1 })).rejects.toThrow(
      'down',
    )
  })

  test('prices a planner call at the planner price', async () => {
    await recordModelUsage('wrun_1', 'openai:gpt-6.1-sol', {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 100_000,
    })
    expect(mockAddUsage).toHaveBeenCalledWith('wrun_1', {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      costUsd: 3,
    })
  })

  test('a call on the member’s own key adds tokens but no house spend', async () => {
    const usage = {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 100_000,
    }
    await recordModelUsage('wrun_1', 'openai:gpt-6.1-sol', usage, {
      ms: 10,
      ownKey: true,
    })
    expect(mockAddUsage).toHaveBeenCalledWith('wrun_1', {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      costUsd: 0,
    })
    // The call log keeps the estimate, for comparing models.
    expect(mockLogModelCall).toHaveBeenCalledWith(
      'wrun_1',
      expect.objectContaining({ estimatedCostUsd: 3, ownKey: true }),
    )
  })

  test('logs a call with its details, and a failed log line does not fail it', async () => {
    const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 10 }
    const detail = { ms: 900, servedBy: 'DeepInfra', providerCostUsd: 0.0001 }
    await recordModelUsage('wrun_1', 'openai:gpt-6.1-sol', usage, detail)
    expect(mockLogModelCall).toHaveBeenCalledWith(
      'wrun_1',
      expect.objectContaining({
        model: 'openai:gpt-6.1-sol',
        ...usage,
        ...detail,
        estimatedCostUsd: 0.0021,
      }),
    )

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockLogModelCall.mockRejectedValue(new Error('disk full'))
    await expect(
      recordModelUsage('wrun_1', 'openai:gpt-6.1-sol', usage, detail),
    ).resolves.toBeUndefined()
    warn.mockRestore()
  })

  test('loading this module registers the model usage recorder', async () => {
    const { createOpenAI } = jest.requireMock('@ai-sdk/openai')
    process.env.OPENAI_API_KEY = 'test-key'
    createOpenAI.mockReturnValue(() => ({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'finish',
              usage: { inputTokens: { total: 10 }, outputTokens: { total: 1 } },
            })
            controller.close()
          },
        }),
      }),
    }))
    const model = new EnvLanguageModel('openai:gpt-6.1-sol', 'wrun_9')
    const reader = (await model.doStream({})).stream.getReader()
    while (!(await reader.read()).done);
    expect(mockAddUsage).toHaveBeenCalledWith(
      'wrun_9',
      expect.objectContaining({ inputTokens: 10, outputTokens: 1 }),
    )
    delete process.env.OPENAI_API_KEY
  })
})
