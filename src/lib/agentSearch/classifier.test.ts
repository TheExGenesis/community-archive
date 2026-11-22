// ai and the providers are ESM-only; scorer selection needs neither.
jest.mock('ai', () => ({}))
jest.mock('./model', () => ({}))

import { agentSearchScorer, ScoringError, scoreTweets } from './classifier'

describe('Decisions scoring cost', () => {
  const realFetch = global.fetch

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AGENT_SEARCH_SCORER
  })

  afterEach(() => {
    global.fetch = realFetch
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENROUTER_API_KEY
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

  test('starts no Decisions call after the run’s deadline', async () => {
    const fetchMock = fetchAnsweringFirst(100)
    global.fetch = fetchMock as never
    const error = await scoreTweets('criterion', items(10), {
      deadlineAt: Date.now() - 1,
    }).catch((e) => e)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(error).toBeInstanceOf(ScoringError)
    expect(error.message).toContain('time limit')
    expect(error.costUsd).toBe(0)
  })

  test('a batch with few failures returns its cost', async () => {
    global.fetch = fetchAnsweringFirst(100) as never
    const result = await scoreTweets('criterion', items(10))
    expect(result.scores.size).toBe(10)
    expect(result.costUsd).toBeCloseTo(0.001)
  })

  test('falls back to Jev when Decisions fails with 401 and stops issuing extra OpenAI calls', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key'
    let openaiCalls = 0
    let jevCalls = 0
    global.fetch = jest.fn(async (url: string, init: { body: string }) => {
      if (url.includes('api.openai.com')) {
        openaiCalls += 1
        return { ok: false, status: 401, headers: new Map() }
      }
      jevCalls += 1
      const body = JSON.parse(init.body) as {
        state: { records: Array<{ id: string }> }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          answers: Object.fromEntries(
            body.state.records.map((r) => [r.id, { noul: 0.75 }]),
          ),
          usage: { cost: 0.002 },
        }),
      }
    }) as never

    const result = await scoreTweets('criterion', items(150))
    expect(result.scorer).toBe('jev')
    expect(result.scores.size).toBe(150)
    expect(result.scores.get('1')).toBe(0.75)
    // 150 posts in batches of 50 = 3 Jev calls at $0.002 each.
    expect(jevCalls).toBe(3)
    expect(result.costUsd).toBeCloseTo(0.006)
    // Auth failure aborts remaining queued items instead of hitting OpenAI 150 times.
    expect(openaiCalls).toBeLessThan(150)
  })

  test('fallback preserves partial Decisions cost on success and on double failure', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key'
    const partialDecisions = fetchAnsweringFirst(8)
    global.fetch = jest.fn(async (url: string, init: { body: string }) => {
      if (url.includes('api.openai.com')) return partialDecisions(url, init)
      const body = JSON.parse(init.body) as {
        state: { records: Array<{ id: string }> }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          answers: Object.fromEntries(
            body.state.records.map((r) => [r.id, { noul: 0.6 }]),
          ),
          usage: { cost: 0.0012 },
        }),
      }
    }) as never

    const okResult = await scoreTweets('criterion', items(10))
    expect(okResult.scorer).toBe('jev')
    expect(okResult.scores.size).toBe(10)
    // $0.0008 partial OpenAI Decisions + $0.0012 Jev.
    expect(okResult.costUsd).toBeCloseTo(0.002)

    // When Jev also fails, throw ScoringError carrying both costs.
    global.fetch = jest.fn(async (url: string, init: { body: string }) => {
      if (url.includes('api.openai.com')) return partialDecisions(url, init)
      return { ok: false, status: 503, headers: new Map() }
    }) as never
    const err = await scoreTweets('criterion', items(10)).catch((e) => e)
    expect(err).toBeInstanceOf(ScoringError)
    expect(err.message).toContain('2 of 10')
    expect(err.message).toContain('fallback Jev scoring failed')
    expect(err.costUsd).toBeCloseTo(0.0008)
  })

  test('does not fall back to Jev after the run deadline has passed', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key'
    const fetchMock = jest.fn()
    global.fetch = fetchMock as never
    const error = await scoreTweets('criterion', items(10), {
      deadlineAt: Date.now() - 1,
    }).catch((e) => e)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(error).toBeInstanceOf(ScoringError)
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
