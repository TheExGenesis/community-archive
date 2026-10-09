// ai and the providers are ESM-only; scorer selection needs neither.
jest.mock('ai', () => ({}))
jest.mock('./model', () => ({}))

import { agentSearchScorer, ScoringError, scoreTweets } from './classifier'

describe('Decisions scoring cost', () => {
  const realFetch = global.fetch

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    delete process.env.AGENT_SEARCH_SCORER
  })

  afterEach(() => {
    global.fetch = realFetch
    delete process.env.OPENAI_API_KEY
  })

  const items = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: String(i + 1), text: `t${i}` }))

  // Posts 1-8 are answered at 1,000 input tokens each; the rest are refused.
  const fetchAnsweringFirst = (answered: number) =>
    jest.fn(async (_url: string, init: { body: string }) => {
      const id = Number(JSON.parse(init.body).input.match(/t(\d+)/)[1]) + 1
      if (id > answered) return { ok: false, status: 400, headers: new Map() }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          answers: [{ name: 'match', probability: 0.9 }],
          usage: { input_tokens: 1000 },
        }),
      }
    })

  test('a mostly failed batch throws with the cost of the calls that succeeded', async () => {
    global.fetch = fetchAnsweringFirst(8) as never
    const error = await scoreTweets('criterion', items(10)).catch((e) => e)
    expect(error).toBeInstanceOf(ScoringError)
    expect(error.message).toContain('2 of 10')
    // 8 answered calls x 1,000 tokens at $0.10 per million.
    expect(error.costUsd).toBeCloseTo(0.0008)
  })

  test('a batch with few failures returns its cost', async () => {
    global.fetch = fetchAnsweringFirst(100) as never
    const result = await scoreTweets('criterion', items(10))
    expect(result.scores.size).toBe(10)
    expect(result.costUsd).toBeCloseTo(0.001)
  })
})

const env = (vars: Record<string, string>) =>
  vars as unknown as NodeJS.ProcessEnv

describe('agentSearchScorer', () => {
  test('defaults to Decisions, then Jev, then the LLM, by available key', () => {
    expect(
      agentSearchScorer(
        env({
          OPENAI_API_KEY: 'k',
          OPENROUTER_API_KEY: 'k',
        }),
      ),
    ).toBe('decisions')
    expect(agentSearchScorer(env({ OPENROUTER_API_KEY: 'k' }))).toBe('jev')
    expect(agentSearchScorer(env({}))).toBe('llm')
  })

  test('honours AGENT_SEARCH_SCORER only when its key exists', () => {
    expect(
      agentSearchScorer(
        env({
          OPENAI_API_KEY: 'k',
          OPENROUTER_API_KEY: 'k',
          AGENT_SEARCH_SCORER: 'jev',
        }),
      ),
    ).toBe('jev')
    expect(
      agentSearchScorer(
        env({
          OPENAI_API_KEY: 'k',
          AGENT_SEARCH_SCORER: 'llm',
        }),
      ),
    ).toBe('llm')
    expect(
      agentSearchScorer(
        env({
          OPENAI_API_KEY: 'k',
          AGENT_SEARCH_SCORER: 'jev',
        }),
      ),
    ).toBe('decisions')
  })
})
